/**
 * 内容管线 → Worker 桥接端点族（POST /api/content-sync[/check|/items]）。
 *
 * 职责边界（与 UpdateWorkflow / /api/trigger 完全隔离，互不调用）：
 * - 更新管线（Render runner 的 Node 进程）执行内容链（discover → fetch →
 *   translate），产出结构化文章数据后经本端点上传；Worker 侧只做校验 +
 *   D1 幂等写入。/check 供管线翻译前去重预检（含门禁拒绝负缓存读取），
 *   /items 供管线上报质量门禁拒绝（source_items 负缓存写入）。
 * - 本模块不触发 Workflow，不读取翻译 Secrets，不感知前端页面。
 *
 * 认证与限制：
 * - `Authorization: Bearer <CONTENT_SYNC_TOKEN>`（secret，生产用
 *   `wrangler secret put CONTENT_SYNC_TOKEN` 注入；本地 dev 需在
 *   wrangler.jsonc 的 vars 或测试 env 里提供）。缺失/不匹配一律 401，
 *   比较用 SHA-256 摘要常数时间比对。
 * - body 上限 MAX_BODY_BYTES（先查 content-length，再按实际字节数兜底）。
 * - 仅接受 POST + application/json。
 *
 * 幂等与原子性：
 * - articles 身份行 ON CONFLICT(source_id, original_url) 更新；版本行
 *   ON CONFLICT(article_id, language) 更新；分类先 DELETE 再 INSERT。
 *   同一 payload 重复提交结果不变（第二次 created=0）。
 * - 可选字段（image_url / author / excerpt / translation_model /
 *   original_alt_url）省略时保留现值：`COALESCE(excluded, existing)`。
 * - `translated_at` 例外：首次非空写入后冻结，`COALESCE(existing, excluded)`，
 *   重译不可覆盖（与 d1-article-repository 一致）。
 * - 全部语句经 db.batch() 执行；D1 单批上限 100 条，超过则按批拆分
 *   （每批原子，请求级原子性按批边界）。
 *
 * 两种载荷格式（可同时提交，同一事务序列内执行）：
 * 1. `sources` / `articles`：结构化 JSON，Worker 全量校验后映射到五张表。
 * 2. `sql`: string | string[]，DML-only 白名单（INSERT/REPLACE/UPDATE/DELETE），
 *    拒绝 DDL/DQL/事务控制与内嵌分号；幂等性由上传方保证（如 ON CONFLICT）。
 */

import { createHash } from 'node:crypto';
import { excerptFromMarkdown } from '../domain/article';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

// ── 限制常量 ──────────────────────────────────────────

/** body 上限（字节）。 */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** 单次请求最多文章数。 */
export const MAX_ARTICLES = 200;
/** 单次请求最多来源数。 */
export const MAX_SOURCES = 200;
/** 单次请求最多 SQL 语句数。 */
export const MAX_SQL_STATEMENTS = 200;
/** D1 batch 单批语句上限（Cloudflare 文档限制）。 */
export const D1_BATCH_LIMIT = 100;
/** 内容指纹算法版本：变更时全库重算跳过判定（等价于一次全量刷新）。 */
export const CONTENT_HASH_VERSION = 'v1';

/**
 * 版本级内容指纹（阶段 B，D1 写入预算）：单个语言版本「可比较内容」的
 * SHA-256。输入 = 该版本的 language/title/content_markdown/excerpt/
 * provenance/translation_model/original_alt_url。显式排除时间戳（translatedAt
 * 是过程时间不是内容）。
 *
 * 每个版本独立指纹、独立存于 article_versions.content_hash——改一个版本
 * 只重写该版本行，其它版本指纹不变，不会互相误伤。**不碰**
 * article_versions.rendered_html/rendered_hash（SSR 渲染缓存专用，
 * 见 src/lib/server/render-cache.ts）。
 *
 * @param version 版本
 * @param articleId 文章 id（加盐，防止跨文章同内容串指纹）
 */
export function computeVersionContentHash(version: SyncVersion, articleId: string): string {
  const hash = createHash('sha256');
  hash.update(CONTENT_HASH_VERSION);
  hash.update(`\u0000${articleId}\u0000${version.language}`);
  hash.update(`\u0000${version.title}\u0000${version.contentMarkdown}`);
  hash.update(`\u0000${version.provenance}\u0000${version.excerpt ?? ''}`);
  hash.update(`\u0000${version.translationModel ?? ''}\u0000${version.originalAltUrl ?? ''}`);
  return hash.digest('hex');
}

/** 幂等判定的哈希相等比较（比较字符串相等即可，不为时序用途）。 */
function hashEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a === b;
}

// ── 领域类型（桥接契约） ─────────────────────────────

/** 上传的来源注册表条目（articles 外键依赖）。 */
export interface SyncSource {
  id: string;
  name: string;
  type: 'company' | 'personal';
  homepageUrl: string;
  blogUrl: string;
  domain: string;
  rssUrl?: string;
  sitemapUrl?: string;
  logo?: string;
  avatar?: string;
}

/** 上传的语言版本（article_versions 行）。 */
export interface SyncVersion {
  language: string;
  title: string;
  contentMarkdown: string;
  excerpt?: string;
  provenance: 'original' | 'official-zh' | 'native-zh' | 'model';
  translationModel?: string;
  originalAltUrl?: string;
  translatedAt?: string;
}

/** 上传的文章（articles 身份 + versions + categories）。 */
export interface SyncArticle {
  id: string;
  sourceId: string;
  originalUrl: string;
  originalLanguage: string;
  publishedAt: string;
  imageUrl?: string;
  author?: string;
  sourceDomain: string;
  /** 省略 = 不触碰现有分类；提供（含空数组）= 整体替换。 */
  categories?: string[];
  /** 入库但不上线（缺省 true）；false 的文章会保存但 SSR 不展示。 */
  published?: boolean;
  qualityScore?: number;
  qualityModel?: string;
  versions: SyncVersion[];
}

/** 请求载荷：sources/articles（结构化）与 sql（DML 直通）可并存。 */
export interface SyncPayload {
  sources: SyncSource[];
  articles: SyncArticle[];
  sql: string[];
}

/** 处理成功后的统计。 */
export interface ContentSyncResult {
  ok: true;
  articles: {
    received: number;
    /** 本次新建的文章数。 */
    created: number;
    /** 本次已存在、被刷新（含版本/分类更新）的文章数。 */
    updated: number;
    /** 内容指纹相同、整篇跳过（零写入）的文章数。 */
    skipped: number;
  };
  sql: {
    statements: number;
    executed: number;
  };
  /** 实际执行的 D1 batch 数（每批 ≤ D1_BATCH_LIMIT 条）。 */
  batches: number;
}

