/**
 * 文章领域的纯函数：id 生成、版本 frontmatter 构建/解析、摘要提取。
 *
 * 多语言架构（2026-08 重构）：
 * - 每个语言版本是一个独立的 .md 文件，路径 `articles/{blogId}/{lang}/{slug}.md`。
 * - frontmatter 统一用 `title`（不再分 original_title / translated_title）。
 * - `language` + `is_original` 标识版本身份；`provenance` 标记内容来源。
 * - 身份字段（blog_id, original_url, published_at, categories, source_domain,
 *   original_language, author, image_url）在每个版本文件中冗余存储，
 *   保证文件自包含（Astro glob loader 需要每份文件独立可渲染）。
 *
 * 保留不变的函数：
 * - articleIdFromUrl / slugPart — id 生成（与 scripts/update/urls.ts 对齐）。
 * - yamlScalar / yamlDate — YAML 编码工具。
 * - excerptFromMarkdown — 正文摘要提取。
 * - frontmatterValue — 单字段提取（幂等检查用）。
 */

import type {
  ArticleRecord,
  ArticleVersionRecord,
  Provenance,
  SourceConfig,
} from './types';

/** 受控 frontmatter 字段名（snake_case）。 */
const FRONTMATTER_KEYS = [
  'blog_id',
  'original_url',
  'language',
  'is_original',
  'image_url',
  'title',
  'published_at',
  'source_domain',
  'original_language',
  'provenance',
  'translation_model',
  'original_alt_url',
  'version_at',
  'author',
  'excerpt',
] as const;

function slugPart(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
}

/**
 * 根据来源 id 与原文 URL 生成文章 id。
 *
 * 格式：{blogId}/{slug}，slug 取 URL 末段并剥掉日期前缀。
 */
export function articleIdFromUrl(blogId: string, originalUrl: string): string {
  const url = new URL(originalUrl);
  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'article';
  const stem = lastSegment.replace(/\.[a-z0-9]{1,8}$/i, '');
  const pathPart = slugPart(stem) || 'article';
  const slug = pathPart.replace(/^\d{4}-\d{2}-\d{2}-/, '') || 'article';
  return `${slugPart(blogId) || 'source'}/${slug}`;
}

/** YAML 标量编码：用 JSON 风格双引号包裹。 */
export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/** YAML 日期编码：Date 取 ISO 日期部分（YYYY-MM-DD），字符串原样输出。 */
export function yamlDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

