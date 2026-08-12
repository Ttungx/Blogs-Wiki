import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { diagnoseSourceDiscovery, discoverSource } from './discovery';
import { fetchArticle, fetchArticleWithLocalization } from './fetch';
import type { FetchLike, SourceConfig } from './types';

const API_SOURCE: SourceConfig = {
  id: 'api-blog',
  name: 'API Blog',
  type: 'company',
  homepage_url: 'https://site.example/',
  blog_url: 'https://site.example/research',
  domain: 'site.example',
  update_mode: 'dry-run-only',
  prefer_official_zh: true,
  article_paths: ['/research'],
  api: {
    list_url: 'https://api.example.com/api/blog/publicList',
    list_body: { pageNum: 1, pageSize: 50 },
    list_path: 'data.list',
    article_url_template: 'https://site.example/research/{slug}',
    detail_url: 'https://api.example.com/api/blog/publicDetail',
    detail_body: { id: '{id}', lang: '{lang}' },
    content_path: 'data.detail.content',
    title_path: 'data.detail.title',
    author_path: 'data.detail.author',
    image_path: 'data.detail.coverImage',
    published_at_path: 'data.detail.publishedAt',
    language_path: 'data.detail.lang',
    zh_lang: 'zh',
    detail_headers: { 'accept-language': '{lang}' },
  },
};

const LIST_RESPONSE = {
  code: 0,
  data: {
    list: [
      {
        id: 100091,
        lang: 'en',
        title: 'From LR to ELR',
        customUrl: 'elr',
        publishedAt: 1785989409,
        coverImage: 'https://cdn.example/cover.png',
      },
      {
        id: 100015,
        lang: 'en',
        title: 'Stabilizing RLVR',
        customUrl: '',
        publishedAt: 1785989409,
      },
    ],
  },
};

function detailBody(lang: string): string {
  return JSON.stringify({
    code: 0,
    data: {
      detail: {
        id: lang === 'zh' ? 100091 : 100091,
        lang,
        title: lang === 'zh' ? '从 LR 到 ELR' : 'From LR to ELR',
        author: 'Pretrain Team',
        coverImage: 'https://cdn.example/cover.png',
        publishedAt: 1785989409,
        content: `# Title\n\n${'Article body with enough content. '.repeat(30)}`,
      },
    },
  });
}

interface RecordedRequest {
  url: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

function fetchImpl(requests: RecordedRequest[] = []): FetchLike {
  return async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    requests.push({ url, body, headers });
    if (url.endsWith('/api/blog/publicList')) {
      return new Response(JSON.stringify(LIST_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/api/blog/publicDetail')) {
      const lang = typeof body?.lang === 'string' ? body.lang : 'en';
      return new Response(detailBody(lang), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };
}

test('discovery: api source lists candidates with numeric-id slug fallback', async () => {
  const discovered = await discoverSource(API_SOURCE, fetchImpl());
  assert.equal(discovered.length, 2);
  assert.deepEqual(
    discovered.map((item) => ({ url: item.url, apiId: item.apiId, apiLang: item.apiLang })),
    [
      { url: 'https://site.example/research/elr', apiId: '100091', apiLang: 'en' },
      { url: 'https://site.example/research/100015', apiId: '100015', apiLang: 'en' },
    ],
  );
});

test('diagnosis: api path reports raw and candidate counts', async () => {
  const diagnosis = await diagnoseSourceDiscovery(API_SOURCE, fetchImpl());
  const api = diagnosis.paths.find((path) => path.name === 'api');
  assert.ok(api);
  assert.equal(api.ok, true);
  assert.equal(api.rawCount, 2);
  assert.equal(api.candidateCount, 2);
});

test('fetch: api detail sends numeric id, accepts lang, returns markdown body', async () => {
  const requests: RecordedRequest[] = [];
  const article = await fetchArticle(
    API_SOURCE,
    { url: 'https://site.example/research/elr', apiId: '100091', apiLang: 'en' },
    fetchImpl(requests),
  );
  assert.equal(article.title, 'From LR to ELR');
  assert.equal(article.originalLanguage, 'en');
  assert.equal(article.publishedAt, '2026-08-06T04:10:09.000Z');
  assert.ok(article.contentMarkdown.includes('Article body'));
  assert.equal(article.author, 'Pretrain Team');
  assert.equal(article.imageUrl, 'https://cdn.example/cover.png');

  const detail = requests.find((request) => request.url.endsWith('/api/blog/publicDetail'));
  assert.ok(detail);
  assert.equal(detail.body?.id, 100091); // 数字 id 必须保留为 number
  assert.equal(detail.body?.lang, 'en');
});

test('localization: official zh straight through when zh_lang available', async () => {
  const requests: RecordedRequest[] = [];
  const article = await fetchArticleWithLocalization(
    API_SOURCE,
    { url: 'https://site.example/research/elr', apiId: '100091', apiLang: 'en' },
    fetchImpl(requests),
  );
  assert.equal(article.originalLanguage, 'zh');
  assert.equal(article.contentSource, 'official-zh');
  assert.equal(article.title, '从 LR 到 ELR');
  assert.equal(article.officialZhUrl, 'https://site.example/research/elr');

  const zhDetail = requests.find((request) => request.url.endsWith('/api/blog/publicDetail'));
  assert.ok(zhDetail);
  assert.equal(zhDetail.body?.lang, 'zh');
  // detail_headers 的 {lang} 占位应替换
  assert.equal(zhDetail.headers?.['accept-language'], 'zh');
});