/** 端点 env：D1 + Bearer secret（secret 未注入时端点拒绝服务）。 */
export interface ContentSyncEnv {
  DB: D1Database;
  CONTENT_SYNC_TOKEN?: string;
}

/** 载荷校验失败（400）；消息面向调用方（GitHub Actions），不泄露内部细节。 */
export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncPayloadError';
  }
}

const PROVENANCES = new Set(['original', 'official-zh', 'native-zh', 'model']);
const SOURCE_TYPES = new Set(['company', 'personal']);

// ── 纯校验函数 ───────────────────────────────────────

function requireString(value: unknown, field: string, where: string, max = 2048): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SyncPayloadError(`missing or invalid ${field} in ${where}`);
  }
  if (value.length > max) {
    throw new SyncPayloadError(`${field} in ${where} exceeds ${max} chars`);
  }
  return value;
}

function optionalNumber(value: unknown, key: string, where: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SyncPayloadError(`invalid ${key} in ${where}: expected finite number`);
  }
  return value;
}

function optionalString(value: unknown, field: string, where: string, max = 2048): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new SyncPayloadError(`invalid ${field} in ${where}: expected string`);
  }
  if (value.length > max) {
    throw new SyncPayloadError(`${field} in ${where} exceeds ${max} chars`);
  }
  return value;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseSource(value: unknown, index: number): SyncSource {
  const where = `sources[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncPayloadError(`${where} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const type = requireString(obj.type, 'type', where, 16);
  if (!SOURCE_TYPES.has(type)) {
    throw new SyncPayloadError(`invalid type in ${where}: expected 'company' or 'personal'`);
  }
  const source: SyncSource = {
    id: requireString(obj.id, 'id', where, 256),
    name: requireString(obj.name, 'name', where, 256),
    type: type as SyncSource['type'],
    homepageUrl: requireString(obj.homepageUrl, 'homepageUrl', where),
    blogUrl: requireString(obj.blogUrl, 'blogUrl', where),
    domain: requireString(obj.domain, 'domain', where, 255),
  };
  const rssUrl = optionalString(obj.rssUrl, 'rssUrl', where);
  const sitemapUrl = optionalString(obj.sitemapUrl, 'sitemapUrl', where);
  const logo = optionalString(obj.logo, 'logo', where);
  const avatar = optionalString(obj.avatar, 'avatar', where);
  if (rssUrl !== undefined) source.rssUrl = rssUrl;
  if (sitemapUrl !== undefined) source.sitemapUrl = sitemapUrl;
  if (logo !== undefined) source.logo = logo;
  if (avatar !== undefined) source.avatar = avatar;
  return source;
}

function parseVersion(value: unknown, articleIndex: number, versionIndex: number): SyncVersion {
  const where = `articles[${articleIndex}].versions[${versionIndex}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncPayloadError(`${where} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const provenance = requireString(obj.provenance, 'provenance', where, 16);
  if (!PROVENANCES.has(provenance)) {
    throw new SyncPayloadError(
      `invalid provenance in ${where}: expected one of ${[...PROVENANCES].join(', ')}`,
    );
  }
  const version: SyncVersion = {
    language: requireString(obj.language, 'language', where, 16),
    title: requireString(obj.title, 'title', where),
    contentMarkdown: requireString(obj.contentMarkdown, 'contentMarkdown', where, 2_000_000),
    provenance: provenance as SyncVersion['provenance'],
  };
  const excerpt = optionalString(obj.excerpt, 'excerpt', where, 1000);
  const translationModel = optionalString(obj.translationModel, 'translationModel', where, 256);
  const originalAltUrl = optionalString(obj.originalAltUrl, 'originalAltUrl', where);
  const translatedAt = optionalString(obj.translatedAt, 'translatedAt', where, 64);
  if (excerpt !== undefined) version.excerpt = excerpt;
  if (translationModel !== undefined) version.translationModel = translationModel;
  if (originalAltUrl !== undefined) version.originalAltUrl = originalAltUrl;
  if (translatedAt !== undefined) version.translatedAt = translatedAt;
  return version;
}

function parseArticle(value: unknown, index: number): SyncArticle {
  const where = `articles[${index}]`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncPayloadError(`${where} must be an object`);
  }
  const obj = value as Record<string, unknown>;

  const originalUrl = requireString(obj.originalUrl, 'originalUrl', where);
  if (!isValidHttpUrl(originalUrl)) {
    throw new SyncPayloadError(`invalid originalUrl in ${where}: must be an absolute http(s) URL`);
  }

  if (!Array.isArray(obj.versions) || obj.versions.length === 0) {
    throw new SyncPayloadError(`${where} must contain a non-empty versions array`);
  }
  const versions = obj.versions.map((v, vi) => parseVersion(v, index, vi));

  const article: SyncArticle = {
    id: requireString(obj.id, 'id', where, 512),
    sourceId: requireString(obj.sourceId, 'sourceId', where, 256),
    originalUrl,
    originalLanguage: requireString(obj.originalLanguage, 'originalLanguage', where, 16),
    publishedAt: requireString(obj.publishedAt, 'publishedAt', where, 64),
    sourceDomain: requireString(obj.sourceDomain, 'sourceDomain', where, 255),
    versions,
  };

  const imageUrl = optionalString(obj.imageUrl, 'imageUrl', where);
  const author = optionalString(obj.author, 'author', where, 256);
  if (imageUrl !== undefined) article.imageUrl = imageUrl;
  if (author !== undefined) article.author = author;

  // 「入库但不上线」（stage）：缺省上线；quality 字段供复审与模型升级重评
  if (obj.published !== undefined) {
    if (typeof obj.published !== 'boolean') throw new SyncPayloadError(`invalid published in ${where}: expected boolean`);
    article.published = obj.published;
  }
  const qualityScore = optionalNumber(obj.qualityScore, 'qualityScore', where);
  const qualityModel = optionalString(obj.qualityModel, 'qualityModel', where, 64);
  if (qualityScore !== undefined) article.qualityScore = qualityScore;
  if (qualityModel !== undefined) article.qualityModel = qualityModel;

  if (obj.categories !== undefined) {
    if (!Array.isArray(obj.categories)) {
      throw new SyncPayloadError(`invalid categories in ${where}: expected array`);
    }
    const categories: string[] = [];
    for (const [ci, cat] of obj.categories.entries()) {
      categories.push(requireString(cat, `categories[${ci}]`, where, 64));
    }
    article.categories = categories;
  }
  return article;
}

