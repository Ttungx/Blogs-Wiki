/**
 * D1 测试共享 fixtures：source / article / translation 测试数据。
 * 与 FileArticleRepository 测试数据对齐（smoke-blog / hello-world）。
 */

import type {
  RawArticle,
  SaveArticleInput,
  SourceConfig,
  TranslationResult,
} from "../../domain/types.ts";
import type { D1Database } from "@cloudflare/workers-types";

export const source: SourceConfig = {
  id: "smoke-blog",
  name: "Smoke Blog",
  type: "company",
  homepageUrl: "https://example.com/",
  blogUrl: "https://example.com/blog",
  domain: "example.com",
  updateMode: "active",
};

/** 在 D1 sources 表插入测试用的 source 记录（满足外键约束）。 */
export async function seedSources(db: D1Database, ...sources: SourceConfig[]): Promise<void> {
  for (const s of sources) {
    await db
      .prepare('INSERT INTO sources (id, name, type, homepage_url, blog_url, domain) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(s.id, s.name, s.type, s.homepageUrl, s.blogUrl, s.domain)
      .run();
  }
}

/** 在 D1 categories 表插入测试用的分类记录（满足 article_categories 外键约束）。 */
export async function seedCategories(db: D1Database, ...names: string[]): Promise<void> {
  for (const name of names) {
    await db
      .prepare('INSERT INTO categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
      .bind(name)
      .run();
  }
}

/** 项目使用的完整分类集合（与 src/config/categories.ts 对齐）。 */
export const ALL_CATEGORIES = [
  'AI', 'Agent', 'AI Coding / Developer Tools', 'Research',
  'Engineering / Infrastructure', 'Internet / Technology',
  'Personal Growth', 'Other',
];

export function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    sourceId: "smoke-blog",
    url: "https://example.com/blog/hello-world/",
    title: "Hello World",
    imageUrl: "https://cdn.example.com/hello-world.jpg",
    publishedAt: "2025-06-01",
    originalLanguage: "en",
    contentMarkdown: "# Hello\n\nThis is the original body.",
    ...overrides,
  };
}

export function makeTranslation(overrides: Partial<TranslationResult> = {}): TranslationResult {
  return {
    translatedTitle: "你好世界",
    categories: ["AI"],
    contentMarkdown: "## 你好\n\n这是翻译后的正文。",
    model: "smoke-model",
    ...overrides,
  };
}

export function makeSaveInput(overrides: {
  article?: Partial<RawArticle>;
  translation?: Partial<TranslationResult>;
} = {}): SaveArticleInput {
  return {
    source,
    article: makeArticle(overrides.article),
    translation: makeTranslation(overrides.translation),
  };
}
