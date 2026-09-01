/**
 * D1 内容服务 —— SSR 页面的读模型。
 *
 * 直接用 D1 prepared statements 做高效的 JOIN 查询，
 * 返回页面友好的数据结构。写操作仍走 worker/repositories/ 的 Repository。
 */

import type { D1Database } from '@cloudflare/workers-types';

/** 文章详情（身份 + 版本 + 分类）。 */
export interface ArticleDetail {
  id: string;
  sourceId: string;
  originalUrl: string;
  originalLanguage: string;
  publishedAt: string;
  imageUrl: string | null;
  author: string | null;
  sourceDomain: string;
  title: string;
  contentMarkdown: string;
  excerpt: string | null;
  provenance: string;
  translationModel: string | null;
  originalAltUrl: string | null;
  translatedAt: string | null;
  versionUpdatedAt: string;
  categories: string[];
}

/** 文章列表项（轻量，不含正文）。 */
export interface ArticleListItem {
  id: string;
  sourceId: string;
  publishedAt: string;
  imageUrl: string | null;
  author: string | null;
  title: string;
  excerpt: string | null;
  provenance: string;
  language: string;
  /**
   * 英文原题：仅当展示版本为翻译、原文非中文（zh 原生无需英文行）且与展示
   * 标题不同时携带。列表页第二行展示用。
   */
  originalTitle?: string;
}

interface ArticleJoinRow {
  id: string;
  source_id: string;
  original_url: string;
  original_language: string;
  published_at: string;
  image_url: string | null;
  author: string | null;
  source_domain: string;
  title: string;
  content_markdown: string;
  excerpt: string | null;
  provenance: string;
  translation_model: string | null;
  original_alt_url: string | null;
  translated_at: string | null;
  updated_at: string;
}

/** 从 blogId + slug 构造 D1 article id。 */
export function buildArticleId(blogId: string, slug: string): string {
  return `${blogId}/${slug}`;
}

/**
 * 安全解析日期文本。缺失或无法解析时返回 null，
 * 调用方负责条件渲染，避免 `new Date(bad).toISOString()` 抛 RangeError 导致整页 500。
 *
 * D1 的 `datetime('now')` 返回 `YYYY-MM-DD HH:mm:ss`（UTC，无时区后缀）。
 * JS 引擎会把无时区字符串按本地时区解析，东八区等环境可能错一天，
 * 因此这种格式统一补 `Z` 按 UTC 解析；ISO 8601 / 纯日期等其余格式保持既有行为。
 */
export function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? `${value}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 获取单篇文章 + 指定语言版本。
 * 找不到返回 null（页面渲染 404）。
 */
export async function getArticle(
  db: D1Database,
  blogId: string,
  slug: string,
  lang = 'zh-cn',
): Promise<ArticleDetail | null> {
  const articleId = buildArticleId(blogId, slug);

  const row = await db
    .prepare(
      `SELECT a.id, a.source_id, a.original_url, a.original_language, a.published_at,
              a.image_url, a.author, a.source_domain,
              v.title, v.content_markdown, v.excerpt, v.provenance,
              v.translation_model, v.original_alt_url, v.translated_at, v.updated_at
       FROM articles a
       JOIN article_versions v ON v.article_id = a.id AND v.language = ?
       WHERE a.id = ? AND a.published = 1`,
    )
    .bind(lang, articleId)
    .first<ArticleJoinRow>();

  if (!row) return null;

  const categories = await getCategories(db, articleId);

  return {
    id: row.id,
    sourceId: row.source_id,
    originalUrl: row.original_url,
    originalLanguage: row.original_language,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    author: row.author,
    sourceDomain: row.source_domain,
    title: row.title,
    contentMarkdown: row.content_markdown,
    excerpt: row.excerpt,
    provenance: row.provenance,
    translationModel: row.translation_model,
    originalAltUrl: row.original_alt_url,
    translatedAt: row.translated_at,
    versionUpdatedAt: row.updated_at,
    categories,
  };
}

/**
 * 获取一篇文章的所有可用语言版本（语言切换器用）。
 */
export async function getAvailableLanguages(
  db: D1Database,
  blogId: string,
  slug: string,
): Promise<string[]> {
  const articleId = buildArticleId(blogId, slug);
  const result = await db
    .prepare('SELECT language FROM article_versions WHERE article_id = ? ORDER BY language')
    .bind(articleId)
    .all<{ language: string }>();
  return result.results.map((r) => r.language);
}

interface ArticleListRow {
  id: string;
  source_id: string;
  published_at: string;
  image_url: string | null;
  author: string | null;
  title: string;
  excerpt: string | null;
  provenance: string;
  /** 展示版本语言（zh-cn 优先，缺译回退原文语言）。 */
  lang: string;
  /** 原文语言（基础码：en/zh/es…）。 */
  original_language: string;
  /** 原文版本标题（无原文版本时为 null）。 */
  original_title: string | null;
}

/**
 * 列出某来源的文章（指定语言版本），按发布日期降序。
 */
export async function listArticlesByBlog(
  db: D1Database,
  sourceId: string,
  lang = 'zh-cn',
): Promise<ArticleListItem[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.source_id, a.published_at, a.image_url, a.author, a.original_language,
              v.title, v.excerpt, v.provenance, v.language AS lang,
              o.title AS original_title
       FROM articles a
       JOIN article_versions v ON v.article_id = a.id
         AND v.language = (
           SELECT w.language FROM article_versions w
           WHERE w.article_id = a.id
           ORDER BY CASE w.language WHEN 'zh-cn' THEN 0 ELSE 1 END, w.language
           LIMIT 1)
       LEFT JOIN article_versions o ON o.article_id = a.id AND o.language = a.original_language
       WHERE a.published = 1 AND a.source_id = ?
       ORDER BY a.published_at DESC`,
    )
    .bind(sourceId)
    .all<ArticleListRow>();

  return result.results.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    author: row.author,
    title: row.title,
    excerpt: row.excerpt,
    provenance: row.provenance,
    // 中文优先列表：非 zh 版本返回 en 时携带语言供 UI 标注
    language: row.lang,
    ...(row.original_title &&
    !row.original_language.startsWith('zh') &&
    row.original_title !== row.title
      ? { originalTitle: row.original_title }
      : {}),
  }));
}