/**
 * SQL 语句白名单：仅允许 DML（INSERT/REPLACE/UPDATE/DELETE）开头。
 * 拒绝 DDL/DQL/事务控制/ATTACH 等，以及内嵌分号（防止多语句走私）。
 * 尾部分号容忍；空语句忽略。
 */
export function isAllowedSqlStatement(statement: string): boolean {
  const trimmed = statement.trim();
  if (trimmed === '') return true; // 空语句由调用方过滤
  if (!/^(INSERT|REPLACE|UPDATE|DELETE)\b/i.test(trimmed)) return false;
  // 去掉尾部 ';' 后不允许再出现 ';'
  const body = trimmed.replace(/;\s*$/, '');
  return !body.includes(';');
}

/** 归一化 sql 载荷：string（按 ';' 拆分）或 string[] → 非空语句数组。 */
export function normalizeSqlStatements(sql: unknown): string[] {
  let raw: string[];
  if (typeof sql === 'string') {
    raw = sql.split(';');
  } else if (Array.isArray(sql)) {
    raw = sql;
  } else {
    throw new SyncPayloadError('sql must be a string or an array of strings');
  }
  if (raw.length > MAX_SQL_STATEMENTS) {
    throw new SyncPayloadError(`too many sql statements: ${raw.length} (max ${MAX_SQL_STATEMENTS})`);
  }
  const statements: string[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== 'string') {
      throw new SyncPayloadError(`sql[${i}] must be a string`);
    }
    const trimmed = item.trim();
    if (trimmed === '') continue;
    if (!isAllowedSqlStatement(trimmed)) {
      throw new SyncPayloadError(
        `sql[${i}] rejected: only single INSERT/REPLACE/UPDATE/DELETE statements are allowed`,
      );
    }
    statements.push(trimmed.replace(/;\s*$/, ''));
  }
  return statements;
}

/**
 * 解析并校验请求体 JSON → SyncPayload。
 * 所有结构/取值问题抛 SyncPayloadError（调用方转 400）。
 */
export function parseSyncPayload(raw: string): SyncPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyncPayloadError('body is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SyncPayloadError('payload must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  const sources: SyncSource[] = [];
  if (obj.sources !== undefined) {
    if (!Array.isArray(obj.sources)) {
      throw new SyncPayloadError('sources must be an array');
    }
    if (obj.sources.length > MAX_SOURCES) {
      throw new SyncPayloadError(`too many sources: ${obj.sources.length} (max ${MAX_SOURCES})`);
    }
    sources.push(...obj.sources.map((s, i) => parseSource(s, i)));
  }

  const articles: SyncArticle[] = [];
  if (obj.articles !== undefined) {
    if (!Array.isArray(obj.articles)) {
      throw new SyncPayloadError('articles must be an array');
    }
    if (obj.articles.length > MAX_ARTICLES) {
      throw new SyncPayloadError(`too many articles: ${obj.articles.length} (max ${MAX_ARTICLES})`);
    }
    articles.push(...obj.articles.map((a, i) => parseArticle(a, i)));
  }

  const sql = obj.sql !== undefined ? normalizeSqlStatements(obj.sql) : [];

  if (articles.length === 0 && sql.length === 0 && sources.length === 0) {
    throw new SyncPayloadError('payload must contain articles, sources or sql');
  }

  // 载荷内重复检查（避免同一请求内互相打架）
  const ids = new Set<string>();
  for (const [i, a] of articles.entries()) {
    if (ids.has(a.id)) {
      throw new SyncPayloadError(`duplicate article id in articles[${i}]: ${a.id}`);
    }
    ids.add(a.id);
  }
  const urls = new Set<string>();
  for (const [i, a] of articles.entries()) {
    const key = articleKey(a.sourceId, a.originalUrl);
    if (urls.has(key)) {
      throw new SyncPayloadError(
        `duplicate (sourceId, originalUrl) in articles[${i}]: ${a.sourceId} / ${a.originalUrl}`,
      );
    }
    urls.add(key);
  }
  const sourceIds = new Set<string>();
  for (const [i, s] of sources.entries()) {
    if (sourceIds.has(s.id)) {
      throw new SyncPayloadError(`duplicate source id in sources[${i}]: ${s.id}`);
    }
    sourceIds.add(s.id);
  }

  return { sources, articles, sql };
}

// ── 写入语句构建（幂等 upsert）。注意：与 d1-article-repository 是两套刻意
// 不同的写入口径——本模块面向管线批量同步，可选字段（image_url/author/
// excerpt 等）冲突时 COALESCE 保留现值；repo 面向单篇编排直接覆盖。 ──

const SOURCE_UPSERT_SQL = `
  INSERT INTO sources (
    id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar, config
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    type = excluded.type,
    homepage_url = excluded.homepage_url,
    blog_url = excluded.blog_url,
    domain = excluded.domain,
    rss_url = excluded.rss_url,
    sitemap_url = excluded.sitemap_url,
    logo = excluded.logo,
    avatar = excluded.avatar,
    updated_at = datetime('now')
`;

const ARTICLE_UPSERT_SQL = `
  INSERT INTO articles (
    id, source_id, original_url, original_language, published_at,
    image_url, author, source_domain, published, quality_score, quality_model, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(source_id, original_url) DO UPDATE SET
    id = excluded.id,
    original_language = excluded.original_language,
    published_at = excluded.published_at,
    image_url = COALESCE(excluded.image_url, articles.image_url),
    author = COALESCE(excluded.author, articles.author),
    source_domain = excluded.source_domain,
    published = excluded.published,
    quality_score = excluded.quality_score,
    quality_model = excluded.quality_model,
    updated_at = CASE
      WHEN articles.id IS excluded.id
        AND articles.original_language IS excluded.original_language
        AND articles.published_at IS excluded.published_at
        AND articles.image_url IS COALESCE(excluded.image_url, articles.image_url)
        AND articles.author IS COALESCE(excluded.author, articles.author)
        AND articles.source_domain IS excluded.source_domain
        AND articles.published IS excluded.published
        AND articles.quality_score IS excluded.quality_score
        AND articles.quality_model IS excluded.quality_model
      THEN articles.updated_at
      ELSE datetime('now')
    END
`;

