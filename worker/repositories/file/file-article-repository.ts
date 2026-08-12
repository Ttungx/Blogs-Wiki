/**
 * FileArticleRepository —— 文件后端的 ArticleRepository 实现（多语言版本架构）。
 *
 * 文件路径：`<rootDir>/src/content/articles/<blogId>/<language>/<slug>.md`
 * ID 格式（articleIdFromUrl 返回值）：`<blogId>/<slug>`，每个语言版本独立成文件。
 *
 * 多语言架构（2026-08 重构）：
 * - save() 创建文章身份 + 写入原文版本（provenance='original' 或官方/原生中文）。
 * - saveVersion() 为已存在文章添加翻译版本，需先有 save() 写过身份信息。
 * - 身份字段（blog_id, original_url, published_at, categories, source_domain,
 *   original_language, author, image_url）在每个版本文件中冗余存储，
 *   保证文件自包含（Astro glob loader 需要每份文件独立可渲染）。
 *
 * 幂等：
 * - save() 同 (source.id, article.originalUrl) 已存在时返回 created:false。
 * - saveVersion() 同 (articleId, language) 已存在时返回 created:false。
 * - slug 冲突（不同 url 产生同 slug）：加 `-2` / `-3` ... 后缀。
 */

import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import {
  articleIdFromUrl,
  buildVersionFileContent,
  frontmatterValue,
  parseVersionFile,
} from '../../domain/article';
import type {
  ArticleRecord,
  ArticleVersionRecord,
  Provenance,
  SaveArticleInput,
  SaveResult,
  SaveVersionInput,
  SourceConfig,
} from '../../domain/types';
import type { ArticleRepository } from '../article-repository';
import { CONTENT_DIR } from './paths';

export interface FileArticleRepositoryOptions {
  /** 仓库根目录（package.json 所在目录）。 */
  rootDir: string;
}

/** id（`blogId/slug`）+ language → 文件路径（`<articlesDir>/blogId/language/slug.md`）。 */
function idToLangFilePath(articlesDir: string, articleId: string, language: string): string {
  const sep = articleId.indexOf('/');
  const blogId = sep >= 0 ? articleId.slice(0, sep) : '';
  const slug = sep >= 0 ? articleId.slice(sep + 1) : articleId;
  return path.join(articlesDir, blogId, language, `${slug}.md`);
}

/** 从 articleId 提取 blogId 段。 */
function blogIdOf(articleId: string): string {
  const sep = articleId.indexOf('/');
  return sep >= 0 ? articleId.slice(0, sep) : '';
}

/** 从 articleId 提取 slug 段。 */
function slugOf(articleId: string): string {
  const sep = articleId.indexOf('/');
  return sep >= 0 ? articleId.slice(sep + 1) : articleId;
}

/** `fs.readFile` 失败时若是 ENOENT 返回 null，否则重抛。 */
async function readFileOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

/** `fs.readdir` 失败时若是 ENOENT 返回 null，否则重抛。 */
async function readdirOrNull(dir: string): Promise<Dirent[] | null> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

export class FileArticleRepository implements ArticleRepository {
  private readonly articlesDir: string;

  constructor(options: FileArticleRepositoryOptions) {
    this.articlesDir = path.join(options.rootDir, ...CONTENT_DIR);
  }

  async save(input: SaveArticleInput): Promise<SaveResult> {
    const { source, article } = input;
    if (!article.publishedAt) {
      throw new Error(
        `cannot persist ${article.url}: no published date available (page metadata and discovery both missing)`,
      );
    }

    const originalLanguage = article.originalLanguage;
    const baseId = articleIdFromUrl(source.id, article.url);
    const blogId = blogIdOf(baseId);
    const baseSlug = slugOf(baseId);
    let id = baseId;
    let candidate = idToLangFilePath(this.articlesDir, id, originalLanguage);
    await fs.mkdir(path.dirname(candidate), { recursive: true });
    let index = 2;

    // 幂等 / 冲突解决：在原文语言文件上检查 original_url。
    while (true) {
      const existing = await readFileOrNull(candidate);
      if (existing === null) break; // 空位，写入
      if (frontmatterValue(existing, 'original_url') === article.url) {
        return { id, created: false };
      }
      id = `${blogId}/${baseSlug}-${index}`;
      candidate = idToLangFilePath(this.articlesDir, id, originalLanguage);
      index += 1;
    }

    // 身份记录（无内容）。
    const articleRecord: ArticleRecord = {
      id,
      sourceId: source.id,
      originalUrl: article.url,
      originalLanguage,
      publishedAt: article.publishedAt,
      sourceDomain: source.domain,
      categories: [],
    };
    if (article.imageUrl) articleRecord.imageUrl = article.imageUrl;
    if (article.author) articleRecord.author = article.author;

    // 原文版本：provenance 由 contentSource 推导。
    const provenance: Provenance =
      article.contentSource === 'official-zh'
        ? 'official-zh'
        : article.contentSource === 'native-zh'
          ? 'native-zh'
          : 'original';
    const version: ArticleVersionRecord = {
      articleId: id,
      language: originalLanguage,
      title: article.title,
      contentMarkdown: article.contentMarkdown,
      provenance,
      updatedAt: new Date().toISOString(),
    };

    const content = buildVersionFileContent(source, articleRecord, version);
    await fs.writeFile(candidate, content, 'utf8');
    return { id, created: true };
  }

