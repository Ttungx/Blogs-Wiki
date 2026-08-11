/**
 * FileArticleRepository 测试 —— 多语言版本架构。
 *
 * 验证：
 * - save() 写原文版本到 articles/{blogId}/{originalLanguage}/{slug}.md
 * - saveVersion() 写翻译版本到 articles/{blogId}/{language}/{slug}.md
 * - 幂等：同 (sourceId, originalUrl) 或同 (articleId, language) 不重复写
 * - getVersion / listVersions / listAll（按 articleId 去重）
 * - 无 publishedAt 抛错
 *
 * 每个测试用独立临时目录（mkdtemp + try/finally 清理）。
 */

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileArticleRepository } from '../repositories/file/file-article-repository.ts';
import type { RawArticle, SourceConfig } from '../domain/types.ts';

const source: SourceConfig = {
  id: 'smoke-blog',
  name: 'Smoke Blog',
  type: 'company',
  homepageUrl: 'https://example.com/',
  blogUrl: 'https://example.com/blog',
  domain: 'example.com',
  updateMode: 'active',
};

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    sourceId: 'smoke-blog',
    url: 'https://example.com/blog/hello-world/',
    title: 'Hello World',
    imageUrl: 'https://cdn.example.com/hello-world.jpg',
    publishedAt: '2025-06-01',
    originalLanguage: 'en',
    contentMarkdown: '# Hello\n\nThis is the original body.',
    ...overrides,
  };
}

const articlesDir = (root: string) => path.join(root, 'src', 'content', 'articles');

// ── save() ────────────────────────────────────────────