const VERSION_UPSERT_SQL = `
  INSERT INTO article_versions (
    article_id, language, title, content_markdown, excerpt, provenance,
    translation_model, original_alt_url, translated_at, content_hash, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(article_id, language) DO UPDATE SET
    title = excluded.title,
    content_markdown = excluded.content_markdown,
    excerpt = COALESCE(excluded.excerpt, article_versions.excerpt),
    provenance = excluded.provenance,
    translation_model = COALESCE(excluded.translation_model, article_versions.translation_model),
    original_alt_url = COALESCE(excluded.original_alt_url, article_versions.original_alt_url),
    translated_at = COALESCE(article_versions.translated_at, excluded.translated_at),
    content_hash = excluded.content_hash,
    updated_at = CASE
      WHEN article_versions.title IS excluded.title
        AND article_versions.content_markdown IS excluded.content_markdown
        AND article_versions.excerpt IS COALESCE(excluded.excerpt, article_versions.excerpt)
        AND article_versions.provenance IS excluded.provenance
        AND article_versions.translation_model IS COALESCE(excluded.translation_model, article_versions.translation_model)
        AND article_versions.original_alt_url IS COALESCE(excluded.original_alt_url, article_versions.original_alt_url)
        AND article_versions.translated_at IS COALESCE(article_versions.translated_at, excluded.translated_at)
        AND article_versions.content_hash IS excluded.content_hash
      THEN article_versions.updated_at
      ELSE datetime('now')
    END
`;

function sourceUpsert(db: D1Database, source: SyncSource): D1PreparedStatement {
  return db
    .prepare(SOURCE_UPSERT_SQL)
    .bind(
      source.id,
      source.name,
      source.type,
      source.homepageUrl,
      source.blogUrl,
      source.domain,
      source.rssUrl ?? null,
      source.sitemapUrl ?? null,
      source.logo ?? null,
      source.avatar ?? null,
      '{}',
    );
}

/**
 * 改名/换源预清理：文章身份迁移时避免主键冲突（kimi→moonshot 改名遗迹踩坑，
 * 2026-08-30 moonshot 链路 HTTP 500 的根因）。
 * 1) 新载荷 id 与既有行相同但 (source_id, original_url) 不同 → 删旧行
 *    （子表 ON DELETE CASCADE 级联清理，新载荷自带全部版本）；
 * 2) 同一 (source_id, original_url) 下 id 漂移（id 方案变更）→ 先删旧版本，
 *    让新 id 下的版本写入不产生孤儿。
 */
// article_categories 的 article_id 外键无 ON DELETE CASCADE（0001:68），
// 任何「同 id 换身份」的删除前必须先清它，否则删父行违反 FK。
// source_items.article_id 外键无 ON DELETE CASCADE（工作台表），删父行前必须清，
// 否则同 id 换身份时（如 anthropic /research→/engineering 迁移路径）FK 失败。
const SOURCE_ITEMS_BY_ARTICLE_DELETE_SQL = `
  DELETE FROM source_items WHERE article_id = ?
`;

const ARTICLE_CATEGORIES_BY_ID_DELETE_SQL = `
  DELETE FROM article_categories WHERE article_id = ?
`;

const ARTICLE_ID_COLLISION_DELETE_SQL = `
  DELETE FROM articles
  WHERE id = ? AND NOT (source_id = ? AND original_url = ?)
`;
const ARTICLE_VERSION_STALE_DELETE_SQL = `
  DELETE FROM article_versions
  WHERE article_id IN (
    SELECT id FROM articles WHERE source_id = ? AND original_url = ? AND id != ?
  )
`;
// article_categories 无 ON DELETE CASCADE（0001:68），父表 id 漂移前必须同步清，
// 否则父键更新触发子行 FK 失败（2026-08-31 本地全量入库踩坑）。
const ARTICLE_CATEGORIES_STALE_DELETE_SQL = `
  DELETE FROM article_categories
  WHERE article_id IN (
    SELECT id FROM articles WHERE source_id = ? AND original_url = ? AND id != ?
  )
`;

function articleIdentityPreClean(db: D1Database, article: SyncArticle): D1PreparedStatement[] {
  const stmts = [
    db.prepare(SOURCE_ITEMS_BY_ARTICLE_DELETE_SQL).bind(article.id),
    db.prepare(ARTICLE_ID_COLLISION_DELETE_SQL).bind(article.id, article.sourceId, article.originalUrl),
    db.prepare(ARTICLE_VERSION_STALE_DELETE_SQL).bind(article.sourceId, article.originalUrl, article.id),
    db.prepare(ARTICLE_CATEGORIES_STALE_DELETE_SQL).bind(article.sourceId, article.originalUrl, article.id),
  ];
  // 仅当本载荷提供 categories（随后会整体重建）时才预清——省略 categories 的
  // 契约是「不触碰现有分类」（content-sync.test 有断言），此时不能动。
  if (article.categories !== undefined) {
    stmts.unshift(db.prepare(ARTICLE_CATEGORIES_BY_ID_DELETE_SQL).bind(article.id));
  }
  return stmts;
}

function articleUpsert(db: D1Database, article: SyncArticle): D1PreparedStatement {
  return db
    .prepare(ARTICLE_UPSERT_SQL)
    .bind(
      article.id,
      article.sourceId,
      article.originalUrl,
      article.originalLanguage,
      article.publishedAt,
      article.imageUrl ?? null,
      article.author ?? null,
      article.sourceDomain,
      article.published ?? true,
      article.qualityScore ?? null,
      article.qualityModel ?? null,
    );
}

function versionUpsert(db: D1Database, articleId: string, version: SyncVersion, contentHash: string): D1PreparedStatement {
  const excerpt = version.excerpt ?? (excerptFromMarkdown(version.contentMarkdown) || null);
  return db
    .prepare(VERSION_UPSERT_SQL)
    .bind(
      articleId,
      version.language,
      version.title,
      version.contentMarkdown,
      excerpt,
      version.provenance,
      version.translationModel ?? null,
      version.originalAltUrl ?? null,
      version.provenance === 'model' ? (version.translatedAt ?? new Date().toISOString()) : null,
      contentHash,
    );
}

/** 去重/预检统一键：与 D1 UNIQUE(source_id, original_url) 同构。 */
function articleKey(sourceId: string, originalUrl: string): string {
  return `${sourceId}\u0000${originalUrl}`;
}

