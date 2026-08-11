/**
 * D1ArticleRepository —— D1 后端的 ArticleRepository 实现。
 *
 * 所有操作用 D1 prepared statements。幂等语义由 D1 schema 的
 * UNIQUE(source_id, original_url) 保证，用 upsert 实现。
 *
 * 与 FileArticleRepository 实现同一个接口（ArticleRepository），
 * 调用方无需感知底层差异。
 */

import { articleIdFromUrl, excerptFromMarkdown } from '../../domain/article';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  ArticleRecord,
  SaveArticleInput,
  SaveResult,
} from '../../domain/types';
import type { ArticleRepository } from '../article-repository';

/** D1 数据库的行结构（snake_case）。 */
interface ArticleRow {
  id: string;
  source_id: string;
  original_url: string;
  original_title: string;
  translated_title: string;
  published_at: string;
  translated_at: string;
  original_language: string;
  translation_model: string;
  translation_status: string | null;
  original_zh_url: string | null;
  content_markdown: string;
  excerpt: string | null;
  image_url: string | null;
  author: string | null;
  source_domain: string;
}

/** D1 prepared statement 的 bind 参数顺序与 INSERT 列顺序一致。 */
const ARTICLE_INSERT_SQL = `
  INSERT INTO articles (
    id, source_id, original_url, original_title, translated_title,
    published_at, translated_at, original_language, translation_model,
    translation_status, original_zh_url, content_markdown, excerpt,
    image_url, author, source_domain
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id, original_url) DO UPDATE SET
    id = excluded.id,
    original_title = excluded.original_title,
    translated_title = excluded.translated_title,
    translated_at = excluded.translated_at,
    translation_model = excluded.translation_model,
    translation_status = excluded.translation_status,
    original_zh_url = excluded.original_zh_url,
    content_markdown = excluded.content_markdown,
    excerpt = excluded.excerpt,
    image_url = excluded.image_url,
    author = excluded.author,
    updated_at = datetime('now')
`;

/** 保存文章前同步来源注册表，确保 articles/source_items 的外键可独立成立。 */
const SOURCE_UPSERT_SQL = `
  INSERT INTO sources (
    id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url,
    logo, avatar, config
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
    config = excluded.config,
    updated_at = datetime('now')
`;

export class D1ArticleRepository implements ArticleRepository {
  constructor(private readonly db: D1Database) {}

  async save(input: SaveArticleInput): Promise<SaveResult> {
    const { source, article, translation } = input;
    if (!article.publishedAt) {
      throw new Error(
        `cannot persist ${article.url}: no published date available (page metadata and discovery both missing)`,
      );
    }

    const translatedAt = input.translatedAt ?? new Date();
    const id = articleIdFromUrl(source.id, article.url);
    const excerpt = excerptFromMarkdown(translation.contentMarkdown);

    // 幂等检查：同 (source_id, original_url) 已存在？
    const existing = await this.db
      .prepare('SELECT id FROM articles WHERE source_id = ? AND original_url = ?')
      .bind(source.id, article.url)
      .first<{ id: string }>();

    const sourceConfig = JSON.stringify({
      updateMode: source.updateMode,
      preferOfficialZh: source.preferOfficialZh,
      sitemapIncludePaths: source.sitemapIncludePaths,
      articlePaths: source.articlePaths,
      excludePaths: source.excludePaths,
    });
    const statements = [
      this.db
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
          sourceConfig,
        ),
      this.db
      .prepare(ARTICLE_INSERT_SQL)
      .bind(
        id,
        source.id,
        article.url,
        article.title,
        translation.translatedTitle,
        article.publishedAt,
        translatedAt instanceof Date ? translatedAt.toISOString() : String(translatedAt),
        article.originalLanguage,
        translation.model,
        translation.translationStatus ?? null,
        translation.originalZhUrl ?? null,
        translation.contentMarkdown,
        excerpt || null,
        article.imageUrl ?? null,
        article.author ?? null,
        source.domain,
      ),
      // 与文章 upsert 同一 batch：分类写入失败时整批回滚，不留下半篇文章。
      this.db.prepare('DELETE FROM article_categories WHERE article_id = ?').bind(id),
      ...translation.categories.map((category) =>
        this.db
          .prepare('INSERT INTO article_categories (article_id, category_name) VALUES (?, ?)')
          .bind(id, category),
      ),
    ];
    await this.db.batch(statements);

    return { id, created: !existing };
  }

  async exists(sourceId: string, originalUrl: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS hit FROM articles WHERE source_id = ? AND original_url = ? LIMIT 1')
      .bind(sourceId, originalUrl)
      .first();
    return row !== null;
  }

  async getById(id: string): Promise<ArticleRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM articles WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ArticleRow>();
    if (!row) return null;
    const categories = await this.getCategories([row.id]);
    return rowToRecord(row, categories[row.id] ?? []);
  }

  async getByOriginalUrl(sourceId: string, originalUrl: string): Promise<ArticleRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM articles WHERE source_id = ? AND original_url = ? LIMIT 1')
      .bind(sourceId, originalUrl)
      .first<ArticleRow>();
    if (!row) return null;
    const categories = await this.getCategories([row.id]);
    return rowToRecord(row, categories[row.id] ?? []);
  }

  async listBySource(sourceId: string): Promise<ArticleRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM articles WHERE source_id = ? ORDER BY published_at DESC')
      .bind(sourceId)
      .all<ArticleRow>();
    return this.withCategories(results);
  }

  async listAll(): Promise<ArticleRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM articles ORDER BY published_at DESC')
      .all<ArticleRow>();
    return this.withCategories(results);
  }

  /** 批量查 categories 并组装到 ArticleRecord 数组。 */
  private async withCategories(rows: ArticleRow[]): Promise<ArticleRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const categoryMap = await this.getCategories(ids);
    return rows.map((row) => rowToRecord(row, categoryMap[row.id] ?? []));
  }

  /** 批量查多篇文章的 categories，返回 articleId → categories 映射。 */
  private async getCategories(ids: string[]): Promise<Record<string, string[]>> {
    if (ids.length === 0) return {};
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(`SELECT article_id, category_name FROM article_categories WHERE article_id IN (${placeholders})`)
      .bind(...ids)
      .all<{ article_id: string; category_name: string }>();
    const map: Record<string, string[]> = {};
    for (const row of results) {
      (map[row.article_id] ??= []).push(row.category_name);
    }
    return map;
  }
}

/** D1 行（snake_case）→ 领域模型（camelCase）。 */
function rowToRecord(row: ArticleRow, categories: string[]): ArticleRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    originalUrl: row.original_url,
    originalTitle: row.original_title,
    translatedTitle: row.translated_title,
    publishedAt: row.published_at,
    translatedAt: row.translated_at,
    originalLanguage: row.original_language,
    translationModel: row.translation_model,
    ...(row.translation_status ? { translationStatus: row.translation_status as ArticleRecord['translationStatus'] } : {}),
    ...(row.original_zh_url ? { originalZhUrl: row.original_zh_url } : {}),
    contentMarkdown: row.content_markdown,
    ...(row.excerpt ? { excerpt: row.excerpt } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.author ? { author: row.author } : {}),
    sourceDomain: row.source_domain,
    categories,
  };
}
