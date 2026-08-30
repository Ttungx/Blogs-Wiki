import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ExtractedArticle,
  ProcessedUrlState,
  SourceConfig,
  TranslationResult,
} from './types';
import { articleSlug } from './urls';

const CONTENT_DIR = ['src', 'content', 'articles'];
const DATA_DIR = ['src', 'data'];
const PROCESSED_FILE = 'processed-urls.json';

export function emptyProcessedState(): ProcessedUrlState {
  return { version: 1, updated_at: null, blogs: {} };
}

export async function loadProcessedState(
  rootDir: string,
  stateFile?: string,
): Promise<ProcessedUrlState> {
  const file = stateFile
    ? path.resolve(rootDir, stateFile)
    : path.join(rootDir, ...DATA_DIR, PROCESSED_FILE);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      // Accept both the wrapped {version, updated_at, blogs} format and the
      // legacy flat {blogId: [urls]} format found in older repositories.
      const blogs =
        (parsed.blogs as Record<string, string[]> | undefined) ??
        (() => {
          const { version: _version, updated_at: _updatedAt, ...rest } = parsed;
          return rest as Record<string, string[]>;
        })();
      return {
        version: typeof parsed.version === 'number' ? (parsed.version as number) : 1,
        updated_at: typeof parsed.updated_at === 'string' ? (parsed.updated_at as string) : null,
        blogs,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return emptyProcessedState();
}

export async function saveProcessedState(
  rootDir: string,
  state: ProcessedUrlState,
  stateFile?: string,
): Promise<void> {
  const file = stateFile
    ? path.resolve(rootDir, stateFile)
    : path.join(rootDir, ...DATA_DIR, PROCESSED_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function isProcessed(state: ProcessedUrlState, blogId: string, url: string): boolean {
  return (state.blogs[blogId] ?? []).includes(url);
}

export function markProcessed(state: ProcessedUrlState, blogId: string, url: string): void {
  const existing = state.blogs[blogId] ?? [];
  if (!existing.includes(url)) existing.push(url);
  state.blogs[blogId] = existing;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function yamlDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function excerptFromMarkdown(markdown: string, maxLength = 180): string {
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

function buildFrontmatter(
  blog: SourceConfig,
  article: ExtractedArticle,
  translation: TranslationResult,
  translatedAt: Date,
): string {
  const lines: string[] = ['---'];
  lines.push(`blog_id: ${yamlScalar(blog.id)}`);
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
  lines.push(`source_domain: ${yamlScalar(blog.domain)}`);
  lines.push(`original_language: ${yamlScalar(article.originalLanguage)}`);
  const excerpt = excerptFromMarkdown(translation.contentMarkdown);
  if (excerpt) lines.push(`excerpt: ${yamlScalar(excerpt)}`);
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

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

export interface WriteArticleResult {
  file: string;
  slug: string;
  created: boolean;
}

/**
 * ⚠️ smoke-fixture 遗留路径：生产写入口是 FileArticleRepository（runner.ts
 * 经 repository-factory），本函数当前仅被 smoke.ts 作为夹具引用，产出的
 * 单文件 frontmatter（original_title/translated_title）是多语言重构前的
 * 旧格式。不要用于生产；改造时需同步 smoke 的断言字段。
 */
export async function writeArticle(
  rootDir: string,
  blog: SourceConfig,
  article: ExtractedArticle,
  translation: TranslationResult,
  translatedAt: Date = new Date(),
): Promise<WriteArticleResult> {
  if (!article.publishedAt) {
    throw new Error(
      `cannot persist ${article.url}: no published date available (page metadata and discovery both missing)`,
    );
  }
  const articlesDir = path.join(rootDir, ...CONTENT_DIR);
  const blogDir = path.join(articlesDir, blog.id);
  await fs.mkdir(blogDir, { recursive: true });

  const baseSlug = articleSlug(blog.id, article.url);
  let slug = baseSlug;
  let candidate = path.join(blogDir, `${slug}.md`);
  let index = 2;

  while (true) {
    try {
      const existing = await fs.readFile(candidate, 'utf8');
      if (frontmatterValue(existing, 'original_url') === article.url) {
        return { file: candidate, slug: `${blog.id}/${slug}`, created: false };
      }
      slug = `${baseSlug}-${index}`;
      candidate = path.join(blogDir, `${slug}.md`);
      index += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      break;
    }
  }

  const content = `${buildFrontmatter(blog, article, translation, translatedAt)}${translation.contentMarkdown.replace(/\s+$/, '')}\n`;
  await fs.writeFile(candidate, content, 'utf8');
  return { file: candidate, slug: `${blog.id}/${slug}`, created: true };
}
