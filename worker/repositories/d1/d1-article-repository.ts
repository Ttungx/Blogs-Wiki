/**
 * D1ArticleRepository —— D1 后端的 ArticleRepository 实现（多语言架构）。
 *
 * 一篇文章拆为两层：
 * - articles：身份行（id、url、发布日期、作者等），UNIQUE(source_id, original_url)。
 * - article_versions：语言版本行（标题、正文、provenance），PK(article_id, language)。
 *
 * save() 写身份 + 原文版本（原文无分类）；saveVersion() 为已有文章追加/更新语言版本。
 * 幂等语义由 schema 的 UNIQUE/PK + ON CONFLICT upsert 保证。
 *
 * 与 FileArticleRepository 实现同一个接口（ArticleRepository），调用方无需感知底层差异。
 */

import { articleIdFromUrl, excerptFromMarkdown } from '../../domain/article';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  ArticleRecord,
  ArticleVersionRecord,
  ContentSource,
  Provenance,
  SaveArticleInput,
  SaveResult,
  SaveVersionInput,
} from '../../domain/types';
import type { ArticleRepository } from '../article-repository';

/** articles 行结构（snake_case，仅身份字段）。 */
interface ArticleRow {
  id: string;
  source_id: string;
  original_url: string;
  original_language: string;
  published_at: string;
  image_url: string | null;
  author: string | null;
  source_domain: string;
}

/** article_versions 行结构（snake_case）。 */
interface VersionRow {
  article_id: string;
  language: string;
  title: string;
  content_markdown: string;
  excerpt: string | null;
  provenance: string;
  translation_model: string | null;
  original_alt_url: string | null;
  updated_at: string;
}

/** 文章身份 upsert：ON CONFLICT(source_id, original_url) 刷新身份字段。 */
const ARTICLE_UPSERT_SQL = `
  INSERT INTO articles (
    id, source_id, original_url, original_language, published_at,
    image_url, author, source_domain
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id, original_url) DO UPDATE SET
    id = excluded.id,
    original_language = excluded.original_language,
    published_at = excluded.published_at,
    image_url = excluded.image_url,
    author = excluded.author,
    updated_at = datetime('now')
`;

/** 原文版本 upsert（save() 写入，无 translation_model / original_alt_url）。 */
const ARTICLE_VERSION_ORIGINAL_SQL = `
  INSERT INTO article_versions (article_id, language, title, content_markdown, excerpt, provenance)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(article_id, language) DO UPDATE SET
    title = excluded.title,
    content_markdown = excluded.content_markdown,
    excerpt = excluded.excerpt,
    provenance = excluded.provenance,
    updated_at = datetime('now')
`;

/** 语言版本 upsert（saveVersion() 写入，含 translation_model / original_alt_url）。 */
const ARTICLE_VERSION_UPSERT_SQL = `
  INSERT INTO article_versions (
    article_id, language, title, content_markdown, excerpt, provenance,
    translation_model, original_alt_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(article_id, language) DO UPDATE SET
    title = excluded.title,
    content_markdown = excluded.content_markdown,
    excerpt = excluded.excerpt,
    provenance = excluded.provenance,
    translation_model = excluded.translation_model,
    original_alt_url = excluded.original_alt_url,
    updated_at = datetime('now')
`;

/** 保存文章前同步来源注册表，确保 articles 的外键可独立成立。 */
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

/**
 * 从抓取层的内容来源标记推导原文版本的 provenance。
 * 官方/原生中文直存保留对应标记；其余（含模型翻译与未声明）一律按原文 ('original')。
 */
function provenanceFromContentSource(contentSource: ContentSource | undefined): Provenance {
  if (contentSource === 'official-zh') return 'official-zh';
  if (contentSource === 'native-zh') return 'native-zh';
  return 'original';
}

export class D1ArticleRepository implements ArticleRepository {
  constructor(private readonly db: D1Database) {}

