import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileArticleRepository } from '../repositories/file/file-article-repository';
import { FileSourceStateRepository } from '../repositories/file/file-source-state-repository';
import {
  createUpdateRepositories,
  toDomainArticle,
  toDomainSource,
  toDomainTranslation,
} from '../../scripts/update/repository-factory';
import type { ExtractedArticle, SourceConfig, TranslationResult } from '../../scripts/update/types';

const source: SourceConfig = {
  id: 'factory-blog',
  name: 'Factory Blog',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog/',
  domain: 'example.com',
  update_mode: 'active',
  prefer_official_zh: true,
  article_paths: ['/blog'],
};

const article: ExtractedArticle = {
  url: 'https://example.com/blog/factory/',
  title: 'Factory',
  publishedAt: '2026-08-11',
  originalLanguage: 'en',
  contentMarkdown: 'Body',
  officialZhUrl: 'https://example.com/zh/factory/',
  contentSource: 'official-zh',
};

const translation: TranslationResult = {
  translatedTitle: '工厂',
  categories: ['AI'],
  contentMarkdown: '正文',
  model: 'test-model',
  translationStatus: 'official-zh',
  originalZhUrl: article.officialZhUrl,
};

test('factory defaults to FileRepository', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-factory-'));
  try {
    const repositories = createUpdateRepositories({ rootDir });
    assert.ok(repositories.articles instanceof FileArticleRepository);
    assert.ok(repositories.sourceState instanceof FileSourceStateRepository);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('factory rejects D1 backend without a binding', () => {
  assert.throws(
    () => createUpdateRepositories({ rootDir: os.tmpdir(), backend: 'd1' }),
    /requires an injected D1Database/,
  );
});

test('source/article/translation adapters preserve pipeline fields', () => {
  assert.deepEqual(toDomainSource(source), {
    id: 'factory-blog',
    name: 'Factory Blog',
    type: 'company',
    homepageUrl: 'https://example.com/',
    blogUrl: 'https://example.com/blog/',
    domain: 'example.com',
    updateMode: 'active',
    preferOfficialZh: true,
    articlePaths: ['/blog'],
  });
  assert.deepEqual(toDomainArticle(source, article), {
    sourceId: 'factory-blog',
    url: article.url,
    title: 'Factory',
    publishedAt: '2026-08-11',
    originalLanguage: 'en',
    contentMarkdown: 'Body',
    officialZhUrl: article.officialZhUrl,
    contentSource: 'official-zh',
  });
  assert.deepEqual(toDomainTranslation(translation), {
    translatedTitle: '工厂',
    categories: ['AI'],
    contentMarkdown: '正文',
    model: 'test-model',
    translationStatus: 'official-zh',
    originalZhUrl: article.officialZhUrl,
  });
});