/** 来源存在性点查核心：返回缺失的 sourceId 列表（两条写路径共用）。 */
async function findMissingSources(db: D1Database, needed: Iterable<string>): Promise<string[]> {
  const missing: string[] = [];
  for (const id of needed) {
    const row = await db
      .prepare('SELECT 1 AS hit FROM sources WHERE id = ? LIMIT 1')
      .bind(id)
      .first();
    if (!row) missing.push(id);
  }
  return missing;
}

/** 预检：articles 引用的来源必须已存在（payload.sources 或 DB），避免 FK 失败。 */
async function ensureSourcesExist(db: D1Database, payload: SyncPayload): Promise<void> {
  const provided = new Set(payload.sources.map((s) => s.id));
  const needed = [...new Set(payload.articles.map((a) => a.sourceId))].filter((id) => !provided.has(id));
  const missing = await findMissingSources(db, needed);
  if (missing.length > 0) {
    throw new SyncPayloadError(
      `articles reference unknown sources: ${missing.join(', ')}; include them in payload.sources or seed them first`,
    );
  }
}

/** check 预检点查 SQL：articles 已存在命中。 */
const ARTICLES_HIT_SQL = 'SELECT 1 AS hit FROM articles WHERE source_id = ? AND original_url = ? LIMIT 1';

/**
 * 阶段 B 幂等判定（docs/d1-write-budget.md）：重复 payload / 内容未变的文章
 * 应整篇跳过、零写入。点查既有行（文章 id + 每版本 content_hash + 分类），
 * 与载荷做相等比较，全等则跳过整组写入语句。
 *
 * content_hash 由服务端独立计算并持久化（见 computeVersionContentHash 与
 * VERSION_UPSERT_SQL 的 content_hash 列），比较的是「内容指纹」而非原文，
 * 不碰 article_versions.rendered_hash（SSR 渲染缓存语义，见 render-cache.ts）。
 */

/** 预检行：既有文章 id + 身份字段 + 各版本内容指纹 + 分类集合（无文章时为空）。 */
interface ExistingArticleRow {
  articleId: string | null;
  /** 现网每版本已存指纹：language → content_hash。 */
  versionHashes: Map<string, string> | null;
  /** 现网分类集合（有序）；null = 文章不存在。 */
  categories: string[] | null;
  /** 现网文章身份可见字段（articles 行）；null = 文章不存在。 */
  identity: {
    originalLanguage: string;
    publishedAt: string;
    imageUrl: string | null;
    author: string | null;
    sourceDomain: string;
    published: boolean;
    qualityScore: number | null;
    qualityModel: string | null;
  } | null;
}

/** 点查：一篇文章的身份 + 全部版本指纹 + 分类（每篇 1 条 SQL，返回整行）。 */
async function pointQueryExistingArticle(
  db: D1Database,
  article: SyncArticle,
): Promise<ExistingArticleRow> {
  const rows = await db
    .prepare(
      `SELECT
         a.id AS article_id,
         a.original_language AS original_language,
         a.published_at AS published_at,
         a.image_url AS image_url,
         a.author AS author,
         a.source_domain AS source_domain,
         a.published AS published,
         a.quality_score AS quality_score,
         a.quality_model AS quality_model,
         v.language AS language,
         v.content_hash AS content_hash,
         c.category_name AS category_name
       FROM articles a
       LEFT JOIN article_versions v ON v.article_id = a.id
       LEFT JOIN article_categories c ON c.article_id = a.id
       WHERE a.source_id = ? AND a.original_url = ?
       ORDER BY v.language, c.category_name`,
    )
    .bind(article.sourceId, article.originalUrl)
    .all();
  const found = rows.results ?? [];
  if (found.length === 0) {
    return { articleId: null, versionHashes: null, categories: null, identity: null };
  }
  return parseExistingArticleRow(article, found);
}

/** 解析点查行 → ExistingArticleRow（join 后每篇文章可能占多行）。 */
function parseExistingArticleRow(
  article: SyncArticle,
  found: Record<string, unknown>[],
): ExistingArticleRow {
  const first = found[0] as any;
  const articleId = String(first.article_id);
  const versionHashes = new Map<string, string>();
  const categorySet = new Set<string>();
  for (const row of found) {
    const r = row as any;
    if (r.language != null && r.content_hash != null) {
      versionHashes.set(String(r.language), String(r.content_hash));
    }
    if (r.category_name != null) categorySet.add(String(r.category_name));
  }
  return {
    articleId,
    versionHashes,
    categories: [...categorySet].sort(),
    identity: {
      originalLanguage: String(first.original_language),
      publishedAt: String(first.published_at),
      imageUrl: first.image_url != null ? String(first.image_url) : null,
      author: first.author != null ? String(first.author) : null,
      sourceDomain: String(first.source_domain),
      published: first.published === 1 || first.published === true,
      qualityScore: first.quality_score != null ? Number(first.quality_score) : null,
      qualityModel: first.quality_model != null ? String(first.quality_model) : null,
    },
  };
}

/** 批量点查（阶段 B）：只查既有文章（key 命中 existingKeys 的子集），
 * 按 chunk 分批发 db.batch，避免逐篇串行 round-trip。 */
async function pointQueryExistingArticles(
  db: D1Database,
  articles: SyncArticle[],
  existingKeys: Set<string>,
): Promise<Map<string, ExistingArticleRow>> {
  const targets = articles.filter((a) => existingKeys.has(articleKey(a.sourceId, a.originalUrl)));
  const out = new Map<string, ExistingArticleRow>();
  for (let i = 0; i < targets.length; i += D1_BATCH_LIMIT) {
    const chunk = targets.slice(i, i + D1_BATCH_LIMIT);
    const results = await db.batch(
      chunk.map((item) =>
        db
          .prepare(
            `SELECT
               a.id AS article_id,
               a.original_language AS original_language,
               a.published_at AS published_at,
               a.image_url AS image_url,
               a.author AS author,
               a.source_domain AS source_domain,
               a.published AS published,
               a.quality_score AS quality_score,
               a.quality_model AS quality_model,
               v.language AS language,
               v.content_hash AS content_hash,
               c.category_name AS category_name
             FROM articles a
             LEFT JOIN article_versions v ON v.article_id = a.id
             LEFT JOIN article_categories c ON c.article_id = a.id
             WHERE a.source_id = ? AND a.original_url = ?
             ORDER BY v.language, c.category_name`,
          )
          .bind(item.sourceId, item.originalUrl),
      ),
    );
    results.forEach((result, j) => {
      const found = result?.results ?? [];
      if (found.length === 0) return;
      const item = chunk[j]!;
      out.set(articleKey(item.sourceId, item.originalUrl), parseExistingArticleRow(item, found as any[]));
    });
  }
  return out;
}

