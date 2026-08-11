/**
 * worker/domain/article.ts 纯函数测试。
 *
 * 被测函数是从 scripts/update/persist.ts + urls.ts 复刻的领域层实现，
 * 本测试用黄金输出锚定两端字节一致（见 AGENTS.md 手册 §15 过渡期说明）。
 * 测试数据与 scripts/update/smoke.ts:47-71 对齐。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  articleIdFromUrl,
  buildArticleFrontmatter,
  excerptFromMarkdown,
  frontmatterValue,
  parseArticleFrontmatter,
  yamlDate,
  yamlScalar,
} from '../domain/article.ts';
import type { RawArticle, SourceConfig, TranslationResult } from '../domain/types.ts';

const source: SourceConfig = {
  id: 'smoke-blog',
  name: 'Smoke Blog',
  type: 'company',
  homepageUrl: 'https://example.com/',
  blogUrl: 'https://example.com/blog',
  domain: 'example.com',
  updateMode: 'active',
};

const article: RawArticle = {
  sourceId: 'smoke-blog',
  url: 'https://example.com/blog/hello-world/',
  title: 'Hello World',
  imageUrl: 'https://cdn.example.com/hello-world.jpg',
  publishedAt: '2025-06-01',
  originalLanguage: 'en',
  contentMarkdown: '# Hello\n\nThis is the original body.',
};

const translation: TranslationResult = {
  translatedTitle: '你好世界',
  categories: ['AI'],
  contentMarkdown: '## 你好\n\n这是翻译后的正文。',
  model: 'smoke-model',
};

const translatedAt = new Date('2025-06-02T00:00:00.000Z');

// articleIdFromUrl：{blogId}/{slug}，slug 取 URL 末段，剥日期前缀，末段为空回落 'article'
test('articleIdFromUrl: {blogId}/{slug} 格式，去哈希剥日期', () => {
  assert.equal(
    articleIdFromUrl('smoke-blog', 'https://example.com/blog/hello-world/'),
    'smoke-blog/hello-world',
  );
  assert.equal(
    articleIdFromUrl('smoke-blog', 'https://example.com/blog/hello-world/'),
    articleIdFromUrl('smoke-blog', 'https://example.com/blog/hello-world/'),
  );
  assert.equal(articleIdFromUrl('smoke-blog', 'https://example.com/'), 'smoke-blog/article');
  // 日期前缀剥离：2026-07-04-harness → harness
  assert.equal(
    articleIdFromUrl('lilian-weng', 'https://lilianweng.github.io/posts/2026-07-04-harness'),
    'lilian-weng/harness',
  );
});

// buildArticleFrontmatter：黄金输出与 scripts/update/persist.ts 字节一致（末尾有一个换行）
test('buildArticleFrontmatter: 黄金输出与 scripts/update/persist.ts 字节一致', () => {
  const expected = `---
blog_id: "smoke-blog"
original_url: "https://example.com/blog/hello-world/"
image_url: "https://cdn.example.com/hello-world.jpg"
original_title: "Hello World"
translated_title: "你好世界"
published_at: 2025-06-01
categories:
  - "AI"
translation_model: "smoke-model"
translated_at: 2025-06-02
source_domain: "example.com"
original_language: "en"
excerpt: "你好 这是翻译后的正文。"
---
`;
  assert.equal(buildArticleFrontmatter(source, article, translation, translatedAt), expected);
});

// buildArticleFrontmatter：可选字段缺失时不输出该行，excerpt 在内容足够时仍出现
test('buildArticleFrontmatter: 可选字段缺失时不输出该行', () => {
  const minimalArticle: RawArticle = { ...article, imageUrl: undefined };
  const minimalTranslation: TranslationResult = {
    ...translation,
    translationStatus: undefined,
    originalZhUrl: undefined,
  };
  const output = buildArticleFrontmatter(source, minimalArticle, minimalTranslation, translatedAt);
  assert.ok(!output.includes('image_url:'));
  assert.ok(!output.includes('translation_status:'));
  assert.ok(!output.includes('original_zh_url:'));
  assert.ok(!output.includes('author:'));
  assert.ok(output.includes('excerpt:'));
});

// excerptFromMarkdown：去代码块/图片/链接标记 + 空白压缩 + 长文本截断加省略号
test('excerptFromMarkdown: 去标记 + 截断', () => {
  assert.equal(excerptFromMarkdown('## 你好\n\n这是翻译后的正文。'), '你好 这是翻译后的正文。');
  assert.equal(
    excerptFromMarkdown('```code\nblock\n```\n![img](x.png)\n[link](y.com)\n# 标题\n正文'),
    'link 标题 正文',
  );
  assert.equal(excerptFromMarkdown('短文本'), '短文本');
  assert.equal(excerptFromMarkdown(''), '');
  const long = excerptFromMarkdown('a'.repeat(200));
  assert.equal(long.length, 181);
  assert.ok(long.endsWith('…'));
});

// yamlScalar：JSON 风格双引号编码（JSON.stringify）
test('yamlScalar: JSON 风格双引号', () => {
  assert.equal(yamlScalar('hello'), '"hello"');
  assert.equal(yamlScalar('含"引号'), '"含\\"引号"');
  assert.equal(yamlScalar('path/with/slash'), '"path/with/slash"');
});

// yamlDate：Date 取 ISO 日期部分（YYYY-MM-DD），字符串原样输出
test('yamlDate: Date 取 ISO 日期部分，字符串原样', () => {
  assert.equal(yamlDate(new Date('2025-06-01T13:45:00.000Z')), '2025-06-01');
  assert.equal(yamlDate('2025-06-01'), '2025-06-01');
  assert.equal(yamlDate('2025-06-01T13:45:00.000Z'), '2025-06-01T13:45:00.000Z');
});

// frontmatterValue：提取字段值，JSON.parse 失败（裸日期）回退原值，缺 key 返回 null
test('frontmatterValue: 提取 + JSON 反序列化', () => {
  const content = buildArticleFrontmatter(source, article, translation, translatedAt);
  assert.equal(frontmatterValue(content, 'blog_id'), 'smoke-blog');
  assert.equal(frontmatterValue(content, 'original_url'), 'https://example.com/blog/hello-world/');
  assert.equal(frontmatterValue(content, 'published_at'), '2025-06-01');
  assert.equal(frontmatterValue(content, 'nonexistent'), null);
});

// parseArticleFrontmatter：build → parse round-trip，全部字段还原一致
test('parseArticleFrontmatter: round-trip build → parse', () => {
  const id = 'test-id';
  const fileContent =
    buildArticleFrontmatter(source, article, translation, translatedAt) +
    translation.contentMarkdown.replace(/\s+$/, '') +
    '\n';
  const record = parseArticleFrontmatter(id, fileContent);
  assert.equal(record?.id, id);
  assert.equal(record?.sourceId, 'smoke-blog');
  assert.equal(record?.originalUrl, 'https://example.com/blog/hello-world/');
  assert.equal(record?.imageUrl, 'https://cdn.example.com/hello-world.jpg');
  assert.equal(record?.originalTitle, 'Hello World');
  assert.equal(record?.translatedTitle, '你好世界');
  assert.equal(record?.publishedAt, '2025-06-01');
  assert.equal(record?.translatedAt, '2025-06-02');
  assert.equal(record?.translationModel, 'smoke-model');
  assert.equal(record?.sourceDomain, 'example.com');
  assert.equal(record?.originalLanguage, 'en');
  assert.deepEqual(record?.categories, ['AI']);
  assert.equal(record?.contentMarkdown, '## 你好\n\n这是翻译后的正文。');
  assert.equal(record?.excerpt, '你好 这是翻译后的正文。');
  assert.equal(record?.author, undefined);
  assert.equal(record?.translationStatus, undefined);
  assert.equal(record?.originalZhUrl, undefined);
});

// parseArticleFrontmatter：带 translationStatus / originalZhUrl / author 时正确还原
test('parseArticleFrontmatter: 带 translationStatus / originalZhUrl / author', () => {
  const fullArticle: RawArticle = { ...article, author: '作者名' };
  const fullTranslation: TranslationResult = {
    ...translation,
    translationStatus: 'official-zh',
    originalZhUrl: 'https://example.com/zh/hello-world/',
  };
  const fileContent =
    buildArticleFrontmatter(source, fullArticle, fullTranslation, translatedAt) +
    translation.contentMarkdown.replace(/\s+$/, '') +
    '\n';
  const record = parseArticleFrontmatter('test-id', fileContent);
  assert.equal(record?.author, '作者名');
  assert.equal(record?.translationStatus, 'official-zh');
  assert.equal(record?.originalZhUrl, 'https://example.com/zh/hello-world/');
});

// parseArticleFrontmatter：缺必需字段（original_url）返回 null
test('parseArticleFrontmatter: 缺必需字段返回 null', () => {
  const content = `---
blog_id: "smoke-blog"
original_title: "Hello World"
translated_title: "你好世界"
published_at: 2025-06-01
categories:
  - "AI"
translation_model: "smoke-model"
translated_at: 2025-06-02
source_domain: "example.com"
original_language: "en"
---
正文`;
  assert.equal(parseArticleFrontmatter('test-id', content), null);
});

// parseArticleFrontmatter：无 frontmatter 块返回 null
test('parseArticleFrontmatter: 无 frontmatter 块返回 null', () => {
  assert.equal(parseArticleFrontmatter('id', '纯正文无 frontmatter'), null);
});
