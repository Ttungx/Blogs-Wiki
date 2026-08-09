import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeCategories } from './classify';
import { createTranslateClient } from './translate';
import {
  isProcessed,
  loadProcessedState,
  markProcessed,
  saveProcessedState,
  writeArticle,
} from './persist';
import type {
  ExtractedArticle,
  FetchLike,
  SourceConfig,
  TranslationResult,
} from './types';

const CATEGORIES = ['AI', 'Agent', 'Other'] as const;

const blog: SourceConfig = {
  id: 'smoke-blog',
  name: 'Smoke Blog',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog',
  domain: 'example.com',
};

const article: ExtractedArticle = {
  url: 'https://example.com/blog/hello-world/',
  title: 'Hello World',
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

function jsonResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

async function run() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-smoke-'));

  try {
    // persist: creates a valid article file with expected frontmatter
    const first = await writeArticle(rootDir, blog, article, translation);
    assert.equal(first.created, true);
    const written = await readFile(first.file, 'utf8');
    assert.match(written, /^---\n/);
    assert.match(written, /blog_id: "smoke-blog"/);
    assert.match(written, /original_url: "https:\/\/example\.com\/blog\/hello-world\/"/);
    assert.match(written, /published_at: 2025-06-01/);
    assert.match(written, /translation_model: "smoke-model"/);
    assert.match(written, /source_domain: "example\.com"/);
    assert.match(written, /- "AI"/);
    assert.match(written, /## 你好/);

    // persist: same URL is idempotent, no second file
    const second = await writeArticle(rootDir, blog, article, translation);
    assert.equal(second.created, false);
    assert.equal(second.file, first.file);

    // persist: missing published date is rejected with a clear error
    await assert.rejects(
      writeArticle(rootDir, blog, { ...article, publishedAt: '' }, translation),
      /no published date/,
    );

    // state: default, mark, save, reload, dedupe
    const initial = await loadProcessedState(rootDir);
    assert.equal(isProcessed(initial, blog.id, article.url), false);
    markProcessed(initial, blog.id, article.url);
    markProcessed(initial, blog.id, article.url);
    initial.updated_at = new Date().toISOString();
    await saveProcessedState(rootDir, initial);
    const reloaded = await loadProcessedState(rootDir);
    assert.equal(isProcessed(reloaded, blog.id, article.url), true);
    assert.equal(reloaded.blogs[blog.id].length, 1);

    // state: legacy flat format is loaded as blogs
    const flatDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-flat-'));
    try {
      const flatFile = path.join(flatDir, 'src', 'data', 'processed-urls.json');
      await mkdir(path.dirname(flatFile), { recursive: true });
      await writeFile(
        flatFile,
        JSON.stringify({ 'legacy-blog': ['https://example.com/legacy/'] }),
        'utf8',
      );
      const flat = await loadProcessedState(flatDir);
      assert.equal(isProcessed(flat, 'legacy-blog', 'https://example.com/legacy/'), true);
    } finally {
      await rm(flatDir, { recursive: true, force: true });
    }

    // classify: normalization, dedupe, ordering, fallback
    assert.deepEqual(normalizeCategories(['ai', 'AI ', 'other.'], CATEGORIES), ['AI', 'Other']);
    assert.deepEqual(normalizeCategories('ai', CATEGORIES), ['AI']);
    assert.deepEqual(normalizeCategories(null, CATEGORIES), ['Other']);
    assert.deepEqual(normalizeCategories(['Bogus'], CATEGORIES), ['Other']);
    assert.deepEqual(normalizeCategories(['ai', 'Agent', 'ai'], CATEGORIES), ['AI', 'Agent']);

    // translate: valid JSON path
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input: String(input), init: init ?? {} });
      return jsonResponse(
        JSON.stringify({
          translated_title: '模型翻译标题',
          categories: ['ai', 'agent.'],
          content_markdown: '## 翻译正文',
        }),
      );
    };
    const client = createTranslateClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1/',
      model: 'test-model',
      fetchImpl,
    });
    const result = await client(article, CATEGORIES);
    assert.equal(result.translatedTitle, '模型翻译标题');
    assert.deepEqual(result.categories, ['AI', 'Agent']);
    assert.equal(result.model, 'test-model');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, 'https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(calls[0].init.body)) as {
      model: string;
      response_format: { type: string };
    };
    assert.equal(body.model, 'test-model');
    assert.deepEqual(body.response_format, { type: 'json_object' });

    // translate: base URL already ending in /chat/completions must not double-suffix
    const endpointCalls: string[] = [];
    const endpointFetch: FetchLike = async (input, init) => {
      endpointCalls.push(String(input));
      void init;
      return jsonResponse(
        JSON.stringify({
          translated_title: 't',
          categories: ['ai'],
          content_markdown: 'body',
        }),
      );
    };
    const endpointClient = createTranslateClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1/chat/completions',
      model: 'test-model',
      fetchImpl: endpointFetch,
    });
    await endpointClient(article, CATEGORIES);
    assert.deepEqual(endpointCalls, ['https://api.example.com/v1/chat/completions']);

    // translate: invalid JSON first, retry succeeds
    let attempts = 0;
    const retryFetch: FetchLike = async (input, init) => {
      attempts += 1;
      void input;
      void init;
      if (attempts === 1) return jsonResponse('sorry, no json here');
      return jsonResponse(
        JSON.stringify({
          translated_title: '重试成功',
          categories: [],
          content_markdown: '正文',
        }),
      );
    };
    const retryClient = createTranslateClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      fetchImpl: retryFetch,
    });
    const retried = await retryClient(article, CATEGORIES);
    assert.equal(attempts, 2);
    assert.equal(retried.translatedTitle, '重试成功');

    // translate: empty body is an error
    const emptyFetch: FetchLike = async () =>
      jsonResponse(JSON.stringify({ translated_title: 'x', categories: [], content_markdown: '' }));
    const emptyClient = createTranslateClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      fetchImpl: emptyFetch,
    });
    await assert.rejects(emptyClient(article, CATEGORIES), /empty content_markdown/);

    console.log('smoke: all update-pipeline checks passed');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(`smoke: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