test('save 新建原文版本：文件路径 blogId/en/slug.md，frontmatter 含 language/provenance', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const result = await repo.save({ source, article: makeArticle() });
    assert.equal(result.created, true);
    assert.equal(result.id, 'smoke-blog/hello-world');

    const file = path.join(articlesDir(rootDir), 'smoke-blog', 'en', 'hello-world.md');
    const written = await readFile(file, 'utf8');
    assert.match(written, /language: "en"/);
    assert.match(written, /is_original: true/);
    assert.match(written, /title: "Hello World"/);
    assert.match(written, /provenance: "original"/);
    assert.match(written, /published_at: 2025-06-01/);
    assert.match(written, /# Hello/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save 同 originalUrl 幂等返回 created:false', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const input = { source, article: makeArticle() };
    const first = await repo.save(input);
    const second = await repo.save(input);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save 无 publishedAt 抛错', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await assert.rejects(
      repo.save({ source, article: makeArticle({ publishedAt: '' }) }),
      /no published date/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save slug 冲突加 -2 后缀', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const a = await repo.save({ source, article: makeArticle() });
    // 同 blogId 同 slug 但不同 URL → 冲突
    const b = await repo.save({
      source,
      article: makeArticle({ url: 'https://example.com/blog/hello-world-v2/' }),
    });
    assert.equal(a.id, 'smoke-blog/hello-world');
    assert.equal(b.id, 'smoke-blog/hello-world-2');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── saveVersion() ─────────────────────────────────────

test('saveVersion 写翻译版本到 blogId/zh-cn/slug.md', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    const vResult = await repo.saveVersion({
      articleId: saved.id,
      language: 'zh-cn',
      title: '你好世界',
      contentMarkdown: '## 你好\n\n这是翻译后的正文。',
      provenance: 'model',
      translationModel: 'gpt-4',
      categories: ['AI'],
    });
    assert.equal(vResult.created, true);

    const file = path.join(articlesDir(rootDir), 'smoke-blog', 'zh-cn', 'hello-world.md');
    const written = await readFile(file, 'utf8');
    assert.match(written, /language: "zh-cn"/);
    assert.match(written, /is_original: false/);
    assert.match(written, /title: "你好世界"/);
    assert.match(written, /provenance: "model"/);
    assert.match(written, /translation_model: "gpt-4"/);
    assert.match(written, /- "AI"/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('saveVersion 幂等：同 language 已存在返回 created:false', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    const input = {
      articleId: saved.id,
      language: 'zh-cn',
      title: '你好',
      contentMarkdown: '# 你好',
      provenance: 'model' as const,
    };
    const first = await repo.saveVersion(input);
    const second = await repo.saveVersion(input);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('saveVersion 在 save 之前调用抛错', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await assert.rejects(
      repo.saveVersion({
        articleId: 'nonexistent/article',
        language: 'zh-cn',
        title: '标题',
        contentMarkdown: '# 内容',
        provenance: 'model',
      }),
      /article not found/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── exists / getById / getByOriginalUrl ───────────────

test('exists: save 前为 false，save 后为 true', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const url = 'https://example.com/blog/hello-world/';
    assert.equal(await repo.exists('smoke-blog', url), false);
    await repo.save({ source, article: makeArticle() });
    assert.equal(await repo.exists('smoke-blog', url), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('getById 返回 ArticleRecord（身份字段，无内容）', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    const record = await repo.getById(saved.id);
    assert.ok(record);
    assert.equal(record.sourceId, 'smoke-blog');
    assert.equal(record.originalUrl, 'https://example.com/blog/hello-world/');
    assert.equal(record.originalLanguage, 'en');
    assert.equal(record.publishedAt, '2025-06-01');
    assert.equal(record.sourceDomain, 'example.com');
    assert.deepEqual(record.categories, []);
    // 不存在的返回 null
    assert.equal(await repo.getById('no/such'), null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('getByOriginalUrl 按 (sourceId, url) 查找', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await repo.save({ source, article: makeArticle() });
    const found = await repo.getByOriginalUrl('smoke-blog', 'https://example.com/blog/hello-world/');
    assert.ok(found);
    assert.equal(found.sourceId, 'smoke-blog');
    assert.equal(await repo.getByOriginalUrl('other', 'https://example.com/blog/hello-world/'), null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── getVersion / listVersions ─────────────────────────

test('getVersion 返回指定语言版本内容', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    await repo.saveVersion({
      articleId: saved.id,
      language: 'zh-cn',
      title: '你好世界',
      contentMarkdown: '# 你好',
      provenance: 'model',
      translationModel: 'gpt-4',
      categories: ['AI'],
    });

    const en = await repo.getVersion(saved.id, 'en');
    assert.ok(en);
    assert.equal(en.language, 'en');
    assert.equal(en.title, 'Hello World');
    assert.equal(en.provenance, 'original');

    const zh = await repo.getVersion(saved.id, 'zh-cn');
    assert.ok(zh);
    assert.equal(zh.language, 'zh-cn');
    assert.equal(zh.title, '你好世界');
    assert.equal(zh.translationModel, 'gpt-4');

    assert.equal(await repo.getVersion(saved.id, 'ja'), null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listVersions 返回文章的所有语言版本', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    await repo.saveVersion({
      articleId: saved.id,
      language: 'zh-cn',
      title: '你好',
      contentMarkdown: '# 你好',
      provenance: 'model',
    });
    const versions = await repo.listVersions(saved.id);
    assert.equal(versions.length, 2);
    const langs = versions.map((v) => v.language).sort();
    assert.deepEqual(langs, ['en', 'zh-cn']);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── listBySource / listAll ────────────────────────────

test('listBySource 过滤 sourceId', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await repo.save({ source, article: makeArticle() });
    await repo.save({
      source,
      article: makeArticle({ url: 'https://example.com/blog/second/', title: 'Second' }),
    });
    const other: SourceConfig = { ...source, id: 'other' };
    await repo.save({
      source: other,
      article: makeArticle({ sourceId: 'other', url: 'https://example.com/blog/other/' }),
    });
    assert.equal((await repo.listBySource('smoke-blog')).length, 2);
    assert.equal((await repo.listBySource('other')).length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll 按 articleId 去重（多语言版本只算 1 篇）', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const saved = await repo.save({ source, article: makeArticle() });
    await repo.saveVersion({
      articleId: saved.id,
      language: 'zh-cn',
      title: '你好',
      contentMarkdown: '# 你好',
      provenance: 'model',
    });
    // 2 个文件（en + zh-cn）但只有 1 篇文章
    const all = await repo.listAll();
    assert.equal(all.length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll 空目录返回 []', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    await mkdir(articlesDir(rootDir), { recursive: true });
    const repo = new FileArticleRepository({ rootDir });
    assert.deepEqual(await repo.listAll(), []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll 目录不存在返回 []', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-far-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    assert.deepEqual(await repo.listAll(), []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