/** 搜索页条目（全站指定语言版本的轻量清单，不含正文）。 */
export interface ArticleSearchItem {
  id: string;
  sourceId: string;
  sourceDomain: string;
  publishedAt: string;
  title: string;
  /** 英文原题（同 ArticleListItem 规则），搜索页英文第一行用。 */
  originalTitle?: string;
  categories: string[];
}

/**
 * 全站文章搜索清单（指定语言版本），按发布日期降序。
 * 搜索页专用：只取标题/分类等轻量字段——正文留在 D1，
 * 避免把整个内容层打进服务端 bundle。
 */
export async function listAllArticlesForSearch(
  db: D1Database,
  lang = 'zh-cn',
): Promise<ArticleSearchItem[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.source_id, a.source_domain, a.published_at, a.original_language,
              v.title, o.title AS original_title
       FROM articles a
       JOIN article_versions v ON v.article_id = a.id
         AND v.language = (
           SELECT w.language FROM article_versions w
           WHERE w.article_id = a.id
           ORDER BY CASE w.language WHEN 'zh-cn' THEN 0 ELSE 1 END, w.language
           LIMIT 1)
       LEFT JOIN article_versions o ON o.article_id = a.id AND o.language = a.original_language
       WHERE a.published = 1
       ORDER BY a.published_at DESC`,
    )
    .all<{
      id: string;
      source_id: string;
      source_domain: string;
      published_at: string;
      original_language: string;
      title: string;
      original_title: string | null;
    }>();

  if (result.results.length === 0) return [];

  // 分类一次取全量按文章分组，避免 N+1 查询。
  const catResult = await db
    .prepare(
      `SELECT article_id, category_name
       FROM article_categories
       WHERE article_id IN (SELECT article_id FROM article_versions WHERE language = ?)
       ORDER BY category_name`,
    )
    .bind(lang)
    .all<{ article_id: string; category_name: string }>();
  const categoriesByArticle = new Map<string, string[]>();
  for (const row of catResult.results) {
    const list = categoriesByArticle.get(row.article_id);
    if (list) list.push(row.category_name);
    else categoriesByArticle.set(row.article_id, [row.category_name]);
  }

  return result.results.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceDomain: row.source_domain,
    publishedAt: row.published_at,
    title: row.title,
    ...(row.original_title &&
    !row.original_language.startsWith('zh') &&
    row.original_title !== row.title
      ? { originalTitle: row.original_title }
      : {}),
    categories: categoriesByArticle.get(row.id) ?? [],
  }));
}

/**
 * 每来源的文章计数（首页 blog card 用）。
 * 只计有指定语言版本的文章。
 */
export async function getArticleCountBySource(
  db: D1Database,
  _lang = 'zh-cn',
): Promise<Map<string, number>> {
  const result = await db
    .prepare(
      `SELECT a.source_id, COUNT(*) as count
       FROM articles a
       WHERE a.published = 1
       GROUP BY a.source_id`,
    )
    .all<{ source_id: string; count: number }>();

  return new Map(result.results.map((r) => [r.source_id, r.count]));
}

/** 查文章的分类列表。 */
async function getCategories(db: D1Database, articleId: string): Promise<string[]> {
  const result = await db
    .prepare('SELECT category_name FROM article_categories WHERE article_id = ? ORDER BY category_name')
    .bind(articleId)
    .all<{ category_name: string }>();
  return result.results.map((r) => r.category_name);
}
