import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { normalizeCategories } from './classify';
import { isCandidateArticle } from './discovery';
import { validateSourceConfigs } from './config';
import { normalizeArticleMarkdown, resolveImageUrl } from './fetch';
import { parseArgs } from './index';
import { extractLocalizedAlternates, selectOfficialChineseAlternate } from './localization';
import { loadProxySettings, proxyUrlFor } from './network';
import { createTranslateClient } from './translate';
import {
  chunkMarkdown,
  createTranslationPlan,
  protectMarkdown,
  restoreMarkdown,
} from './translation-plan';
import { selectSourcesForRun } from './source-policy';
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
  update_mode: 'active',
};

const article: ExtractedArticle = {
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
    assert.match(written, /image_url: "https:\/\/cdn\.example\.com\/hello-world\.jpg"/);
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

    // source policy: only explicitly active sources run in full mode
    const scaffold: SourceConfig = { ...blog, id: 'scaffold-blog', update_mode: 'dry-run-only' };
    assert.deepEqual(
      selectSourcesForRun([blog, scaffold], false),
      { runnable: [blog], skipped: [scaffold] },
    );
    assert.deepEqual(
      selectSourcesForRun([blog, scaffold], true),
      { runnable: [blog, scaffold], skipped: [] },
    );
    const invalidMode = { ...blog, id: 'invalid-mode', update_mode: 'typo' } as unknown as SourceConfig;
    assert.deepEqual(
      selectSourcesForRun([invalidMode], false),
      { runnable: [], skipped: [invalidMode] },
    );
    const missingMode = { ...blog, id: 'missing-mode' } as SourceConfig;
    delete missingMode.update_mode;
    assert.deepEqual(
      selectSourcesForRun([missingMode], false),
      { runnable: [], skipped: [missingMode] },
    );

    // config: reject fail-open modes, duplicate ids, and malformed URLs
    assert.deepEqual(validateSourceConfigs([blog]).issues, []);
    const invalidConfig = validateSourceConfigs([
      { ...blog, update_mode: undefined },
      { ...blog, homepage_url: '/relative' },
    ]);
    assert.match(invalidConfig.issues.map((issue) => issue.message).join(' | '), /must be explicit/);
    assert.match(invalidConfig.issues.map((issue) => issue.message).join(' | '), /duplicate source id/);
    assert.match(invalidConfig.issues.map((issue) => issue.message).join(' | '), /absolute http/);

    // discovery policy: include an article prefix while excluding nested listing paths
    const filteredSource: SourceConfig = {
      ...blog,
      domain: 'example.com',
      article_paths: ['/blog'],
      exclude_paths: ['/blog/topic'],
    };
    assert.equal(isCandidateArticle('https://example.com/blog/agent-evals', filteredSource), true);
    assert.equal(isCandidateArticle('https://example.com/blog/topic/agents', filteredSource), false);
    assert.equal(isCandidateArticle('https://example.com/blog', filteredSource), false);

    // image policy: prefer original/lazy remote source and absolutize it
    const imageDocument = new JSDOM(
      '<img src="data:image/gif;base64,AA" data-src="/media/full.png" srcset="/media/small.png 1x, /media/large.png 2x">',
      { url: 'https://example.com/blog/post' },
    ).window.document;
    assert.equal(
      resolveImageUrl(imageDocument.querySelector('img')!, 'https://example.com/blog/post'),
      'https://example.com/media/full.png',
    );

    // extraction cleanup: carousel counters and source-site recommendations never enter articles
    const cleanedMarkdown = normalizeArticleMarkdown(
      '正文。\n\n![ logo](https://cdn.example.com/logo.svg)\n\n01 /\n\n16\n\n## Related content\n\n### Promo',
    );
    assert.equal(cleanedMarkdown, '正文。\n\n![logo](https://cdn.example.com/logo.svg)');

    // localization: exact preferred official Chinese alternate wins
    const alternates = extractLocalizedAlternates(
      '<link rel="alternate" hreflang="zh" href="/zh/post"><link rel="alternate" hreflang="zh-CN" href="/cn/post">',
      'https://example.com/en/post',
    );
    assert.equal(selectOfficialChineseAlternate(alternates)?.url, 'https://example.com/cn/post');
    assert.equal(
      selectOfficialChineseAlternate([{ language: 'zh-Hant', url: 'https://example.com/hant/post' }]),
      undefined,
    );

    // network: invalid switches fail loudly; NO_PROXY applies to every fetch path
    assert.throws(() => loadProxySettings({ USE_PROXY: 'TRUE' }), /exactly "true" or "false"/);
    const proxySettings = loadProxySettings({
      USE_PROXY: 'true',
      PROXY_URL: 'http://127.0.0.1:7897',
      NO_PROXY: 'example.com',
    });
    assert.equal(proxyUrlFor('https://api.example.com/data', proxySettings), undefined);
    assert.equal(proxyUrlFor('https://outside.example/data', proxySettings), 'http://127.0.0.1:7897');

    // translation V2 scaffold: AST protection restores URLs/code exactly
    const protectedMarkdown = protectMarkdown(
      '## Agent\n\n[docs](https://example.com/docs?a=1&b=2) ![diagram](https://cdn.example.com/a.png) `npm run build`\n\n```ts\nconst url = "https://inside.example";\n```',
    );
    const restoredMarkdown = restoreMarkdown(protectedMarkdown.text, protectedMarkdown.spans);
    assert.match(restoredMarkdown, /https:\/\/example\.com\/docs\?a=1&b=2/);
    assert.match(restoredMarkdown, /https:\/\/cdn\.example\.com\/a\.png/);
    assert.match(restoredMarkdown, /npm run build/);
    assert.match(restoredMarkdown, /https:\/\/inside\.example/);
    assert.throws(
      () => restoreMarkdown(protectedMarkdown.text.replace(protectedMarkdown.spans[0].token, ''), protectedMarkdown.spans),
      /expected exactly 1/,
    );
    const tick = '`';
    const trickyCode = `${tick.repeat(4)}md\ninside ${tick.repeat(3)} fence\n${tick.repeat(4)}\n\nUse ${tick.repeat(2)}a ${tick} b${tick.repeat(2)}.`;
    const protectedTrickyCode = protectMarkdown(trickyCode);
    const restoredTrickyCode = restoreMarkdown(protectedTrickyCode.text, protectedTrickyCode.spans);
    assert.match(restoredTrickyCode, /^````md\ninside ``` fence\n````/);
    assert.match(restoredTrickyCode, /Use ``a ` b``\./);

    // translation V2 scaffold: GFM table remains one structural block and heading paths follow depth
    const plannedChunks = chunkMarkdown(
      '# Top\n\nIntro.\n\n## Details\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n### Code\n\n```ts\nconst x = 1;\n```',
      { maxTokens: 20 },
    );
    assert.equal(plannedChunks.some((chunk) => chunk.source.includes('| A | B |') && chunk.source.includes('| 1 | 2 |')), true);
    assert.equal(plannedChunks.some((chunk) => chunk.headingPath.join(' / ') === 'Top / Details / Code'), true);
    assert.deepEqual(chunkMarkdown('## Starts at H2\n\nBody.')[0].headingPath, ['Starts at H2']);
    assert.equal(createTranslationPlan({ markdown: '这是原生中文内容。' }).mode, 'native-zh');
    assert.equal(createTranslationPlan({ markdown: 'English article.', officialZh: '/zh/article' }).mode, 'official-zh');
    assert.equal(createTranslationPlan({ markdown: 'English article.' }).mode, 'translate');

    // CLI: invalid or missing limits must never degrade into unlimited mode
    assert.deepEqual(parseArgs(['--limit', '0']), { dryRun: false, limit: 0 });
    assert.throws(() => parseArgs(['--limit', 'abc']), /non-negative integer/);
    assert.throws(() => parseArgs(['--limit', '-1']), /non-negative integer/);
    assert.throws(() => parseArgs(['--limit']), /non-negative integer/);
    assert.throws(() => parseArgs(['--source']), /requires a source id/);

    // Real config: every scaffold source is excluded from a full update.
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const configuredSources = JSON.parse(
      await readFile(path.join(projectRoot, 'src', 'data', 'sources.json'), 'utf8'),
    ) as SourceConfig[];
    const configuredScaffolds = configuredSources.filter(
      (source) => source.update_mode === 'dry-run-only',
    );
    const configuredActive = configuredSources.filter((source) => source.update_mode === 'active');
    assert.equal(validateSourceConfigs(configuredSources).issues.length, 0);
    assert.equal(configuredActive.length > 0, true);
    assert.equal(configuredScaffolds.length > 0, true);
    assert.equal(selectSourcesForRun(configuredScaffolds, false).runnable.length, 0);
    assert.equal(selectSourcesForRun(configuredScaffolds, false).skipped.length, configuredScaffolds.length);

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`smoke: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
