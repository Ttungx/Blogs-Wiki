import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createFetchBackend } from '../../scripts/update/fetch-backend';
import type { DiscoveredArticle, FetchLike, SourceConfig } from '../../scripts/update/types';

const source: SourceConfig = {
  id: 'worker-fetch-blog',
  name: 'Worker Fetch Blog',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog/',
  domain: 'example.com',
  update_mode: 'active',
};

const discovered: DiscoveredArticle = {
  url: '/posts/worker-fetch/',
  title: 'Discovered title',
  publishedAt: '2026-08-11',
};

const html = `<!doctype html><html lang="en"><head><title>Worker title</title></head>
<body><article><h1>Worker title</h1><p>${'This is enough article content for the Worker backend extractor. '.repeat(8)}</p></article></body></html>`;

const fetchImpl: FetchLike = async (input) => {
  assert.equal(String(input), 'https://example.com/posts/worker-fetch/');
  return new Response(html, { status: 200 });
};

test('worker backend adapts Worker extractor output to pipeline model', async () => {
  const backend = createFetchBackend('worker');
  const article = await backend.fetchArticle(source, discovered, fetchImpl);

  assert.equal(backend.name, 'worker');
  assert.equal(article.url, 'https://example.com/posts/worker-fetch/');
  assert.equal(article.title, 'Worker title');
  assert.equal(article.publishedAt, '2026-08-11');
  assert.equal(article.originalLanguage, 'en');
  assert.ok(article.contentMarkdown.length >= 200);
});

test('fetch backend defaults to Node and rejects unknown names', () => {
  assert.equal(createFetchBackend(undefined).name, 'node');
  assert.throws(
    () => createFetchBackend('browser'),
    /Unsupported FETCH_BACKEND "browser"/,
  );
});