/** 从 markdown 正文提取纯文本摘要。 */
export function excerptFromMarkdown(markdown: string, maxLength = 180): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trim()}…` : plain;
}

/**
 * 从完整文件内容中提取某个 frontmatter 字段的值。
 *
 * 供幂等检查（original_url）与 reconcile 用。
 */
export function frontmatterValue(fileContent: string, key: string): string | null {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const line = match[1].split(/\r?\n/).find((item) => item.startsWith(`${key}:`));
  if (!line) return null;
  const value = line.slice(key.length + 1).trim();
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
}

// ── 版本 frontmatter 构建 ──────────────────────────────

/**
 * 构造语言版本的 YAML frontmatter（含首尾 `---` 分隔符与尾换行）。
 *
 * 身份字段（blog_id, original_url, published_at, categories, ...）从 ArticleRecord
 * 获取；版本字段（title, provenance, translation_model, ...）从 ArticleVersionRecord
 * 获取。两个字段集合并写入同一份 frontmatter，保证文件自包含。
 */
export function buildVersionFrontmatter(
  source: SourceConfig,
  article: ArticleRecord,
  version: ArticleVersionRecord,
): string {
  const lines: string[] = ['---'];
  lines.push(`blog_id: ${yamlScalar(source.id)}`);
  lines.push(`original_url: ${yamlScalar(article.originalUrl)}`);
  lines.push(`language: ${yamlScalar(version.language)}`);
  lines.push(`is_original: ${version.language === article.originalLanguage}`);
  if (article.imageUrl) lines.push(`image_url: ${yamlScalar(article.imageUrl)}`);
  lines.push(`title: ${yamlScalar(version.title)}`);
  lines.push(`published_at: ${yamlDate(article.publishedAt)}`);
  // categories：空数组用内联 []，非空用多行格式
  if (article.categories.length === 0) {
    lines.push('categories: []');
  } else {
    lines.push('categories:');
    for (const category of article.categories) lines.push(`  - ${yamlScalar(category)}`);
  }
  lines.push(`source_domain: ${yamlScalar(article.sourceDomain)}`);
  lines.push(`original_language: ${yamlScalar(article.originalLanguage)}`);
  lines.push(`provenance: ${yamlScalar(version.provenance)}`);
  if (version.translationModel) {
    lines.push(`translation_model: ${yamlScalar(version.translationModel)}`);
  }
  if (version.originalAltUrl) {
    lines.push(`original_alt_url: ${yamlScalar(version.originalAltUrl)}`);
  }
  lines.push(`version_at: ${yamlDate(version.updatedAt)}`);
  if (article.author) lines.push(`author: ${yamlScalar(article.author)}`);
  const excerpt = version.excerpt ?? excerptFromMarkdown(version.contentMarkdown);
  if (excerpt) lines.push(`excerpt: ${yamlScalar(excerpt)}`);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

/**
 * 解析版本文件 → { article: ArticleRecord, version: ArticleVersionRecord }。
 *
 * 专为 `buildVersionFrontmatter` 的受控输出设计：
 * - 单值字段用 yamlScalar（JSON-encoded）或 yamlDate。
 * - categories 支持 `[]`（空内联）和多行 `  - "value"` 两种格式。
 * - 不支持任意 YAML（不引依赖）。
 *
 * id 格式 `blogId/language/slug`；articleId 派生为 `blogId/slug`（去掉语言段）。
 */
export function parseVersionFile(id: string, fileContent: string): {
  article: ArticleRecord;
  version: ArticleVersionRecord;
} | null {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const [, frontmatterBlock, body] = match;

  const lines = frontmatterBlock.split(/\r?\n/);
  const scalars: Partial<Record<(typeof FRONTMATTER_KEYS)[number], string>> = {};
  const categories: string[] = [];
  let inCategories = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('categories:')) {
      const inline = line.slice('categories:'.length).trim();
      if (inline === '[]') {
        inCategories = false;
        continue;
      }
      inCategories = true;
      continue;
    }
    if (inCategories) {
      const itemMatch = line.match(/^\s+-\s+(.*)$/);
      if (!itemMatch) {
        inCategories = false;
      } else {
        const raw = itemMatch[1].trim();
        try {
          categories.push(JSON.parse(raw) as string);
        } catch {
          categories.push(raw);
        }
        continue;
      }
    }
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim();
    const rawValue = line.slice(sep + 1).trim();
    if ((FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      try {
        scalars[key as (typeof FRONTMATTER_KEYS)[number]] = JSON.parse(rawValue) as string;
      } catch {
        scalars[key as (typeof FRONTMATTER_KEYS)[number]] = rawValue;
      }
    }
  }

  // 必填字段校验
  const blogId = scalars.blog_id;
  const originalUrl = scalars.original_url;
  const language = scalars.language;
  const title = scalars.title;
  const publishedAt = scalars.published_at;
  const sourceDomain = scalars.source_domain;
  const originalLanguage = scalars.original_language;
  const provenance = scalars.provenance;
  const versionAt = scalars.version_at;
  if (
    !blogId ||
    !originalUrl ||
    !language ||
    !title ||
    !publishedAt ||
    !sourceDomain ||
    !originalLanguage ||
    !provenance ||
    !versionAt
  ) {
    return null;
  }

  // 从文件 id 派生 articleId：`blogId/lang/slug` → `blogId/slug`
  const idParts = id.split('/');
  const articleId =
    idParts.length >= 3
      ? `${idParts[0]}/${idParts.slice(2).join('/')}`
      : id;

  const article: ArticleRecord = {
    id: articleId,
    sourceId: blogId,
    originalUrl,
    originalLanguage,
    publishedAt,
    sourceDomain,
    categories,
  };
  if (scalars.image_url) article.imageUrl = scalars.image_url;
  if (scalars.author) article.author = scalars.author;

  const version: ArticleVersionRecord = {
    articleId,
    language,
    title,
    contentMarkdown: body.replace(/\s+$/, ''),
    provenance: provenance as Provenance,
    updatedAt: versionAt,
  };
  if (version.provenance === 'model') version.translatedAt = versionAt;
  if (scalars.excerpt) version.excerpt = scalars.excerpt;
  if (scalars.translation_model) version.translationModel = scalars.translation_model;
  if (scalars.original_alt_url) version.originalAltUrl = scalars.original_alt_url;

  return { article, version };
}

/**
 * 构造完整版本文件内容（frontmatter + 正文）。
 */
export function buildVersionFileContent(
  source: SourceConfig,
  article: ArticleRecord,
  version: ArticleVersionRecord,
): string {
  const frontmatter = buildVersionFrontmatter(source, article, version);
  return `${frontmatter}${version.contentMarkdown.replace(/\s+$/, '')}\n`;
}
