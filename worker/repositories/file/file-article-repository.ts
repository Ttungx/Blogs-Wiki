/**
 * FileArticleRepository —— 文件后端的 ArticleRepository 实现。
 *
 * 文件路径：`<rootDir>/src/content/articles/<blogId>/<slug>.md`
 * ID 格式（articleIdFromUrl 返回值）：`<blogId>/<slug>`，直接映射文件路径。
 *
 * 幂等：同 (source.id, article.originalUrl) 已存在时，比对现有文件
 * frontmatter 的 original_url，匹配则返回 created:false。
 * slug 冲突（不同 url 产生同 slug）：加 `-2` / `-3` ... 后缀。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  articleIdFromUrl,
  buildArticleFileContent,
  frontmatterValue,
  parseArticleFrontmatter,
} from '../../domain/article';
import type {
  ArticleRecord,
  SaveArticleInput,
  SaveResult,
} from '../../domain/types';
import type { ArticleRepository } from '../article-repository';
import { CONTENT_DIR } from './paths';

export interface FileArticleRepositoryOptions {
  /** 仓库根目录（package.json 所在目录）。 */
  rootDir: string;
}

/** id（`blogId/slug`）→ 文件路径（`<articlesDir>/blogId/slug.md`）。 */
function idToFilePath(articlesDir: string, id: string): string {
  const sep = id.indexOf('/');
  if (sep < 0) return path.join(articlesDir, `${id}.md`);
  const blogId = id.slice(0, sep);
  const slug = id.slice(sep + 1);
  return path.join(articlesDir, blogId, `${slug}.md`);
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

    const translatedAt = input.translatedAt ?? new Date();
    const baseId = articleIdFromUrl(source.id, article.url);
    let id = baseId;
    let candidate = idToFilePath(this.articlesDir, id);
    await fs.mkdir(path.dirname(candidate), { recursive: true });
    let index = 2;

    // 幂等 / 冲突解决
    while (true) {
      let existing: string;
      try {
        existing = await fs.readFile(candidate, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        break; // 空位，写入
      }
      if (frontmatterValue(existing, 'original_url') === article.url) {
        return { id, created: false };
      }
      const sep = baseId.indexOf('/');
      const blogId = sep >= 0 ? baseId.slice(0, sep) : '';
      const baseSlug = sep >= 0 ? baseId.slice(sep + 1) : baseId;
      id = `${blogId}/${baseSlug}-${index}`;
      candidate = idToFilePath(this.articlesDir, id);
      index += 1;
    }

    const content = buildArticleFileContent(input, translatedAt);
    await fs.writeFile(candidate, content, 'utf8');
    return { id, created: true };
  }

  async exists(sourceId: string, originalUrl: string): Promise<boolean> {
    return (await this.getByOriginalUrl(sourceId, originalUrl)) !== null;
  }

  async getById(id: string): Promise<ArticleRecord | null> {
    const file = idToFilePath(this.articlesDir, id);
    let content: string;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return null;
    }
    return parseArticleFrontmatter(id, content);
  }

  async getByOriginalUrl(sourceId: string, originalUrl: string): Promise<ArticleRecord | null> {
    const all = await this.listAll();
    return all.find((r) => r.sourceId === sourceId && r.originalUrl === originalUrl) ?? null;
  }

  async listBySource(sourceId: string): Promise<ArticleRecord[]> {
    const all = await this.listAll();
    return all.filter((r) => r.sourceId === sourceId);
  }

  async listAll(): Promise<ArticleRecord[]> {
    return this.scanDir(this.articlesDir, '');
  }

  /** 递归扫描子目录，收集所有 .md 文件。 */
  private async scanDir(dir: string, prefix: string): Promise<ArticleRecord[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return [];
    }
    const records: ArticleRecord[] = [];
    for (const entry of entries) {
      const childPath = path.join(dir, entry.name);
      const childId = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const sub = await this.scanDir(childPath, childId);
        records.push(...sub);
      } else if (entry.name.endsWith('.md')) {
        const id = childId.slice(0, -3); // 去 .md
        const content = await fs.readFile(childPath, 'utf8');
        const record = parseArticleFrontmatter(id, content);
        if (record) records.push(record);
      }
    }
    return records;
  }
}
