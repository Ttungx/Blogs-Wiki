/**
 * 文章领域的纯函数：id 生成、frontmatter 构建/解析、摘要提取。
 *
 * 逐字节对齐说明：
 * - `articleIdFromUrl` 复刻自 `scripts/update/urls.ts:96-101`（articleSlug）。
 * - `buildArticleFrontmatter` 复刻自 `scripts/update/persist.ts:81-111`（buildFrontmatter）。
 * - `excerptFromMarkdown` 复刻自 `scripts/update/persist.ts:69-79`。
 * - `yamlScalar` / `yamlDate` 复刻自 `scripts/update/persist.ts:61-67`。
 *
 * 过渡期允许重复实现（手册 §15），由 `__tests__/article.test.ts` 的黄金输出
 * 锚定两端字节一致；Phase 5 接线后老管线改走 Repository，重复即消除。
 *
 * 新增内容（老管线只写不读，无对应代码）：
 * - `parseArticleFrontmatter`：解析 `buildArticleFrontmatter` 的受控输出，
 *   专为 FileArticleRepository 的读方法设计。不引 YAML 依赖，只处理本模块
 *   产出的 JSON-encoded scalar + 多行数组格式。
 */

import type {
  ArticleRecord,
  RawArticle,
  SaveArticleInput,
  SourceConfig,
  TranslationResult,
} from './types';

/** 受控 frontmatter 字段名（snake_case，对齐持久化格式）。 */
const FRONTMATTER_KEYS = [
  'blog_id',
  'original_url',
  'image_url',
  'original_title',
  'translated_title',
  'published_at',
  'translation_model',
  'translation_status',
  'original_zh_url',
  'translated_at',
  'author',
  'source_domain',
  'original_language',
  'excerpt',
] as const;

/** 单值字段：解析为字符串。`categories` 与 `demo`/`demo_notice` 单独处理。 */
type ScalarFrontmatterKey = Exclude<(typeof FRONTMATTER_KEYS)[number], never>;

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
 * 与 `scripts/update/urls.ts` articleSlug 对齐（URL 结构重设计后）。
 * blogId 作为路径段提供结构化分层，slug 保证同 blogId 内唯一。
 */
export function articleIdFromUrl(blogId: string, originalUrl: string): string {
  const url = new URL(originalUrl);
  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'article';
  // 剥掉末段的文件扩展名（greatwork.html → greatwork）
  const stem = lastSegment.replace(/\.[a-z0-9]{1,8}$/i, '');
  const pathPart = slugPart(stem) || 'article';
  // 剥掉日期前缀（2026-07-04-harness → harness）
  const slug = pathPart.replace(/^\d{4}-\d{2}-\d{2}-/, '') || 'article';
  return `${slugPart(blogId) || 'source'}/${slug}`;
}

/** YAML 标量编码：用 JSON 风格双引号包裹（复刻 persist.ts:61-63）。 */
export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/**
 * YAML 日期编码：Date 取 ISO 日期部分（YYYY-MM-DD），字符串原样输出。
 * 复刻 persist.ts:65-67。
 */
export function yamlDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

/**
 * 从 markdown 正文提取纯文本摘要。
 * 复刻 persist.ts:69-79：去代码块/图片/链接/标点，截断到 maxLength 字符并加省略号。
 */
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
 * 构造文章的 YAML frontmatter 字符串（含首尾 `---` 分隔符与尾换行）。
 *
 * 字段顺序与 `scripts/update/persist.ts:81-111` buildFrontmatter 完全一致，
 * 由 `__tests__/article.test.ts` 的黄金输出锚定。
 */