  async saveVersion(input: SaveVersionInput): Promise<SaveResult> {
    // 必须先有 save() 写过身份信息。
    const existing = await this.readExistingArticle(input.articleId);
    if (!existing) {
      throw new Error(
        `cannot save version for ${input.articleId}: article not found (save() must be called first)`,
      );
    }
    const { article, source } = existing;

    // 翻译带来的分类更新文章身份（文件 frontmatter 层面）。
    if (input.categories && input.categories.length > 0) {
      article.categories = input.categories;
    }

    // 幂等：目标语言文件已存在（language frontmatter 匹配）则返回 created:false。
    const targetFile = idToLangFilePath(this.articlesDir, input.articleId, input.language);
    const existingVersion = await readFileOrNull(targetFile);
    if (existingVersion !== null && frontmatterValue(existingVersion, 'language') === input.language) {
      return { id: input.articleId, created: false };
    }

    const version: ArticleVersionRecord = {
      articleId: input.articleId,
      language: input.language,
      title: input.title,
      contentMarkdown: input.contentMarkdown,
      provenance: input.provenance,
      updatedAt: input.translatedAt ?? new Date().toISOString(),
    };
    if (input.translationModel) version.translationModel = input.translationModel;
    if (input.originalAltUrl) version.originalAltUrl = input.originalAltUrl;
    if (input.provenance === 'model') version.translatedAt = version.updatedAt;

    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    const content = buildVersionFileContent(source, article, version);
    await fs.writeFile(targetFile, content, 'utf8');
    return { id: input.articleId, created: true };
  }

  async exists(sourceId: string, originalUrl: string): Promise<boolean> {
    return (await this.getByOriginalUrl(sourceId, originalUrl)) !== null;
  }

  async getById(id: string): Promise<ArticleRecord | null> {
    const found = await this.readExistingArticle(id);
    return found ? found.article : null;
  }

  async getByOriginalUrl(sourceId: string, originalUrl: string): Promise<ArticleRecord | null> {
    const all = await this.listAll();
    return all.find((r) => r.sourceId === sourceId && r.originalUrl === originalUrl) ?? null;
  }

  async getVersion(articleId: string, language: string): Promise<ArticleVersionRecord | null> {
    const file = idToLangFilePath(this.articlesDir, articleId, language);
    const content = await readFileOrNull(file);
    if (content === null) return null;
    const parsed = parseVersionFile(this.versionFileId(articleId, language), content);
    return parsed ? parsed.version : null;
  }

  async listVersions(articleId: string): Promise<ArticleVersionRecord[]> {
    const blogDir = path.join(this.articlesDir, blogIdOf(articleId));
    const langEntries = await readdirOrNull(blogDir);
    if (langEntries === null) return [];
    const slug = slugOf(articleId);
    const slugFile = `${slug}.md`;
    const versions: ArticleVersionRecord[] = [];
    for (const entry of langEntries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(blogDir, entry.name, slugFile);
      const content = await readFileOrNull(file);
      if (content === null) continue;
      const parsed = parseVersionFile(this.versionFileId(articleId, entry.name), content);
      if (parsed) versions.push(parsed.version);
    }
    return versions;
  }

  async listBySource(sourceId: string): Promise<ArticleRecord[]> {
    const all = await this.listAll();
    return all.filter((r) => r.sourceId === sourceId);
  }

  async listAll(): Promise<ArticleRecord[]> {
    return this.scanArticles(this.articlesDir);
  }

  /** 构造 parseVersionFile 需要的 id（`blogId/language/slug`，无 .md）。 */
  private versionFileId(articleId: string, language: string): string {
    return `${blogIdOf(articleId)}/${language}/${slugOf(articleId)}`;
  }

  /**
   * 读取 articleId 下任意已存在的语言版本文件，解析出 ArticleRecord 与最小 SourceConfig。
   * 扫描 `articles/{blogId}/` 下所有语言目录，取第一个能成功解析的文件。
   * 找不到（save() 未先调用）返回 null。
   */
  private async readExistingArticle(
    articleId: string,
  ): Promise<{ article: ArticleRecord; source: SourceConfig } | null> {
    const blogDir = path.join(this.articlesDir, blogIdOf(articleId));
    const langEntries = await readdirOrNull(blogDir);
    if (langEntries === null) return null;
    const slug = slugOf(articleId);
    const slugFile = `${slug}.md`;
    for (const entry of langEntries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(blogDir, entry.name, slugFile);
      const content = await readFileOrNull(file);
      if (content === null) continue;
      const parsed = parseVersionFile(this.versionFileId(articleId, entry.name), content);
      if (parsed) {
        return {
          article: parsed.article,
          // buildVersionFrontmatter 只用 source.id（写 blog_id 字段）。
          source: { id: parsed.article.sourceId } as SourceConfig,
        };
      }
    }
    return null;
  }

  /** 递归扫描 articles/ 目录，按 articleId 去重收集 ArticleRecord。 */
  private async scanArticles(dir: string): Promise<ArticleRecord[]> {
    const entries = await readdirOrNull(dir);
    if (entries === null) return [];
    const records: ArticleRecord[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await this.scanArticles(childPath);
        for (const record of sub) {
          if (!seen.has(record.id)) {
            seen.add(record.id);
            records.push(record);
          }
        }
      } else if (entry.name.endsWith('.md')) {
        const content = await fs.readFile(childPath, 'utf8');
        const parsed = parseVersionFile(this.idFromFile(childPath), content);
        if (parsed && !seen.has(parsed.article.id)) {
          seen.add(parsed.article.id);
          records.push(parsed.article);
        }
      }
    }
    return records;
  }

  /** 从绝对文件路径派生 parseVersionFile 所需的 id（`blogId/language/slug`）。 */
  private idFromFile(filePath: string): string {
    const rel = path.relative(this.articlesDir, filePath).split(path.sep).join('/');
    return rel.replace(/\.md$/, '');
  }
}