/** 载荷分类（有序）；载荷省略分类时视为不触碰现有分类（undefined）。 */
function sortedCategories(article: SyncArticle): string[] | undefined {
  if (article.categories === undefined) return undefined;
  return [...article.categories].sort();
}

/**
 * 版本指纹一致性（阶段 B）：现网该语言版本的 content_hash 与载荷重算结果
 * 相等 → 该版本未变。现网无该版本（含 hash 为空）→ 需要写入。
 */
function versionHashMatches(
  existingHashes: Map<string, string> | null | undefined,
  articleId: string,
  version: SyncVersion,
): boolean {
  if (!existingHashes) return false;
  const existing = existingHashes.get(version.language);
  if (existing == null) return false;
  return hashEqual(existing, computeVersionContentHash(version, articleId));
}

/**
 * 身份可见字段相等（跳过判定用）：载荷省略某字段 = 「不要求改它」，视同相等
 * （与 upsert 的 COALESCE(excluded, existing) 语义一致）；提供则必须与现网
 * 完全一致才算未变。身份任一变化都走 upsert 路径（published/quality_* 等
 * 不在版本指纹里，必须在此拦截，否则会被 skip 吞掉）。
 */
function identityMatches(article: SyncArticle, identity: ExistingArticleRow['identity']): boolean {
  if (!identity) return false;
  if (identity.originalLanguage !== article.originalLanguage) return false;
  if (identity.publishedAt !== article.publishedAt) return false;
  if (identity.sourceDomain !== article.sourceDomain) return false;
  if (article.imageUrl != null && identity.imageUrl !== article.imageUrl) return false;
  if (article.author != null && identity.author !== article.author) return false;
  if (article.published !== undefined && identity.published !== article.published) return false;
  if (article.qualityScore != null && identity.qualityScore !== article.qualityScore) return false;
  if (article.qualityModel != null && identity.qualityModel !== article.qualityModel) return false;
  return true;
}

/**
 * 整篇跳过判定：既有文章 id 一致 + 身份可见字段一致 + 每个语言版本内容指纹
 * 一致 + 分类集合一致 → 整篇跳过（零写入，连预清理与 upsert 都不发）。
 * 任一不同 → false，走增量更新（身份字段变化只更新 articles 那几列、
 * 不会重写全部版本）。
 */
function isArticleUnchanged(existing: ExistingArticleRow, article: SyncArticle): boolean {
  if (existing.articleId !== article.id) return false;
  if (!identityMatches(article, existing.identity)) return false;
  if (existing.versionHashes == null || existing.categories == null) return false;
  if (existing.versionHashes.size !== article.versions.length) return false;
  for (const version of article.versions) {
    if (!versionHashMatches(existing.versionHashes, article.id, version)) return false;
  }
  const payloadCategories = sortedCategories(article);
  if (payloadCategories == null) return false;
  if (payloadCategories.join('\u0000') !== existing.categories.join('\u0000')) return false;
  return true;
}

/** 分类集合是否与现网一致（用于是否跳过分类重建）。 */
function categoriesUnchanged(existingCategories: string[] | null, article: SyncArticle): boolean {
  const payloadCategories = sortedCategories(article);
  if (payloadCategories == null || existingCategories == null) return false;
  return payloadCategories.join('\u0000') === existingCategories.join('\u0000');
}

/**
 * 按 (source_id, original_url) 分块批量点查（每 chunk ≤ D1_BATCH_LIMIT），
 * 返回命中的 articleKey 集合。bindExtra 追加各 SQL 的额外绑定参数。
 */
async function pointQueryExistingKeys(
  db: D1Database,
  items: ReadonlyArray<{ sourceId: string; url: string }>,
  sql: string,
  bindExtra?: (item: { sourceId: string; url: string }) => unknown[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < items.length; i += D1_BATCH_LIMIT) {
    const chunk = items.slice(i, i + D1_BATCH_LIMIT);
    const results = await db.batch(
      chunk.map((item) =>
        db.prepare(sql).bind(item.sourceId, item.url, ...(bindExtra?.(item) ?? [])),
      ),
    );
    results.forEach((result, j) => {
      if (result && result.results && result.results.length > 0) {
        existing.add(articleKey(chunk[j]!.sourceId, chunk[j]!.url));
      }
    });
  }
  return existing;
}

/** 预检：按 (source_id, original_url) 分类已存在文章，用于统计 created/updated。 */
function findExistingArticleKeys(db: D1Database, articles: SyncArticle[]): Promise<Set<string>> {
  return pointQueryExistingKeys(
    db,
    articles.map((a) => ({ sourceId: a.sourceId, url: a.originalUrl })),
    ARTICLES_HIT_SQL,
  );
}

/**
 * 构建全部写入语句并分类 created/updated/skipped。
 * 语句顺序：sources upsert → 每篇 (article upsert → versions upsert →
 * categories 整体替换) → sql 直通语句。同一 batch 内保持该顺序。
 *
 * 阶段 B（docs/d1-write-budget.md）：逐篇点查既有行，hash 相同整篇跳过
 * （零写入，连预清理都不发）；只对实际变化的字段发 upsert；分类集合相等
 * 不动，不等才 diff 重建。
 */