  async save(input: SaveArticleInput): Promise<SaveResult> {
    const { source, article } = input;
    if (!article.publishedAt) {
      throw new Error(
        `cannot persist ${article.url}: no published date available (page metadata and discovery both missing)`,
      );
    }

    const id = articleIdFromUrl(source.id, article.url);
    const excerpt = excerptFromMarkdown(article.contentMarkdown);
    const provenance = provenanceFromContentSource(article.contentSource);

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
        .prepare(ARTICLE_UPSERT_SQL)
        .bind(
          id,
          source.id,
          article.url,
          article.originalLanguage,
          article.publishedAt,
          article.imageUrl ?? null,
          article.author ?? null,
          source.domain,
        ),
      this.db
        .prepare(ARTICLE_VERSION_ORIGINAL_SQL)
        .bind(
          id,
          article.originalLanguage,
          article.title,
          article.contentMarkdown,
          excerpt || null,
          provenance,
        ),
      // 原文无分类；DELETE 清掉可能存在的旧分类（如重新保存），与文章 upsert 同 batch 保证原子。
      this.db.prepare('DELETE FROM article_categories WHERE article_id = ?').bind(id),
    ];
    await this.db.batch(statements);

    return { id, created: !existing };
  }

  async saveVersion(input: SaveVersionInput): Promise<SaveResult> {
    // 前置：文章身份必须存在（saveVersion 不创建文章）。
    const article = await this.db
      .prepare('SELECT id FROM articles WHERE id = ?')
      .bind(input.articleId)
      .first<{ id: string }>();
    if (!article) {
      throw new Error(`cannot save version: article ${input.articleId} does not exist`);
    }

    // 幂等：(article_id, language) 已存在则 created:false。
    const existingVersion = await this.db
      .prepare('SELECT 1 FROM article_versions WHERE article_id = ? AND language = ?')
      .bind(input.articleId, input.language)
      .first();

    const excerpt = excerptFromMarkdown(input.contentMarkdown);
    await this.db
      .prepare(ARTICLE_VERSION_UPSERT_SQL)
      .bind(
        input.articleId,
        input.language,
        input.title,
        input.contentMarkdown,
        excerpt || null,
        input.provenance,
        input.translationModel ?? null,
        input.originalAltUrl ?? null,
      )
      .run();

    return { id: input.articleId, created: !existingVersion };
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

  async getVersion(articleId: string, language: string): Promise<ArticleVersionRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM article_versions WHERE article_id = ? AND language = ? LIMIT 1')
      .bind(articleId, language)
      .first<VersionRow>();
    if (!row) return null;
    return rowToVersion(row);
  }

  async listVersions(articleId: string): Promise<ArticleVersionRecord[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM article_versions WHERE article_id = ? ORDER BY language')
      .bind(articleId)
      .all<VersionRow>();
    return results.map(rowToVersion);
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

/** articles 行（snake_case）→ 领域模型 ArticleRecord（camelCase）。 */
function rowToRecord(row: ArticleRow, categories: string[]): ArticleRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    originalUrl: row.original_url,
    originalLanguage: row.original_language,
    publishedAt: row.published_at,
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.author ? { author: row.author } : {}),
    sourceDomain: row.source_domain,
    categories,
  };
}

/** article_versions 行（snake_case）→ 领域模型 ArticleVersionRecord（camelCase）。 */
function rowToVersion(row: VersionRow): ArticleVersionRecord {
  return {
    articleId: row.article_id,
    language: row.language,
    title: row.title,
    contentMarkdown: row.content_markdown,
    ...(row.excerpt ? { excerpt: row.excerpt } : {}),
    provenance: row.provenance as Provenance,
    ...(row.translation_model ? { translationModel: row.translation_model } : {}),
    ...(row.original_alt_url ? { originalAltUrl: row.original_alt_url } : {}),
    updatedAt: row.updated_at,
  };
}
