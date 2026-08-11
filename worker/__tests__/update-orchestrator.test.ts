/**
 * worker/runtime/update-orchestrator.ts 编排器测试。
 *
 * 全部用 in-memory mock（repos / discover / fetchArticle / translate），
 * 不碰真实网络与 D1。fetchArticle 注入点保证本测试无需驱动 Defuddle/linkedom。
 * 与 repository-factory.test.ts 同为 node:test + tsx 风格（npm run test:worker）。
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import type { WorkerRepositories } from '../runtime/repositories';
import {
  aggregateResults,
  createTranslator,
  processSource,
  type FetchArticleFn,
  type SourceUpdateResult,
} from '../runtime/update-orchestrator';
import type { SourceItemRecord, SourceRunRecord } from '../domain/types';
import type {
  DiscoveredArticle,
  SourceConfig,
  TranslateArticle,
} from '../../scripts/update/types';

const source: SourceConfig = {
  id: 'test-source',
  name: 'Test Source',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog/',
  domain: 'example.com',
  update_mode: 'active',
};

const discoveredArticles: DiscoveredArticle[] = [
  { url: 'https://example.com/blog/first/', title: 'First Post', publishedAt: '2026-08-01' },
  { url: 'https://example.com/blog/second/', title: 'Second Post', publishedAt: '2026-08-02' },
];

/** 与 fetchWorkerArticle 同形状的 mock 抓取结果。 */
function makeArticleResult(discovered: DiscoveredArticle) {
  return {
    url: discovered.url,
    title: discovered.title ?? 'Untitled',
    author: '',
    imageUrl: '',
    publishedAt: discovered.publishedAt ?? '',
    originalLanguage: 'en',
    contentMarkdown: `# ${discovered.title ?? 'Untitled'}\n\nBody.`,
  };
}

const fetchArticle: FetchArticleFn = async (_source, discovered) => makeArticleResult(discovered);

const translate: TranslateArticle = async (article) => ({
  translatedTitle: `译：${article.title}`,
  categories: ['AI'],
  contentMarkdown: article.contentMarkdown,
  model: 'test-model',
});