async function prepareSyncWrite(
  db: D1Database,
  payload: SyncPayload,
): Promise<{ statements: D1PreparedStatement[]; created: number; updated: number; skipped: number }> {
  await ensureSourcesExist(db, payload);

  const statements: D1PreparedStatement[] = [];
  for (const source of payload.sources) {
    statements.push(sourceUpsert(db, source));
  }

  const existingKeys = await findExistingArticleKeys(db, payload.articles);
  const existingRows = await pointQueryExistingArticles(db, payload.articles, existingKeys);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of payload.articles) {
    const key = articleKey(article.sourceId, article.originalUrl);
    const existing = existingKeys.has(key) ? (existingRows.get(key) ?? null) : null;
    if (existing == null) {
      created += 1;
    } else {
      // 阶段 B：整篇跳过判定（身份 id + 全部版本指纹 + 分类全等 → 零写入）。
      if (isArticleUnchanged(existing, article)) {
        skipped += 1;
        continue;
      }
      updated += 1;
      // 稳定路径（既行 id 相同）：跳过预清理的 4~5 条 DELETE（改名/id 漂移
      // 专用，B4）。身份字段变化只走条件 upsert，版本/分类按差异增量写。
      if (existing.articleId !== article.id) {
        statements.push(...articleIdentityPreClean(db, article));
      }
    }

    statements.push(articleUpsert(db, article));
    for (const version of article.versions) {
      // 版本指纹相同则跳过该版本 upsert（B2：不发无谓的 updated_at=now）。
      if (existing == null || !versionHashMatches(existing.versionHashes, article.id, version)) {
        statements.push(versionUpsert(db, article.id, version, computeVersionContentHash(version, article.id)));
      }
    }
    if (article.categories !== undefined) {
      // 分类 diff（B3）：集合相等不动，不等才 DELETE+INSERT 重建。
      if (existing == null || existing.categories == null || !categoriesUnchanged(existing.categories, article)) {
        statements.push(db.prepare('DELETE FROM article_categories WHERE article_id = ?').bind(article.id));
        for (const category of article.categories) {
          statements.push(
            db
              .prepare('INSERT INTO categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
              .bind(category),
          );
          statements.push(
            db
              .prepare('INSERT INTO article_categories (article_id, category_name) VALUES (?, ?)')
              .bind(article.id, category),
          );
        }
      }
    }
  }

  for (const statement of payload.sql) {
    statements.push(db.prepare(statement));
  }

  return { statements, created, updated, skipped };
}

/** 执行同步：分批 db.batch() 写入，返回统计。 */
export async function executeContentSync(
  db: D1Database,
  payload: SyncPayload,
): Promise<ContentSyncResult> {
  const { statements, created, updated, skipped } = await prepareSyncWrite(db, payload);

  let batches = 0;
  for (let i = 0; i < statements.length; i += D1_BATCH_LIMIT) {
    await db.batch(statements.slice(i, i + D1_BATCH_LIMIT));
    batches += 1;
  }

  return {
    ok: true,
    articles: {
      received: payload.articles.length,
      created,
      updated,
      skipped,
    },
    sql: {
      statements: payload.sql.length,
      executed: payload.sql.length,
    },
    batches,
  };
}

// ── HTTP 契约 ────────────────────────────────────────

/** SHA-256 摘要后逐字节比较，避免时序侧信道。 */
async function secureEquals(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  if (digestA.byteLength !== digestB.byteLength) return false;
  const viewA = new Uint8Array(digestA);
  const viewB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i += 1) {
    diff |= viewA[i]! ^ viewB[i]!;
  }
  return diff === 0;
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

/**
 * 共享前置守卫（content-sync 与 content-check 共用）：
 * 方法 → 认证 → 媒体类型 → body 大小 → 读取 body。
 * 校验通过返回 `{ body }`；任一失败直接返回错误 Response。
 */
async function authorizeAndReadBody(
  request: Request,
  env: ContentSyncEnv,
): Promise<{ body: ArrayBuffer } | Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, { allow: 'POST' });
  }

  const expectedToken = env.CONTENT_SYNC_TOKEN;
  if (!expectedToken) {
    return json({ error: 'CONTENT_SYNC_TOKEN not configured' }, 503);
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const providedToken = authorization.slice('Bearer '.length).trim();
  if (!(await secureEquals(providedToken, expectedToken))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ error: 'content-type must be application/json' }, 415);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'request body too large' }, 413);
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return json({ error: 'failed to read request body' }, 400);
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return json({ error: 'request body too large' }, 413);
  }
  if (body.byteLength === 0) {
    return json({ error: 'empty request body' }, 400);
  }
  return { body };
}

/**
 * POST /api/content-sync 完整请求处理：方法 → 认证 → 媒体类型 →
 * body 大小 → 解析校验 → 写入。供 Astro APIRoute 与测试直接调用。
 */
