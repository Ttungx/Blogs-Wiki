import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { normalizeCategories } from './classify';
import { discoverSource, isCandidateArticle } from './discovery';
import { validateSourceConfigs } from './config';
import {
  collapseCarousels,
  directoryBaseUrl,
  fetchArticle,
  normalizeArticleMarkdown,
  protectPictureFigures,
  removeNoiseBlocks,
  resolveVisibleDate,
  resolveImageUrl,
} from './fetch';
import { parseArgs } from './index';
import {
  extractLocalizedAlternates,
  mapToOfficialZhPath,
  selectOfficialChineseAlternate,
} from './localization';
import { loadProxySettings, proxyUrlFor } from './network';
import { createTranslateClient } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { fetchArticleWithLocalization } from './fetch';
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

    // discovery: sitemap_include_paths restricts child sitemaps to the
    // allowed category prefixes (e.g. OpenAI research/engineering/safety/security)
    const includeRoot =
      '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<sitemap><loc>https://example.com/sitemap.xml/research/</loc></sitemap>' +
      '<sitemap><loc>https://example.com/sitemap.xml/product/</loc></sitemap>' +
      '<sitemap><loc>https://example.com/sitemap.xml/security/</loc></sitemap>' +
      '</sitemapindex>';
    const childSitemap = (prefix: string): string =>
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      `<url><loc>https://example.com${prefix}/a-post</loc></url>` +
      `<url><loc>https://example.com${prefix}/b-post</loc></url>` +
      '</urlset>';
    const includeSource: SourceConfig = {
      ...blog,
      id: 'include-blog',
      blog_url: 'https://example.com/news/',
      sitemap_url: 'https://example.com/sitemap.xml',
      sitemap_include_paths: ['/sitemap.xml/research/', '/sitemap.xml/security/'],
      article_paths: ['/research', '/security'],
    };
    const includeFetch: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('/sitemap.xml')) return new Response(includeRoot, { status: 200 });
      if (url.includes('/sitemap.xml/research')) {
        return new Response(childSitemap('/research'), { status: 200 });
      }
      if (url.includes('/sitemap.xml/security')) {
        return new Response(childSitemap('/security'), { status: 200 });
      }
      if (url.includes('/sitemap.xml/product')) {
        return new Response(childSitemap('/product'), { status: 200 });
      }
      return new Response('', { status: 404 });
    };
    const included = await discoverSource(includeSource, includeFetch);
    const includedUrls = included.map((item) => item.url);
    assert.equal(included.length, 4);
    assert.equal(includedUrls.some((url) => url.includes('/product/')), false);
    assert.equal(includedUrls.some((url) => url.includes('/research/')), true);
    assert.equal(includedUrls.some((url) => url.includes('/security/')), true);

    // image policy: prefer original/lazy remote source and absolutize it
    const imageDocument = new JSDOM(
      '<img src="data:image/gif;base64,AA" data-src="/media/full.png" srcset="/media/small.png 1x, /media/large.png 2x">',
      { url: 'https://example.com/blog/post' },
    ).window.document;
    assert.equal(
      resolveImageUrl(imageDocument.querySelector('img')!, 'https://example.com/blog/post'),
      'https://example.com/media/full.png',
    );

    // image policy: trailing-slash-less article URLs resolve relative images
    // under the article directory, not the site root
    assert.equal(
      directoryBaseUrl('https://lilianweng.github.io/posts/2026-07-04-harness'),
      'https://lilianweng.github.io/posts/2026-07-04-harness/',
    );
    assert.equal(
      resolveImageUrl(
        new JSDOM('<img src="openai-agent-loop.png">').window.document.querySelector('img')!,
        directoryBaseUrl('https://lilianweng.github.io/posts/2026-07-04-harness'),
      ),
      'https://lilianweng.github.io/posts/2026-07-04-harness/openai-agent-loop.png',
    );
    assert.equal(directoryBaseUrl('https://example.com/assets/logo.png'), 'https://example.com/assets/logo.png');

    // extraction cleanup: carousel counters and source-site recommendations never enter articles
    const cleanedMarkdown = normalizeArticleMarkdown(
      '正文。\n\n![ logo](https://cdn.example.com/logo.svg)\n\n01 /\n\n16\n\n## Related content\n\n### Promo',
    );
    assert.equal(cleanedMarkdown, '正文。\n\n![logo](https://cdn.example.com/logo.svg)');

    // carousel collapse (raw fragment, no Readability): keeps the first 3
    // logo+quote items, preserves blockquote attribution, drops the 4th item,
    // carousel chrome and page-level footers, and appends an original-article
    // pointer at the end of the block
    const carouselFragment = new JSDOM(
      '<div id="root"><div class="carousel"><div class="carousel-track">' +
        [1, 2, 3, 4]
          .map(
            (n) =>
              `<div class="carousel-item"><div class="logo-container"><img alt=" logo" src="https://cdn.example.com/logos/logo-${n}.svg"></div>` +
              '<blockquote class="quote-content"><p class="quote-text">' +
              `Testimonial number ${n} text.</p>` +
              '<footer class="quote-footer"><cite class="speaker-info">' +
              `<span class="speaker-name">Name ${n}</span><span class="speaker-title">Title ${n}</span>` +
              '</cite></footer></blockquote></div>',
          )
          .join('') +
        '</div><div class="carousel-pagination"><span class="carousel-counter">01 /16</span>' +
        '<button class="carousel-arrow carousel-prev">‹</button>' +
        '<button class="carousel-arrow carousel-next">›</button></div></div>' +
        '<footer class="site-footer">© 2026 Example Inc. All rights reserved.</footer></div>',
    ).window.document.getElementById('root')!;
    collapseCarousels(carouselFragment, 'https://example.com/blog/carousel/');
    removeNoiseBlocks(carouselFragment, 'Smoke Article');
    const keptLogos = [...carouselFragment.querySelectorAll('img')].filter((image) =>
      /logo/i.test(image.getAttribute('alt') ?? ''),
    );
    assert.equal(keptLogos.length, 3);
    assert.equal(carouselFragment.querySelectorAll('.carousel-item').length, 3);
    assert.equal(carouselFragment.querySelector('.carousel-pagination, .carousel-counter, .carousel-arrow'), null);
    const keptAttribution = carouselFragment.querySelector('blockquote footer.quote-footer');
    assert.ok(keptAttribution, 'footer inside blockquote must be preserved');
    assert.match(keptAttribution!.textContent ?? '', /Name 1/);
    assert.equal(carouselFragment.querySelector('footer.site-footer'), null);
    assert.match(carouselFragment.textContent ?? '', /更多客户证言请见/);
    assert.ok(
      carouselFragment.querySelector('a[href="https://example.com/blog/carousel/"]'),
      'carousel note links back to the original article',
    );
    assert.doesNotMatch(carouselFragment.textContent ?? '', /Name 4/);

    // fetchArticle end-to-end: the full pipeline folds a 16-slide testimonial
    // carousel into exactly 3 logo images, keeps speaker names/titles from
    // footer>cite inside blockquotes, drops the 4th slide and page footer
    const slides = [1, 2, 3, 4]
      .map((n) => {
        const names = ['Alice Acme', 'Bob Byte', 'Carol Code', 'Dana Demo'];
        const titles = ['CEO, Acme', 'CTO, Byte', 'VP, Code', 'CMO, Demo'];
        return (
          `<div class="carousel-item"><div class="logo-container"><img alt=" logo" src="https://cdn.example.com/logos/logo-${n}.svg"></div>` +
          '<blockquote class="quote-content"><p class="quote-text">' +
          `Testimonial number ${n}: this customer loves the product for their team and would recommend it broadly.</p>` +
          '<footer class="quote-footer"><cite class="speaker-info">' +
          `<span class="speaker-name">${names[n - 1]}</span><span class="speaker-title">${titles[n - 1]}</span>` +
          '</cite></footer></blockquote></div>'
        );
      })
      .join('');
    const carouselPage =
      '<!DOCTYPE html><html lang="en"><head><title>Claude for Nonprofits</title>' +
      '<meta property="og:title" content="Claude for Nonprofits">' +
      '<meta property="article:published_time" content="2025-06-01"></head><body><article>' +
      '<h1>Claude for Nonprofits</h1>' +
      '<p>Intro paragraph that gives the article enough real editorial body text to pass Readability scoring and the minimum content length gate used by the pipeline.</p>' +
      '<div class="carousel" aria-label="Customer testimonials"><div class="carousel-track">' +
      slides +
      '</div><div class="carousel-pagination"><span class="carousel-counter">01 /16</span>' +
      '<button class="carousel-arrow carousel-prev" aria-label="Previous">‹</button>' +
      '<button class="carousel-arrow carousel-next" aria-label="Next">›</button></div></div>' +
      '<p>Closing paragraph with enough text to keep the extraction happy and to show that ordinary paragraphs after the carousel are retained in full.</p>' +
      '<footer class="site-footer">© 2026 Example Inc. All rights reserved.</footer></article></body></html>';
    const carouselArticle = await fetchArticle(
      blog,
      { url: 'https://example.com/blog/carousel/', publishedAt: '2025-06-01' },
      async () =>
        new Response(carouselPage, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const carouselMarkdown = carouselArticle.contentMarkdown;
    assert.equal((carouselMarkdown.match(/!\[logo\]/g) ?? []).length, 3);
    assert.match(carouselMarkdown, /Alice Acme/);
    assert.match(carouselMarkdown, /CEO, Acme/);
    assert.doesNotMatch(carouselMarkdown, /Dana Demo/);
    assert.doesNotMatch(carouselMarkdown, /logo-4\.svg/);
    assert.doesNotMatch(carouselMarkdown, /Testimonial number 4/);
    assert.match(
      carouselMarkdown,
      /更多客户证言请见\[原文\]\(https:\/\/example\.com\/blog\/carousel\/\)。/,
    );
    assert.doesNotMatch(carouselMarkdown, /All rights reserved/);

    // localization: exact preferred official Chinese alternate wins
    const alternates = extractLocalizedAlternates(
      '<link rel="alternate" hreflang="zh" href="/zh/post"><link rel="alternate" hreflang="zh-CN" href="/cn/post">',
      'https://example.com/en/post',
    );
    assert.equal(selectOfficialChineseAlternate(alternates)?.url, 'https://example.com/cn/post');
    // OpenAI-style camelCase hrefLang attribute must also be detected
    const camelAlternates = extractLocalizedAlternates(
      '<link rel="alternate" hrefLang="zh-Hans-CN" href="/zh-cn/post"><link rel="alternate" hrefLang="en-US" href="/en/post">',
      'https://example.com/en/post',
    );
    assert.equal(selectOfficialChineseAlternate(camelAlternates)?.url, 'https://example.com/zh-cn/post');
    assert.equal(
      selectOfficialChineseAlternate([{ language: 'zh-Hant', url: 'https://example.com/hant/post' }]),
      undefined,
    );
    // localization: zh path map probes a deterministic Chinese route when no
    // hreflang alternate is advertised (cursor / qwen)
    assert.equal(
      mapToOfficialZhPath('https://cursor.com/blog/grok-4-5', { '/blog': '/zh/blog' }),
      'https://cursor.com/zh/blog/grok-4-5/',
    );
    assert.equal(
      mapToOfficialZhPath('https://qwenlm.github.io/blog/qwen3guard/', { '/blog': '/zh/blog' }),
      'https://qwenlm.github.io/zh/blog/qwen3guard/',
    );
    assert.equal(mapToOfficialZhPath('https://example.com/blog/post', undefined), undefined);
    assert.equal(mapToOfficialZhPath('https://example.com/other/post', { '/blog': '/zh/blog' }), undefined);

    // visible date: sites without meta/JSON-LD dates fall back to body text
    assert.equal(resolveVisibleDate('Published July 9, 2026 in Research'), '2026-07-09T00:00:00.000Z');
    assert.equal(resolveVisibleDate('写于 2025年1月10日，一篇就够了'), '2025-01-10');
    assert.equal(resolveVisibleDate('2025/01/10 首发'), '2025-01-10');
    assert.equal(resolveVisibleDate('© 2026 All rights reserved.'), '');
    assert.equal(resolveVisibleDate(''), '');

    // picture protection: textless image containers are lifted into figures
    // so Readability does not drop them (research.google dynamic_media)
    const pictureDocument = new JSDOM(
      '<main><article><div class="dynamic_media"><div class="glue-grid"><picture>' +
        '<source media="(min-width: 768px)" srcset="https://cdn.example.com/fig-large.png 1250w">' +
        '<img src="https://cdn.example.com/fig-small.png" alt="figure"></picture>' +
        '<p class="caption">Figure caption.</p></div></div></article></main>',
      { url: 'https://example.com/blog/post/' },
    ).window.document;
    assert.equal(protectPictureFigures(pictureDocument.body), 1);
    const protectedFigure = pictureDocument.querySelector('figure');
    assert.equal(protectedFigure?.querySelector('img')?.getAttribute('src'), 'https://cdn.example.com/fig-large.png');
    assert.equal(protectedFigure?.querySelector('figcaption')?.textContent, 'Figure caption.');
    assert.equal(pictureDocument.querySelector('.dynamic_media'), null);

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

    // translation V2 executor: mock model call keeps protected URLs and
    // restores them strictly; classification is decoupled.
    const v2Calls: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
    const v2Fetch: FetchLike = async (input, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      v2Calls.push(body);
      const isClassify = body.messages[0].content.includes('content categorizer');
      return jsonResponse(
        isClassify
          ? JSON.stringify({ categories: ['ai', 'agent'] })
          : JSON.stringify({ content_markdown: '## 你好\n\n这是译文。' }),
      );
    };
    const v2Client = createTranslateV2Client({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      fetchImpl: v2Fetch,
    });
    const v2Result = await v2Client(article, CATEGORIES);
    assert.deepEqual(v2Result.categories, ['AI', 'Agent']);
    assert.equal(v2Result.translationStatus, 'model');
    assert.equal(v2Calls.length >= 2, true, 'translation + classification calls must be decoupled');

    // translation V2 executor: official-zh/native-zh passthrough never calls
    // the translation model; only classification runs, provenance preserved.
    const passthroughCalls: string[] = [];
    const zhFetch: FetchLike = async (input, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      passthroughCalls.push(body.messages[0].content.includes('content categorizer') ? 'classify' : 'translate');
      return jsonResponse(
        body.messages[0].content.includes('content categorizer')
          ? JSON.stringify({ categories: ['ai'] })
          : JSON.stringify({ content_markdown: '不应被调用' }),
      );
    };
    const zhClient = createTranslateV2Client({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      fetchImpl: zhFetch,
    });
    const zhResult = await zhClient(
      { ...article, contentMarkdown: '这是原生中文。', originalLanguage: 'zh', contentSource: 'native-zh' },
      CATEGORIES,
    );
    assert.equal(zhResult.translatedTitle, article.title);
    assert.equal(zhResult.contentMarkdown, '这是原生中文。');
    assert.equal(zhResult.translationStatus, 'native-zh');
    assert.deepEqual(passthroughCalls, ['classify']);

    // persist: provenance fields survive into frontmatter
    const provenanceDir = await mkdtemp(path.join(os.tmpdir(), 'blogs-wiki-provenance-'));
    try {
      const provenanceArticle: ExtractedArticle = {
        ...article,
        officialZhUrl: 'https://example.com/zh/hello-world/',
        contentSource: 'official-zh',
      };
      const provenanceTranslation: TranslationResult = {
        ...translation,
        translationStatus: 'official-zh',
        originalZhUrl: provenanceArticle.officialZhUrl,
      };
      const written = await writeArticle(provenanceDir, blog, provenanceArticle, provenanceTranslation);
      const content = await readFile(written.file, 'utf8');
      assert.match(content, /translation_status: "official-zh"/);
      assert.match(content, /original_zh_url: "https:\/\/example\.com\/zh\/hello-world\/"/);
    } finally {
      await rm(provenanceDir, { recursive: true, force: true });
    }

    // localization fetch: prefers official Simplified Chinese alternate
    const localizedBlog: SourceConfig = { ...blog, prefer_official_zh: true };
    const localizedFetch: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes('/zh/hello-world')) {
        return new Response(
          '<html lang="zh-CN"><head><title>你好世界</title></head><body><article><p>这是中文正文内容，足够长以通过最小长度检查。这段内容继续扩展，确保整个正文提取后的字符数明显超过两百字符的下限，从而让本地化抓取测试能够稳定通过。</p><p>我们再补充一些句子，保证即使 Readability 去掉部分噪声，剩余的正文仍然足以满足管线对最低内容长度的要求，测试不会因为内容过短而失败。继续追加若干说明性的过渡语句，把中文正文的总长度进一步抬高，使其在 Readability 提取、去噪以及其余处理步骤之后仍能稳稳越过两百字符的最低内容门槛，避免本地化抓取测试因为正文过短而被管线判定为无效文章。</p></article></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response(
        '<html lang="en"><head><title>Hello World</title><link rel="alternate" hreflang="zh-CN" href="/zh/hello-world/"></head><body><article>This is an English article body. We keep adding more sentences so that the extracted text length clearly exceeds the minimum content threshold of two hundred characters before Readability runs. These additional paragraphs are purely fixture content and carry no semantic meaning, but they make the local extraction test robust against the parser removing minor fragments during the readability pass.</article></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };
    const localizedArticle = await fetchArticleWithLocalization(
      localizedBlog,
      { url: 'https://example.com/blog/hello-world/' },
      localizedFetch,
    );
    assert.equal(localizedArticle.originalLanguage, 'zh');
    assert.equal(localizedArticle.contentSource, 'official-zh');
    assert.equal(localizedArticle.officialZhUrl, 'https://example.com/blog/hello-world/');

    // localization fetch: without a zh alternate the original page is used
    const plainBlog: SourceConfig = { ...blog, prefer_official_zh: true };
    const noAlternateFetch: FetchLike = async (input) => {
      const url = String(input);
      if (url.includes('/zh/hello-world')) {
        return new Response('', { status: 404 });
      }
      return new Response(
        '<html lang="en"><head><title>Hello World</title></head><body><article>This is an English article body. We keep adding more sentences so that the extracted text length clearly exceeds the minimum content threshold of two hundred characters before Readability runs. These additional paragraphs are purely fixture content and carry no semantic meaning, but they make the local extraction test robust against the parser removing minor fragments during the readability pass.</article></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };
    const plainArticle = await fetchArticleWithLocalization(
      plainBlog,
      { url: 'https://example.com/blog/hello-world/' },
      noAlternateFetch,
    );
    assert.equal(plainArticle.originalLanguage, 'en');
    assert.equal(plainArticle.contentSource, undefined);

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
