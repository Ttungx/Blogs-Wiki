/**
 * worker/domain/article.ts 纯函数测试。
 *
 * 测试多语言版本架构下的 frontmatter 构建/解析。
 * 黄金输出锚定 buildVersionFrontmatter 的字段顺序与格式，
 * round-trip 验证 parseVersionFile 能完整还原。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  articleIdFromUrl,
  buildVersionFileContent,
  buildVersionFrontmatter,
  excerptFromMarkdown,
  frontmatterValue,
  parseVersionFile,
  yamlDate,
  yamlScalar,
} from '../domain/article.ts';
import type {
  ArticleRecord,
  ArticleVersionRecord,
  SourceConfig,
} from '../domain/types.ts';

// ── 测试固件 ──────────────────────────────────────────

const source: SourceConfig = {
  id: 'smoke-blog',
  name: 'Smoke Blog',
  type: 'company',
  homepageUrl: 'https://example.com/',
  blogUrl: 'https://example.com/blog',
  domain: 'example.com',
  updateMode: 'active',
};

const articleRecord: ArticleRecord = {
  id: 'smoke-blog/hello-world',
  sourceId: 'smoke-blog',
  originalUrl: 'https://example.com/blog/hello-world/',
  originalLanguage: 'en',
  publishedAt: '2025-06-01',
  sourceDomain: 'example.com',
  categories: ['AI'],
};

const originalVersion: ArticleVersionRecord = {
  articleId: 'smoke-blog/hello-world',
  language: 'en',
  title: 'Hello World',
  contentMarkdown: '# Hello\n\nThis is the original body.',
  provenance: 'original',
  updatedAt: '2025-06-02',
};

const translationVersion: ArticleVersionRecord = {
  articleId: 'smoke-blog/hello-world',
  language: 'zh-cn',
  title: '你好世界',
  contentMarkdown: '# 你好\n\n这是翻译后的正文。',
  provenance: 'model',
  translationModel: 'gpt-4',
  updatedAt: '2025-06-03',
};

// ── articleIdFromUrl（不变） ──────────────────────────

test('articleIdFromUrl: blogId/slug 格式', () => {
  assert.equal(
    articleIdFromUrl('smoke-blog', 'https://example.com/blog/hello-world/'),
    'smoke-blog/hello-world',
  );
});

test('articleIdFromUrl: 剥掉日期前缀和扩展名', () => {
  assert.equal(
    articleIdFromUrl('openai', 'https://openai.com/research/2025-01-15-breakthrough.html'),
    'openai/breakthrough',
  );
});

test('articleIdFromUrl: 无路径末段时回退 article', () => {
  assert.equal(
    articleIdFromUrl('test', 'https://example.com/'),
    'test/article',
  );
});

// ── buildVersionFrontmatter 黄金输出 ──────────────────

test('buildVersionFrontmatter: 原文版本黄金输出', () => {
  const fm = buildVersionFrontmatter(source, articleRecord, originalVersion);
  assert.equal(fm, [
    '---',
    `blog_id: ${yamlScalar(source.id)}`,
    `original_url: ${yamlScalar(articleRecord.originalUrl)}`,
    `language: "en"`,
    `is_original: true`,
    `title: "Hello World"`,
    `published_at: 2025-06-01`,
    `categories:`,
    `  - "AI"`,
    `source_domain: "example.com"`,
    `original_language: "en"`,
    `provenance: "original"`,
    `version_at: 2025-06-02`,
    `excerpt: "Hello This is the original body."`,
    '---',
    '',
  ].join('\n'));
});

test('buildVersionFrontmatter: 翻译版本黄金输出', () => {
  const fm = buildVersionFrontmatter(source, articleRecord, translationVersion);
  assert.equal(fm, [
    '---',
    `blog_id: "smoke-blog"`,
    `original_url: "https://example.com/blog/hello-world/"`,
    `language: "zh-cn"`,
    `is_original: false`,
    `title: "你好世界"`,
    `published_at: 2025-06-01`,
    `categories:`,
    `  - "AI"`,
    `source_domain: "example.com"`,
    `original_language: "en"`,
    `provenance: "model"`,
    `translation_model: "gpt-4"`,
    `version_at: 2025-06-03`,
    `excerpt: "你好 这是翻译后的正文。"`,
    '---',
    '',
  ].join('\n'));
});

test('buildVersionFrontmatter: 空 categories 用内联 []', () => {
  const articleNoCats = { ...articleRecord, categories: [] };
  const fm = buildVersionFrontmatter(source, articleNoCats, originalVersion);
  assert.ok(fm.includes('categories: []'));
  assert.ok(!fm.includes('  - '));
});

test('buildVersionFrontmatter: 可选字段缺失时不输出该行', () => {
  const minimalArticle: ArticleRecord = {
    id: 'test/minimal',
    sourceId: 'test',
    originalUrl: 'https://example.com/minimal/',
    originalLanguage: 'en',
    publishedAt: '2025-01-01',
    sourceDomain: 'example.com',
    categories: [],
  };
  const minimalVersion: ArticleVersionRecord = {
    articleId: 'test/minimal',
    language: 'en',
    title: 'Minimal',
    contentMarkdown: 'Short.',
    provenance: 'original',
    updatedAt: '2025-01-02',
  };
  const fm = buildVersionFrontmatter(source, minimalArticle, minimalVersion);
  assert.ok(!fm.includes('translation_model'));
  assert.ok(!fm.includes('original_alt_url'));
  assert.ok(!fm.includes('image_url'));
  assert.ok(!fm.includes('author'));
  assert.ok(fm.includes('excerpt: "Short."'));
});

// ── parseVersionFile round-trip ───────────────────────

test('parseVersionFile: round-trip build → parse（原文版本）', () => {
  const fileContent = buildVersionFileContent(source, articleRecord, originalVersion);
  const parsed = parseVersionFile('smoke-blog/en/hello-world', fileContent);
  assert.ok(parsed);
  assert.equal(parsed.article.id, 'smoke-blog/hello-world');
  assert.equal(parsed.article.sourceId, 'smoke-blog');
  assert.equal(parsed.article.originalUrl, 'https://example.com/blog/hello-world/');
  assert.equal(parsed.article.originalLanguage, 'en');
  assert.equal(parsed.article.publishedAt, '2025-06-01');
  assert.equal(parsed.article.sourceDomain, 'example.com');
  assert.deepEqual(parsed.article.categories, ['AI']);
  assert.equal(parsed.version.language, 'en');
  assert.equal(parsed.version.title, 'Hello World');
  assert.equal(parsed.version.provenance, 'original');
  assert.equal(parsed.version.contentMarkdown, '# Hello\n\nThis is the original body.');
});

test('parseVersionFile: round-trip build → parse（翻译版本）', () => {
  const fileContent = buildVersionFileContent(source, articleRecord, translationVersion);
  const parsed = parseVersionFile('smoke-blog/zh-cn/hello-world', fileContent);
  assert.ok(parsed);
  assert.equal(parsed.version.language, 'zh-cn');
  assert.equal(parsed.version.title, '你好世界');
  assert.equal(parsed.version.provenance, 'model');
  assert.equal(parsed.version.translationModel, 'gpt-4');
  assert.equal(parsed.version.contentMarkdown, '# 你好\n\n这是翻译后的正文。');
  // articleId 从文件 id 派生（去掉语言段）
  assert.equal(parsed.article.id, 'smoke-blog/hello-world');
});

test('parseVersionFile: 空 categories 正确解析', () => {
  const articleNoCats = { ...articleRecord, categories: [] };
  const fileContent = buildVersionFileContent(source, articleNoCats, originalVersion);
  const parsed = parseVersionFile('smoke-blog/en/hello-world', fileContent);
  assert.ok(parsed);
  assert.deepEqual(parsed.article.categories, []);
});

test('parseVersionFile: 缺必需字段返回 null', () => {
  const content = [
    '---',
    'blog_id: "test"',
    'original_url: "https://example.com/"',
    'language: "en"',
    'title: "Test"',
    '---',
    'Body.',
  ].join('\n');
  // 缺 published_at, source_domain, original_language, provenance, version_at
  assert.equal(parseVersionFile('test/en/test', content), null);
});

test('parseVersionFile: 无 frontmatter 块返回 null', () => {
  assert.equal(parseVersionFile('id', '纯正文无 frontmatter'), null);
});

// ── articleId 从文件 id 派生 ──────────────────────────

test('parseVersionFile: 三段 id blogId/lang/slug → articleId blogId/slug', () => {
  const fileContent = buildVersionFileContent(source, articleRecord, originalVersion);
  const parsed = parseVersionFile('smoke-blog/en/hello-world', fileContent);
  assert.ok(parsed);
  assert.equal(parsed.article.id, 'smoke-blog/hello-world');
});

// ── 工具函数 ──────────────────────────────────────────

test('yamlScalar: JSON 风格双引号', () => {
  assert.equal(yamlScalar('hello'), '"hello"');
  assert.equal(yamlScalar('含"引号'), '"含\\"引号"');
});

test('yamlDate: Date 取 ISO 日期部分', () => {
  assert.equal(yamlDate(new Date('2025-06-01T12:00:00Z')), '2025-06-01');
  assert.equal(yamlDate('2025-06-01'), '2025-06-01');
});

test('excerptFromMarkdown: 去标记后截断', () => {
  const md = '# Title\n\n```code\nblock\n```\n\nThis is **bold** text.';
  const excerpt = excerptFromMarkdown(md);
  assert.ok(excerpt.includes('This is bold text'));
  assert.ok(!excerpt.includes('#'));
  assert.ok(!excerpt.includes('```'));
});

test('excerptFromMarkdown: 空正文返回空字符串', () => {
  assert.equal(excerptFromMarkdown(''), '');
});

test('frontmatterValue: 提取 original_url', () => {
  const fileContent = buildVersionFileContent(source, articleRecord, originalVersion);
  assert.equal(
    frontmatterValue(fileContent, 'original_url'),
    'https://example.com/blog/hello-world/',
  );
});

test('frontmatterValue: 不存在的字段返回 null', () => {
  const fileContent = buildVersionFileContent(source, articleRecord, originalVersion);
  assert.equal(frontmatterValue(fileContent, 'nonexistent'), null);
});