export async function handleContentSync(
  request: Request,
  env: ContentSyncEnv,
): Promise<Response> {
  const authorized = await authorizeAndReadBody(request, env);
  if ('ok' in authorized) return authorized;
  const { body } = authorized;

  let payload: SyncPayload;
  try {
    payload = parseSyncPayload(new TextDecoder().decode(body));
  } catch (error) {
    return json(
      { error: error instanceof SyncPayloadError ? error.message : 'invalid payload' },
      400,
    );
  }

  try {
    const result = await executeContentSync(env.DB, payload);
    return json(result);
  } catch (error) {
    if (error instanceof SyncPayloadError) {
      return json({ error: error.message }, 400);
    }
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

// ── Check 端点（管线翻译前的远端去重预检） ────────────

/** 单次 check 请求的候选条目上限（对应单源发现列表量级，防滥用）。 */
export const MAX_CHECK_ITEMS = 500;

/**
 * 门禁拒绝负缓存（source_items.status='skipped'）的信任窗口（天）。
 * 窗口内的拒绝被 check 视为「已存在」，在抓取前过滤；过期自动放行重试，
 * 再次被拒会刷新 updated_at 续期——滑动 TTL 自愈，防止站点临时坏页
 * 被永久误杀（与管线 fail-open 哲学一致）。
 */
export const REJECTION_TTL_DAYS = 90;

export interface CheckItem {
  sourceId: string;
  url: string;
}

interface CheckPayload {
  items: CheckItem[];
}

/** {items:[...]} 信封解析：JSON/形状/上限校验后逐项交给 parseEntry（两端点共用）。 */
function parseItemsEnvelope<T>(
  raw: string,
  maxItems: number,
  parseEntry: (record: Record<string, unknown>, where: string) => T,
): T[] {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new SyncPayloadError('invalid JSON');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new SyncPayloadError('payload must be a JSON object');
  }
  const items = (obj as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    throw new SyncPayloadError('payload.items must be an array');
  }
  if (items.length > maxItems) {
    throw new SyncPayloadError(`too many items: ${items.length} (max ${maxItems})`);
  }
  return items.map((entry, i) => {
    const where = `items[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SyncPayloadError(`${where} must be an object`);
    }
    return parseEntry(entry as Record<string, unknown>, where);
  });
}

function parseCheckPayload(raw: string): CheckPayload {
  return {
    items: parseItemsEnvelope(raw, MAX_CHECK_ITEMS, (record, where) => {
      const item: CheckItem = {
        sourceId: requireString(record.sourceId, 'sourceId', where),
        url: requireString(record.url, 'url', where),
      };
      if (!isValidHttpUrl(item.url)) {
        throw new SyncPayloadError(`${where}.url must be an http(s) URL`);
      }
      return item;
    }),
  };
}

/** TTL 窗口内的门禁拒绝缓存命中（check 预检第二查）。 */
const REJECTED_HIT_SQL = `SELECT 1 AS hit FROM source_items
  WHERE source_id = ? AND original_url = ?
    AND status = 'skipped'
    AND updated_at >= datetime('now', ?)
  LIMIT 1`;

function findExistingCheckItems(db: D1Database, items: CheckItem[]): Promise<Set<string>> {
  return pointQueryExistingKeys(db, items, ARTICLES_HIT_SQL);
}

/** 查询 TTL 窗口内的门禁拒绝记录（source_items.status='skipped'）。 */
function findRejectedCheckItems(db: D1Database, items: CheckItem[]): Promise<Set<string>> {
  return pointQueryExistingKeys(db, items, REJECTED_HIT_SQL, () => [`-${REJECTION_TTL_DAYS} days`]);
}

/**
 * POST /api/content-sync/check —— 无状态管线运行环境（Render 容器等）
 * 在翻译前用 D1 判断「哪些 URL 已存在」，避免重复抓取与翻译。
 *
 * 「已存在」= articles 有该文章，或 TTL 窗口内被质量门禁拒绝过
 * （source_items 负缓存，过期自动放行重试）。
 *
 * 前置守卫与 content-sync 完全共用；请求 {items:[{sourceId,url}]}，
 * 响应 {existing:[{sourceId,url}]}（仅返回已存在子集）。
 */
export async function handleContentCheck(
  request: Request,
  env: ContentSyncEnv,
): Promise<Response> {
  const authorized = await authorizeAndReadBody(request, env);
  if ('ok' in authorized) return authorized;
  const { body } = authorized;

  let payload: CheckPayload;
  try {
    payload = parseCheckPayload(new TextDecoder().decode(body));
  } catch (error) {
    return json(
      { error: error instanceof SyncPayloadError ? error.message : 'invalid payload' },
      400,
    );
  }

  try {
    const [existingKeys, rejectedKeys] = await Promise.all([
      findExistingCheckItems(env.DB, payload.items),
      findRejectedCheckItems(env.DB, payload.items),
    ]);
    const existing = payload.items.filter((item) =>
      existingKeys.has(articleKey(item.sourceId, item.url)) ||
      rejectedKeys.has(articleKey(item.sourceId, item.url)),
    );
    return json({ existing });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

// ── Items 端点（门禁拒绝负缓存写入） ──────────────────

/** 单次 items 请求上限（与 check 同量级）。 */
export const MAX_ITEMS = 500;

/** 上报的门禁拒绝条目。 */
export interface RejectedEntry {
  sourceId: string;
  url: string;
  /** 门禁失败代码（如 content-too-short, missing-published-date）。 */
  code: string;
}

interface ItemsPayload {
  items: RejectedEntry[];
}

/** 解析并校验 items 上报载荷；结构/取值问题抛 SyncPayloadError（400）。 */
export function parseItemsPayload(raw: string): ItemsPayload {
  return {
    items: parseItemsEnvelope(raw, MAX_ITEMS, (record, where) => {
      const item: RejectedEntry = {
        sourceId: requireString(record.sourceId, 'sourceId', where),
        url: requireString(record.url, 'url', where),
        code: requireString(record.code, 'code', where, 256),
      };
      if (!isValidHttpUrl(item.url)) {
        throw new SyncPayloadError(`${where}.url must be an http(s) URL`);
      }
      return item;
    }),
  };
}

/**
 * 拒绝缓存 upsert：重复上报把 attempt_count +1 并刷新 updated_at（续期）。
 * status='published' 的历史行（Workflow 时代产物）不降级——已发布文章
 * 由 articles 去重，负缓存不得覆盖终态。
 */
const REJECTION_UPSERT_SQL = `
  INSERT INTO source_items (source_id, original_url, status, attempt_count, last_error)
  VALUES (?, ?, 'skipped', 1, ?)
  ON CONFLICT(source_id, original_url) DO UPDATE SET
    status = CASE WHEN source_items.status = 'published'
                  THEN 'published' ELSE 'skipped' END,
    attempt_count = source_items.attempt_count + 1,
    last_error = excluded.last_error,
    updated_at = datetime('now')
`;

/** 预检：items 引用的来源必须已存在（source_items.source_id 有 FK）。 */
async function ensureSourcesExistForItems(
  db: D1Database,
  items: RejectedEntry[],
): Promise<void> {
  const missing = await findMissingSources(db, new Set(items.map((item) => item.sourceId)));
  if (missing.length > 0) {
    throw new SyncPayloadError(`items reference unknown sources: ${missing.join(', ')}`);
  }
}

/** 执行拒绝缓存写入：分批 db.batch() upsert，返回统计。 */
export async function executeRejectionSync(
  db: D1Database,
  items: RejectedEntry[],
): Promise<{ ok: true; items: { received: number }; batches: number }> {
  await ensureSourcesExistForItems(db, items);

  const statements = items.map((item) =>
    db.prepare(REJECTION_UPSERT_SQL).bind(item.sourceId, item.url, item.code),
  );
  let batches = 0;
  for (let i = 0; i < statements.length; i += D1_BATCH_LIMIT) {
    await db.batch(statements.slice(i, i + D1_BATCH_LIMIT));
    batches += 1;
  }
  return { ok: true, items: { received: items.length }, batches };
}

/**
 * POST /api/content-sync/items —— 管线质量门禁拒绝的负缓存写入。
 * 请求 {items:[{sourceId,url,code}]}，响应 {ok,items:{received},batches}。
 */
export async function handleContentItems(
  request: Request,
  env: ContentSyncEnv,
): Promise<Response> {
  const authorized = await authorizeAndReadBody(request, env);
  if ('ok' in authorized) return authorized;
  const { body } = authorized;

  let payload: ItemsPayload;
  try {
    payload = parseItemsPayload(new TextDecoder().decode(body));
  } catch (error) {
    return json(
      { error: error instanceof SyncPayloadError ? error.message : 'invalid payload' },
      400,
    );
  }

  try {
    const result = await executeRejectionSync(env.DB, payload.items);
    return json(result);
  } catch (error) {
    if (error instanceof SyncPayloadError) {
      return json({ error: error.message }, 400);
    }
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}
