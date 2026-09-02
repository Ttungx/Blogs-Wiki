/**
 * 把 src/content/articles/ 的本地文章导入远程 D1。
 *
 * 用途：Workers Free 计划 CPU 限制（10ms）无法运行真实翻译 Workflow，
 * 用本地已有的文章文件（en + zh-cn 双版本）填充 D1，立即上线内容。
 *
 * 用法：
 *   node scripts/import-local-articles.mjs [--json|--sql] [--source <id>]
 *     [--since <ISO>] [--full] [--root <dir>] [--output <file>]
 *
 * 增量模式（render-runner 链尾用）：
 *   --source <id>   只 walk src/content/articles/<id>/，不扫全库
 *   --since <ISO>   只收文件 mtime >= 该时刻；无命中文件时输出空 payload
 *                  （sync-local-articles 对空 payload 直接跳过，不再 POST）
 * 显式运维全量（一条链 ≈ 1～2 万行写入，见 docs/d1-write-budget.md）：
 *   不带 --source/--since，等价于历史行为。
 *
 * 生成 JSON 后由 sync-local-articles 分片 POST /api/content-sync；
 * --sql 模式生成 SQL：wrangler d1 execute blogs-wiki --remote --file
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const index = process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (index === -1) return fallback;
  return process.argv[index].startsWith(prefix)
    ? process.argv[index].slice(prefix.length)
    : process.argv[index + 1] ?? '';
}

function argValues(name) {
  const prefix = `--${name}=`;
  const values = [];
  process.argv.forEach((arg, index) => {
    if (arg === `--${name}`) values.push(process.argv[index + 1] ?? '');
    else if (arg.startsWith(prefix)) values.push(arg.slice(prefix.length));
  });
  return values;
}

const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : 'sql';
const sourceIds = argValues('source').filter(Boolean);
const since = argValue('since', '');
const full = args.includes('--full');
const rootOverride = argValue('root', '');
const ARTICLES_DIR = join(rootOverride ? resolve(rootOverride) : ROOT, 'src', 'content', 'articles');
const outputArgIndex = args.findIndex((arg) => arg === '--output' || arg.startsWith('--output='));
const outputDefault = join(ROOT, format === 'json' ? '.tmp-import-articles.json' : '.tmp-import-articles.sql');
const output = outputArgIndex === -1
  ? outputDefault
  : isAbsolute(args[outputArgIndex].startsWith('--output=') ? args[outputArgIndex].slice('--output='.length) : args[outputArgIndex + 1] ?? '')
    ? args[outputArgIndex].startsWith('--output=') ? args[outputArgIndex].slice('--output='.length) : args[outputArgIndex + 1] ?? ''
    : join(ROOT, args[outputArgIndex].startsWith('--output=') ? args[outputArgIndex].slice('--output='.length) : args[outputArgIndex + 1] ?? '');
if (!output || output === ROOT) {
  throw new Error('--output requires a file path');
}
if (!full && (sourceIds.length > 0 || since)) {
  // 增量模式：SQL 直连没有 skip 语义，任何写都按全量计数——禁止。
  if (format === 'sql') throw new Error('增量模式必须 --json（content-sync 有指纹跳过）；显式全量请不带 --source/--since');
}
let sinceMs = 0;
if (since) {
  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) throw new Error(`--since must be an ISO timestamp, got "${since}"`);
  sinceMs = parsed;
}
for (const id of sourceIds) {
  if (id.includes('/')) throw new Error('--source must be a source id without slash');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/** 解析 frontmatter + 正文。 */
function parseMarkdown(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = YAML.parse(match[1]) ?? {};
  return { frontmatter, body: match[2].trim() };
}

