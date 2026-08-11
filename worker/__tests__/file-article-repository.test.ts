/**
 * FileArticleRepository 测试 —— Phase 2。
 *
 * 验证文件后端与 `scripts/update/persist.ts` 的 writeArticle 行为对齐：
 * 落盘路径 `<rootDir>/src/content/articles/<id>.md`、幂等返回 created:false、
 * 无 publishedAt 抛错，以及 Phase 8 铺路的读方法（getById / getByOriginalUrl /
 * listBySource / listAll）。
 *
 * 每个测试用独立临时目录（mkdtemp + try/finally 清理），串行 await 执行。
 */

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileArticleRepository } from '../repositories/file/file-article-repository.ts';
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

function makeTranslation(overrides: Partial<TranslationResult> = {}): TranslationResult {
  return {
    translatedTitle: '你好世界',
    categories: ['AI'],
    contentMarkdown: '## 你好\n\n这是翻译后的正文。',
    model: 'smoke-model',
    ...overrides,
  };
}

test('save 新建文章返回 created:true，文件落盘含正确 frontmatter', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const result = await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    assert.equal(result.created, true);
    assert.equal(result.id, 'smoke-blog/hello-world');

    const written = await readFile(
      path.join(rootDir, 'src', 'content', 'articles', 'smoke-blog', 'hello-world.md'),
      'utf8',
    );
    assert.match(written, /blog_id: "smoke-blog"/);
    assert.match(written, /original_url: "https:\/\/example\.com\/blog\/hello-world\/"/);
    assert.match(written, /image_url: "https:\/\/cdn\.example\.com\/hello-world\.jpg"/);
    assert.match(written, /published_at: 2025-06-01/);
    assert.match(written, /translation_model: "smoke-model"/);
    assert.match(written, /- "AI"/);
    assert.match(written, /## 你好/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save 同 originalUrl 幂等：第二次返回 created:false', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const input = {
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    };

    const first = await repo.save(input);
    assert.equal(first.created, true);

    const second = await repo.save(input);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);

    const files = await readdir(path.join(rootDir, 'src', 'content', 'articles'));
    assert.equal(files.length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save 无 publishedAt 抛错', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await assert.rejects(
      repo.save({
        source,
        article: makeArticle({ publishedAt: '' }),
        translation: makeTranslation(),
        translatedAt: new Date('2025-06-02T00:00:00.000Z'),
      }),
      /no published date/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('exists: 新文章 false，save 后 true', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const url = 'https://example.com/blog/hello-world/';

    const before = await repo.exists('smoke-blog', url);
    assert.equal(before, false);

    await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const after = await repo.exists('smoke-blog', url);
    assert.equal(after, true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('getById: 存在返回完整 ArticleRecord，不存在返回 null', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const result = await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const record = await repo.getById(result.id);
    assert.ok(record);
    assert.equal(record.sourceId, 'smoke-blog');
    assert.equal(record.originalUrl, 'https://example.com/blog/hello-world/');
    assert.equal(record.originalTitle, 'Hello World');
    assert.equal(record.translatedTitle, '你好世界');
    assert.equal(record.translationModel, 'smoke-model');
    assert.equal(record.sourceDomain, 'example.com');
    assert.equal(record.originalLanguage, 'en');
    assert.deepEqual(record.categories, ['AI']);
    assert.equal(record.contentMarkdown, '## 你好\n\n这是翻译后的正文。');
    assert.equal(record.publishedAt, '2025-06-01');
    assert.equal(record.translatedAt, '2025-06-02');
    assert.equal(record.imageUrl, 'https://cdn.example.com/hello-world.jpg');

    const missing = await repo.getById('does-not-exist');
    assert.equal(missing, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('getByOriginalUrl: 按 (sourceId, url) 查找', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const found = await repo.getByOriginalUrl('smoke-blog', 'https://example.com/blog/hello-world/');
    assert.equal(found?.originalTitle, 'Hello World');

    const wrongSource = await repo.getByOriginalUrl('other-source', 'https://example.com/blog/hello-world/');
    assert.equal(wrongSource, null);

    const wrongUrl = await repo.getByOriginalUrl('smoke-blog', 'https://example.com/other/');
    assert.equal(wrongUrl, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listBySource: 过滤 sourceId', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });
    await repo.save({
      source,
      article: makeArticle({
        url: 'https://example.com/blog/second-post/',
        title: 'Second Post',
      }),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    // 别的 source：同 rootDir 新实例，source.id 与 article.sourceId 均为 'other'
    const otherSource: SourceConfig = { ...source, id: 'other', name: 'Other Blog' };
    const otherRepo = new FileArticleRepository({ rootDir });
    await otherRepo.save({
      source: otherSource,
      article: makeArticle({
        sourceId: 'other',
        url: 'https://example.com/blog/other-post/',
        title: 'Other Post',
      }),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const list = await repo.listBySource('smoke-blog');
    assert.equal(list.length, 2);

    const other = await repo.listBySource('other');
    assert.equal(other.length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll: 返回所有文章', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });
    await repo.save({
      source,
      article: makeArticle({
        url: 'https://example.com/blog/second-post/',
        title: 'Second Post',
      }),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });
    const otherSource: SourceConfig = { ...source, id: 'other', name: 'Other Blog' };
    await repo.save({
      source: otherSource,
      article: makeArticle({
        sourceId: 'other',
        url: 'https://example.com/blog/other-post/',
        title: 'Other Post',
      }),
      translation: makeTranslation(),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const all = await repo.listAll();
    assert.equal(all.length, 3);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll: 空目录返回 []（不抛错）', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    // 目录存在但没有任何文章文件
    await mkdir(path.join(rootDir, 'src', 'content', 'articles'), { recursive: true });
    const repo = new FileArticleRepository({ rootDir });
    const all = await repo.listAll();
    assert.deepEqual(all, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listAll: 目录不存在返回 []（不抛错）', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    // repo 已构造但 src/content/articles 还不存在
    const repo = new FileArticleRepository({ rootDir });
    const all = await repo.listAll();
    assert.deepEqual(all, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('getById 返回的 record 含 excerpt 字段', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    const result = await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation({
        contentMarkdown: '# Title\n\n' + '正文内容 '.repeat(50),
      }),
      translatedAt: new Date('2025-06-02T00:00:00.000Z'),
    });

    const record = await repo.getById(result.id);
    assert.ok(record);
    // 超过 180 字符截断，末尾带省略号
    assert.ok(record.excerpt);
    assert.ok(record.excerpt.length > 0);
    assert.ok(record.excerpt.includes('…'));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('save: translatedAt 默认为当前时间', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-article-'));
  try {
    const repo = new FileArticleRepository({ rootDir });
    // 不传 translatedAt，落盘时间应为今天（YYYY-MM-DD）
    const today = new Date().toISOString().slice(0, 10);
    const result = await repo.save({
      source,
      article: makeArticle(),
      translation: makeTranslation(),
    });

    assert.equal(result.created, true);
    const written = await readFile(
      path.join(rootDir, 'src', 'content', 'articles', `${result.id}.md`),
      'utf8',
    );
    assert.match(written, new RegExp(`translated_at: ${today}`));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
