/**
 * 把 src/content/articles/ 的本地文章导入远程 D1。
 *
 * 用途：Workers Free 计划 CPU 限制（10ms）无法运行真实翻译 Workflow，
 * 用本地已有的文章文件（en + zh-cn 双版本）填充 D1，立即上线内容。
 *
 * 用法：node scripts/import-local-articles.mjs
 * 生成 SQL 后自动执行：wrangler d1 execute blogs-wiki --remote --file
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'src', 'content', 'articles');

const args = process.argv.slice(2);
const format = args.includes('--json') ? 'json' : 'sql';
const outputArgIndex = args.findIndex((arg) => arg === '--output' || arg.startsWith('--output='));
const output = outputArgIndex === -1
  ? (format === 'json' ? join(ROOT, '.tmp-import-articles.json') : join(ROOT, '.tmp-import-articles.sql'))
  : join(ROOT, args[outputArgIndex].startsWith('--output=')
    ? args[outputArgIndex].slice('--output='.length)
    : args[outputArgIndex + 1] ?? '');
if (!output || output === ROOT) {
  throw new Error('--output requires a file path');
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

function isoDate(value) {
  if (!value) return null;
  // 支持 "2024-12-19" 与 "2026-05-22T12:00:00.000Z"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const files = walk(ARTICLES_DIR);
console.log(`Found ${files.length} article files`);

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

// 按 blogId/slug 分组，收集每个文件
const groups = new Map();
let skipped = 0;
let blockedSkipped = 0;
for (const file of files) {
  const parsed = parseMarkdown(file);
  if (!parsed) { skipped++; continue; }
  const fm = parsed.frontmatter;
  if (!fm.blog_id || !fm.title) { skipped++; continue; }
  if (blockedIds.has(fm.blog_id)) { blockedSkipped++; continue; }
  const rel = relative(ARTICLES_DIR, file).replace(/\\/g, '/');
  const parts = rel.split('/'); // blogId/lang/slug.md
  const blogId = parts[0];
  const lang = parts[1];
  const slug = parts.slice(2).join('/').replace(/\.md$/, '');
  const key = `${blogId}/${slug}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ file, fm, body: parsed.body, lang, blogId, slug });
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
    articles.push({
      id: articleId,
      sourceId,
      originalUrl: fm.original_url,
      originalLanguage: fm.original_language ?? 'en',
      publishedAt,
      ...(fm.image_url ? { imageUrl: fm.image_url } : {}),
      ...(fm.author ? { author: fm.author } : {}),
      sourceDomain: fm.source_domain,
      categories: [...categorySet],
      versions: versions_.map((version) => ({
        language: version.lang,
        title: version.fm.title,
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
      `VALUES (${esc(articleId)}, ${esc(v.lang)}, ${esc(v.fm.title)}, ${esc(v.body)}, ` +
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