function esc(value) {
  if (value === undefined || value === null) return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// 与 src/lib/text.ts cleanTitle 同构：行首 Markdown 标记 + 标签状 token + 空白归一。
function cleanTitle(title) {
  return String(title)
    .replace(/^#{1,6}\s+/, '')
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(value) {
  if (!value) return null;
  // 支持 "2024-12-19" 与 "2026-05-22T12:00:00.000Z"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// 增量收集：--source 可给多个，各只 walk 该源目录；文章级 mtime 判断在分组后
// 统一做（任一版本文件 mtime >= since 即整篇纳入，保证原文与译文版本不拆散）。
// 无 --source/--since = 显式全量（运维命令，见 docs/d1-write-budget.md）。
const walkBases = sourceIds.length > 0 ? sourceIds.map((id) => join(ARTICLES_DIR, id)) : [ARTICLES_DIR];
const files = walkBases.flatMap((base) => (existsSync(base) ? walk(base) : []));
const rawFiles = files.map((file) => ({
  file,
  rel: relative(ARTICLES_DIR, file).replace(/\\/g, '/'),
}));
if (rawFiles.length === 0) {
  // 本轮无新/变更文件：不空跑全量。JSON 模式产出空 articles（sync 端整体跳过），
  // SQL 直连模式拒绝空跑（显式运维应直接不带过滤）。
  if (format === 'json') {
    const empty = { sources: [], articles: [] };
    writeFileSync(output, `${JSON.stringify(empty)}\n`, 'utf8');
    console.log('No article files; JSON written with 0 articles');
    process.exit(0);
  }
  throw new Error('no article files found（全量请去掉 --since/--source 或确认目录非空）');
}

// 永久拉黑（tombstone）守卫：import 是唯一绕过发现层、能把已移除源文章重导进
// D1 的旁路。blog_id 命中 blocked-sources.json 即跳过（与 loadSources 门禁同源）。
function readBlockedIds() {
  try {
    const registry = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'blocked-sources.json'), 'utf8'));
    return new Set((registry.blocked ?? []).map((entry) => entry.id));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}
const blockedIds = readBlockedIds();

// 按 blogId/slug 分组。文章粒度判断「本轮变化」：该篇任一版本文件 mtime 在
// since 之后即整篇纳入（含其旧版本文件——重译/新译只会新增/覆盖语言文件，
// 文章身份与 categories 取全版本并集，不能只带新文件）。
const groups = new Map();
let skipped = 0;
let blockedSkipped = 0;
for (const { file, rel } of rawFiles) {
  const parsed = parseMarkdown(file);
  if (!parsed) { skipped++; continue; }
  const fm = parsed.frontmatter;
  if (!fm.blog_id || !fm.title) { skipped++; continue; }
  if (blockedIds.has(fm.blog_id)) { blockedSkipped++; continue; }
  const parts = rel.split('/'); // blogId/lang/slug.md
  const blogId = parts[0];
  const lang = parts[1];
  const slug = parts.slice(2).join('/').replace(/\.md$/, '');
  const key = `${blogId}/${slug}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ file, rel, mtimeMs: statSync(file).mtimeMs, fm, body: parsed.body, lang, blogId, slug });
}

if (sinceMs > 0) {
  for (const [key, versions] of groups) {
    if (!versions.some((v) => v.mtimeMs >= sinceMs)) groups.delete(key);
  }
}

console.log(`Grouped into ${groups.size} articles (${skipped} skipped, ${blockedSkipped} blocked-skipped)`);

function readSources() {
  const sources = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'sources.json'), 'utf8'));
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    homepageUrl: source.homepage_url,
    blogUrl: source.blog_url,
    domain: source.domain,
    ...(source.rss_url ? { rssUrl: source.rss_url } : {}),
    ...(source.sitemap_url ? { sitemapUrl: source.sitemap_url } : {}),
    ...(source.logo ? { logo: source.logo } : {}),
    ...(source.avatar ? { avatar: source.avatar } : {}),
  }));
}

/** stage 门禁结论（ml/local-quality-verdicts.jsonl，quality-scan-local.ts 产出）。 */
function readVerdicts() {
  try {
    const path = process.env.QUALITY_VERDICTS_FILE || join(ROOT, 'ml', 'local-quality-verdicts.jsonl');
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const v = JSON.parse(line);
      map.set(v.file, v);
    }
    return map;
  } catch {
    return new Map();
  }
}
const verdicts = readVerdicts();

function toSyncPayload() {
  const articles = [];
  for (const [articleId, versions_] of groups) {
    const [sourceId] = articleId.split('/');
    const primary = versions_[0];
    const fm = primary.fm;
    const publishedAt = isoDate(fm.published_at);
    if (!fm.original_url || !fm.source_domain || !publishedAt) {
      throw new Error(`article ${articleId} is missing original_url, source_domain or published_at`);
    }
    const categorySet = new Set();
    for (const version of versions_) {
      for (const category of Array.isArray(version.fm.categories) ? version.fm.categories : []) {
        categorySet.add(category);
      }
    }
    // stage 门禁：以原文语言版本（en 优先）的判定决定整篇文章是否上线
    const origVersion = versions_.find((v) => v.lang === (fm.original_language ?? 'en')) ?? versions_[0];
    const verdict = origVersion ? verdicts.get(relative(ARTICLES_DIR, origVersion.file).replace(/\\/g, '/')) : undefined;
    articles.push({
      id: articleId,
      sourceId,
      originalUrl: fm.original_url,
      originalLanguage: fm.original_language ?? 'en',
      published: verdict ? !verdict.wouldReject : true,
      ...(verdict ? { qualityScore: verdict.score, qualityModel: verdict.modelVersion } : {}),
      publishedAt,
      ...(fm.image_url ? { imageUrl: fm.image_url } : {}),
      ...(fm.author ? { author: fm.author.slice(0, 256) } : {}),
      sourceDomain: fm.source_domain,
      categories: [...categorySet],
      versions: versions_.map((version) => ({
        language: version.lang,
        title: cleanTitle(version.fm.title),
        contentMarkdown: version.body,
        ...(version.fm.excerpt ? { excerpt: version.fm.excerpt } : {}),
        provenance: version.fm.provenance ?? (version.lang === 'en' ? 'original' : 'model'),
        ...(version.fm.translation_model ? { translationModel: version.fm.translation_model } : {}),
        ...(version.fm.original_alt_url ? { originalAltUrl: version.fm.original_alt_url } : {}),
        ...(version.fm.version_at ? { translatedAt: isoDate(version.fm.version_at) } : {}),
      })),
    });
  }
  return { sources: readSources(), articles };
}

if (format === 'json') {
  const payload = toSyncPayload();
  writeFileSync(output, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`JSON generated: ${payload.articles.length} articles -> ${output}`);
  process.exit(0);
}

const OUT_SQL = output;
const sql = [];
sql.push('-- Generated by scripts/import-local-articles.mjs');
sql.push('BEGIN;');

let articles = 0;
let versions = 0;
let categories = 0;

for (const [articleId, versions_] of groups) {
  const [blogId] = articleId.split('/');
  const primary = versions_[0];
  const fm = primary.fm;
  const publishedAt = isoDate(fm.published_at);
  if (!fm.original_url || !fm.source_domain || !publishedAt) {
    throw new Error(`article ${articleId} is missing original_url, source_domain or published_at`);
  }

  // articles 身份行（用第一个版本的 frontmatter）
  sql.push(
    `INSERT INTO articles (id, source_id, original_url, original_language, published_at, image_url, author, source_domain, created_at, updated_at) ` +
    `VALUES (${esc(articleId)}, ${esc(blogId)}, ${esc(fm.original_url)}, ${esc(fm.original_language ?? 'en')}, ` +
    `${esc(publishedAt)}, ${esc(fm.image_url)}, ${esc(fm.author)}, ${esc(fm.source_domain)}, datetime('now'), datetime('now')) ` +
    `ON CONFLICT(id) DO UPDATE SET original_url=excluded.original_url, published_at=excluded.published_at, ` +
    `image_url=excluded.image_url, author=excluded.author, source_domain=excluded.source_domain, updated_at=datetime('now');`
  );
  articles++;

  // article_versions 每个语言一行
  for (const v of versions_) {
    sql.push(
      `INSERT INTO article_versions (article_id, language, title, content_markdown, excerpt, provenance, translation_model, original_alt_url, translated_at, updated_at) ` +
      `VALUES (${esc(articleId)}, ${esc(v.lang)}, ${esc(cleanTitle(v.fm.title))}, ${esc(v.body)}, ` +
      `${esc(v.fm.excerpt)}, ${esc(v.fm.provenance ?? 'model')}, ${esc(v.fm.translation_model)}, ${esc(v.fm.original_alt_url)}, ` +
      `${esc(v.fm.provenance === 'model' ? isoDate(v.fm.version_at) : null)}, datetime('now')) ` +
      `ON CONFLICT(article_id, language) DO UPDATE SET title=excluded.title, content_markdown=excluded.content_markdown, ` +
      `excerpt=excluded.excerpt, provenance=excluded.provenance, translation_model=excluded.translation_model, ` +
      `translated_at=COALESCE(article_versions.translated_at, excluded.translated_at), updated_at=datetime('now');`
    );
    versions++;

    // categories
    const cats = Array.isArray(v.fm.categories) ? v.fm.categories : [];
    for (const cat of cats) {
      sql.push(
        `INSERT OR IGNORE INTO article_categories (article_id, category_name) VALUES (${esc(articleId)}, ${esc(cat)});`
      );
      categories++;
    }
  }
}

sql.push('COMMIT;');
writeFileSync(OUT_SQL, sql.join('\n') + '\n');

console.log(`SQL generated: ${articles} articles, ${versions} versions, ${categories} categories -> ${OUT_SQL}`);
console.log('Run: wrangler d1 execute blogs-wiki --remote --file .tmp-import-articles.sql');