function makeSourceItemRecord(overrides: Partial<SourceItemRecord>): SourceItemRecord {
  return {
    id: 1,
    sourceId: source.id,
    originalUrl: 'https://example.com/blog/x/',
    status: 'discovered',
    attemptCount: 0,
    discoveredAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}

function makeSourceRunRecord(overrides: Partial<SourceRunRecord>): SourceRunRecord {
  return {
    id: 1,
    sourceId: source.id,
    startedAt: '2026-08-11T00:00:00.000Z',
    status: 'running',
    discovered: 0,
    pending: 0,
    processed: 0,
    failed: 0,
    ...overrides,
  };
}

/** in-memory repos：全部方法返回 Promise，并统计关键调用次数。 */
function createMockRepos(options: { processedUrls?: string[] } = {}) {
  let nextItemId = 1;
  const calls = { save: 0, saveVersion: 0, markProcessed: 0, transition: 0, recordFailure: 0 };
  const repos: WorkerRepositories = {
    articles: {
      getById: async () => null,
      getByOriginalUrl: async () => null,
      getVersion: async () => null,
      listVersions: async () => [],
      listBySource: async () => [],
      listAll: async () => [],
      save: async () => {
        calls.save += 1;
        return { id: 'test/test', created: true };
      },
      saveVersion: async () => {
        calls.saveVersion += 1;
        return { id: 'test/test', created: true };
      },
      exists: async () => false,
    },
    sourceState: {
      hasSeen: async () => false,
      markProcessed: async () => {
        calls.markProcessed += 1;
      },
      listProcessed: async () => options.processedUrls ?? [],
      loadAll: async () => ({ version: 1, updatedAt: null, blogs: {} }),
      reconcile: async () => 0,
    },
    sourceItems: {
      discover: async (input) =>
        makeSourceItemRecord({ id: nextItemId++, originalUrl: input.originalUrl, title: input.title, publishedAt: input.publishedAt }),
      getById: async () => null,
      listBySource: async () => [],
      transition: async (id, status) => {
        calls.transition += 1;
        return makeSourceItemRecord({ id, status });
      },
      recordFailure: async (id, error) => {
        calls.recordFailure += 1;
        return makeSourceItemRecord({ id, status: 'failed', lastError: error, attemptCount: 1 });
      },
    },
    sourceRuns: {
      create: async (input) =>
        makeSourceRunRecord({ sourceId: input.sourceId, startedAt: input.startedAt ?? '2026-08-11T00:00:00.000Z' }),
      getById: async () => null,
      update: async (id, input) => makeSourceRunRecord({ id, ...input }),
    },
  };
  return { repos, calls };
}

describe('processSource', () => {
  test('成功路径：2 篇全部处理', async () => {
    const { repos, calls } = createMockRepos();
    const result = await processSource(repos, source, {
      discover: async () => discoveredArticles,
      fetchArticle,
      translate,
    });
    assert.equal(result.discovered, 2);
    assert.equal(result.pending, 2);
    assert.equal(result.processed, 2);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.errors, []);
    assert.equal(calls.save, 2);
    assert.equal(calls.saveVersion, 2);
    assert.equal(calls.markProcessed, 2);
    assert.equal(calls.transition, 2);
  });

  test('URL 去重：已处理的第一篇不再处理', async () => {
    const { repos, calls } = createMockRepos({
      processedUrls: [discoveredArticles[0].url],
    });
    const result = await processSource(repos, source, {
      discover: async () => discoveredArticles,
      fetchArticle,
      translate,
    });
    assert.equal(result.discovered, 2);
    assert.equal(result.pending, 1);
    assert.equal(result.processed, 1);
    assert.equal(result.failed, 0);
    assert.equal(calls.save, 1);
    assert.equal(calls.saveVersion, 1);
  });

  test('单文章失败隔离：第一篇失败不影响第二篇', async () => {
    const { repos, calls } = createMockRepos();
    const flakyFetch: FetchArticleFn = async (_source, discovered) => {
      if (discovered.url === discoveredArticles[0].url) {
        throw new Error('fetch boom');
      }
      return makeArticleResult(discovered);
    };
    const result = await processSource(repos, source, {
      discover: async () => discoveredArticles,
      fetchArticle: flakyFetch,
      translate,
    });
    assert.equal(result.discovered, 2);
    assert.equal(result.pending, 2);
    assert.equal(result.processed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].includes('fetch boom'));
    assert.equal(calls.recordFailure, 1);
    assert.equal(calls.save, 1);
    assert.equal(calls.saveVersion, 1);
  });

  test('dry-run：无 translate 时只发现+抓取，不翻译/持久化', async () => {
    const { repos, calls } = createMockRepos();
    const result = await processSource(repos, source, {
      discover: async () => discoveredArticles,
      fetchArticle,
    });
    assert.equal(result.discovered, 2);
    assert.equal(result.pending, 2);
    assert.equal(result.processed, 0);
    assert.equal(result.failed, 0);
    assert.equal(calls.save, 0);
    assert.equal(calls.saveVersion, 0);
    assert.equal(calls.transition, 0);
  });
});

describe('aggregateResults', () => {
  test('汇总多个来源的统计', () => {
    const first: SourceUpdateResult = {
      sourceId: 'a',
      discovered: 3,
      pending: 2,
      processed: 1,
      failed: 1,
      errors: ['https://a.example/x: boom'],
    };
    const second: SourceUpdateResult = {
      sourceId: 'b',
      discovered: 1,
      pending: 1,
      processed: 1,
      failed: 0,
      errors: [],
    };
    const summary = aggregateResults([first, second]);
    assert.equal(summary.sources.length, 2);
    assert.equal(summary.sources[0], first);
    assert.equal(summary.sources[1], second);
    assert.equal(summary.discovered, 4);
    assert.equal(summary.pending, 3);
    assert.equal(summary.processed, 2);
    assert.equal(summary.failed, 1);
  });
});

describe('createTranslator', () => {
  const translatorEnv = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    TRANSLATION_MODEL: 'gpt-test',
  };

  test('dryRun 返回 undefined', () => {
    assert.equal(createTranslator(translatorEnv, true), undefined);
  });

  test('缺少 secrets 抛错', () => {
    assert.throws(
      () => createTranslator({ OPENAI_API_KEY: '', OPENAI_BASE_URL: '', TRANSLATION_MODEL: '' }, false),
      /OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required/,
    );
    assert.throws(
      () => createTranslator({ ...translatorEnv, TRANSLATION_MODEL: '' }, false),
      /OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required/,
    );
  });
});
