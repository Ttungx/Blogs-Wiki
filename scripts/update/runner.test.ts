import { strict as assert } from 'node:assert';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createUpdateRepositories } from './repository-factory';
import { runUpdate } from './runner';
import type { FetchBackend } from './fetch-backend';
import type { DiscoveredArticle, ExtractedArticle, Logger, SourceConfig } from './types';

const source: SourceConfig = {
  id: 'runner-blog',
  name: 'Runner Blog',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog/',
  domain: 'example.com',
  update_mode: 'active',
};

const discovered: DiscoveredArticle[] = [
  { url: 'https://example.com/blog/newest/', publishedAt: '2026-08-11' },
  { url: 'https://example.com/blog/fails/', publishedAt: '2026-08-10' },
  { url: 'https://example.com/blog/older/', publishedAt: '2026-08-09' },
];

function logger(): Logger {
  return { info() {}, warn() {}, error() {} };
}

function articleFor(item: DiscoveredArticle): ExtractedArticle {
  return {
    url: item.url,
    title: item.url.split('/').at(-2) ?? 'Article',
    publishedAt: item.publishedAt ?? '2026-08-01',
    originalLanguage: 'en',
    contentMarkdown: 'Original article body with sufficient length for the integrity gate to pass during tests. '.repeat(8),
  };
}

function fetchBackend(failUrl?: string): FetchBackend {
  const fetchArticle = async (
    _source: SourceConfig,
    item: DiscoveredArticle,
    _fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  ) => {
    if (item.url === failUrl) throw new Error('synthetic fetch failure');
    return articleFor(item);
  };

  return {
    name: 'worker',
    fetchArticle,
    fetchArticleWithLocalization: fetchArticle,
  };
}

test('runUpdate full run persists successful articles, marks state, and isolates item failures', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-runner-'));
  try {
    const repositories = createUpdateRepositories({ rootDir });
    let translations = 0;

    const first = await runUpdate({
      rootDir,
      dryRun: false,
      limit: 0,
      sources: [source],
      repositories,
      discover: async () => discovered,
      fetchBackend: fetchBackend(discovered[1].url),
      translate: async (article) => {
        translations += 1;
        return {
          translatedTitle: `译文 ${article.title}`,
          categories: ['AI'],
          contentMarkdown: `# ${article.title}`,
          model: 'runner-test',
        };
      },
      logger: logger(),
    });

    assert.equal(first.processed, 2);
    assert.equal(first.failed, 1);
    assert.equal(translations, 2);
    assert.equal((await repositories.articles.listAll()).length, 2);
    assert.deepEqual(
      await repositories.sourceState.listProcessed(source.id),
      [discovered[0].url, discovered[2].url],
    );

    const second = await runUpdate({
      rootDir,
      dryRun: false,
      limit: 0,
      sources: [source],
      repositories,
      discover: async () => discovered,
      fetchBackend: fetchBackend(discovered[1].url),
      translate: async () => {
        throw new Error('processed articles must not be translated');
      },
      logger: logger(),
    });

    assert.equal(second.pending, 1);
    assert.equal(second.processed, 0);
    assert.equal(second.failed, 1);
    assert.equal((await repositories.articles.listAll()).length, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('runUpdate dry-run discovers and fetches without translation or repository writes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-runner-dry-'));
  try {
    const repositories = createUpdateRepositories({ rootDir });
    let translated = false;

    const summary = await runUpdate({
      rootDir,
      dryRun: true,
      limit: 0,
      sources: [{ ...source, update_mode: 'dry-run-only' }],
      repositories,
      discover: async () => [discovered[0]],
      fetchBackend: fetchBackend(),
      translate: async () => {
        translated = true;
        throw new Error('dry-run must not translate');
      },
      logger: logger(),
    });

    assert.equal(summary.discovered, 1);
    assert.equal(summary.pending, 1);
    assert.equal(summary.processed, 0);
    assert.equal(summary.failed, 0);
    assert.equal(translated, false);
    assert.deepEqual(await repositories.articles.listAll(), []);
    assert.deepEqual(await repositories.sourceState.listProcessed(source.id), []);
    assert.deepEqual(await readdir(rootDir), []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