export function buildArticleFrontmatter(
  source: SourceConfig,
  article: RawArticle,
  translation: TranslationResult,
  translatedAt: Date,
): string {
  const lines: string[] = ['---'];
  lines.push(`blog_id: ${yamlScalar(source.id)}`);
  lines.push(`original_url: ${yamlScalar(article.url)}`);
  if (article.imageUrl) lines.push(`image_url: ${yamlScalar(article.imageUrl)}`);
  lines.push(`original_title: ${yamlScalar(article.title)}`);
  lines.push(`translated_title: ${yamlScalar(translation.translatedTitle)}`);
  lines.push(`published_at: ${yamlDate(article.publishedAt)}`);
  lines.push('categories:');
  for (const category of translation.categories) lines.push(`  - ${yamlScalar(category)}`);
  lines.push(`translation_model: ${yamlScalar(translation.model)}`);
  if (translation.translationStatus) {
    lines.push(`translation_status: ${yamlScalar(translation.translationStatus)}`);
  }
  if (translation.originalZhUrl) {
    lines.push(`original_zh_url: ${yamlScalar(translation.originalZhUrl)}`);
  }
  lines.push(`translated_at: ${yamlDate(translatedAt)}`);
  if (article.author) lines.push(`author: ${yamlScalar(article.author)}`);
  lines.push(`source_domain: ${yamlScalar(source.domain)}`);
  lines.push(`original_language: ${yamlScalar(article.originalLanguage)}`);
  const excerpt = excerptFromMarkdown(translation.contentMarkdown);
  if (excerpt) lines.push(`excerpt: ${yamlScalar(excerpt)}`);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

/**
 * 从完整文件内容中提取某个 frontmatter 字段的值。
 *
 * 复刻 `scripts/update/persist.ts:113-124` frontmatterValue：
 * 正则匹配首尾 `---`，行前缀查 key，值先试 JSON.parse 失败回退原值。
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

/**
 * 解析文章文件的 frontmatter + 正文，还原成 ArticleRecord。
 *
 * 专为 `buildArticleFrontmatter` 的受控输出设计：
 * - 单值字段用 yamlScalar（JSON-encoded）或 yamlDate（ISO 日期/裸字符串）。
 * - categories 是多行 `  - "value"` 数组。
 * - 不支持任意 YAML（不引依赖）；遇到无法识别的格式返回 null。
 *
 * 返回的 ArticleRecord 字段映射：
 * - id 来自文件名（无 .md）。
 * - blog_id → sourceId，original_url → originalUrl，等等（snake → camel）。
 * - publishedAt / translatedAt：保留 frontmatter 里的原始字符串值（可能是
 *   YYYY-MM-DD 或完整 ISO），由上层按需解析为 Date。
 */
export function parseArticleFrontmatter(id: string, fileContent: string): ArticleRecord | null {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const [, frontmatterBlock, body] = match;

  const lines = frontmatterBlock.split(/\r?\n/);
  const scalars: Partial<Record<ScalarFrontmatterKey, string>> = {};
  const categories: string[] = [];
  let inCategories = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('categories:')) {
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
        scalars[key as ScalarFrontmatterKey] = JSON.parse(rawValue) as string;
      } catch {
        scalars[key as ScalarFrontmatterKey] = rawValue;
      }
    }
  }

  const blogId = scalars.blog_id;
  const originalUrl = scalars.original_url;
  const originalTitle = scalars.original_title;
  const translatedTitle = scalars.translated_title;
  const publishedAt = scalars.published_at;
  const translationModel = scalars.translation_model;
  const translatedAt = scalars.translated_at;
  const sourceDomain = scalars.source_domain;
  const originalLanguage = scalars.original_language;
  if (
    !blogId ||
    !originalUrl ||
    !originalTitle ||
    !translatedTitle ||
    !publishedAt ||
    !translationModel ||
    !translatedAt ||
    !sourceDomain ||
    !originalLanguage
  ) {
    return null;
  }

  const record: ArticleRecord = {
    id,
    sourceId: blogId,
    originalUrl,
    originalTitle,
    translatedTitle,
    publishedAt,
    translatedAt,
    translationModel,
    sourceDomain,
    originalLanguage,
    contentMarkdown: body.replace(/\s+$/, ''),
    categories,
  };
  if (scalars.image_url) record.imageUrl = scalars.image_url;
  if (scalars.translation_status) {
    record.translationStatus = scalars.translation_status as ArticleRecord['translationStatus'];
  }
  if (scalars.original_zh_url) record.originalZhUrl = scalars.original_zh_url;
  if (scalars.excerpt) record.excerpt = scalars.excerpt;
  if (scalars.author) record.author = scalars.author;
  return record;
}

/**
 * 构造完整文章文件内容（frontmatter + 正文）。
 * 复刻 persist.ts:167 的拼接逻辑。
 */
export function buildArticleFileContent(input: SaveArticleInput, translatedAt: Date): string {
  const frontmatter = buildArticleFrontmatter(
    input.source,
    input.article,
    input.translation,
    translatedAt,
  );
  return `${frontmatter}${input.translation.contentMarkdown.replace(/\s+$/, '')}\n`;
}
