/**
 * 提取器测试 —— Phase 6 引擎组件（Defuddle + linkedom）。
 *
 * 锚定 `worker/fetch/extractor.ts` 的行为：
 * - 基本元数据提取（title / author / published / image / language）
 * - 数学公式保留（Readability 时代的核心痛点）
 * - 空内容 / 过短内容抛错
 * - 元数据缺失时字段为空串而非 crash
 * - URL 绝对化
 *
 * 全部用内联 HTML，不依赖网络，保证可离线重复运行。
 * 测试模式与现有 worker 测试一致：node:test + node:assert + tsx。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { extractArticle } from '../fetch/extractor.ts';

const BASE_URL = 'https://example.com/posts/test-article';

/** 构造一个结构完整的测试页面 HTML。 */
function fullPageHtml(overrides?: {
  title?: string;
  author?: string;
  published?: string;
  lang?: string;
  body?: string;
}): string {
  const title = overrides?.title ?? 'Test Article Title';
  const author = overrides?.author ?? 'Alice Author';
  const published = overrides?.published ?? '2026-01-15T00:00:00Z';
  const lang = overrides?.lang ?? 'en';
  const body =
    overrides?.body ??
    '<p>This is a sufficiently long article body to pass the minimum content length check. ' +
      'It has enough characters to exceed the two hundred character threshold that the extractor enforces ' +
      'before returning a result. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.</p>';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta name="author" content="${author}">
  <meta property="article:published_time" content="${published}">
  <meta property="og:locale" content="${lang}">
</head>
<body>
  <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
  <article>
    <h1>${title}</h1>
    ${body}
  </article>
  <footer>Copyright 2026. All rights reserved. Follow us on Twitter.</footer>
</body>
</html>`;
}

test('extractArticle: 基本元数据与正文提取', async () => {
  const result = await extractArticle({ html: fullPageHtml(), url: BASE_URL });

  assert.ok(result.title.length > 0, 'title 不应为空');
  assert.ok(result.contentMarkdown.length > 0, 'contentMarkdown 不应为空');
  assert.ok(result.wordCount > 0, 'wordCount 应大于 0');
  assert.ok(result.originalLanguage.length > 0, 'originalLanguage 不应为空');
});

test('extractArticle: 数学公式定界符保留', async () => {
  const mathBody = `
    <p>The energy equation is $E = mc^2$ as Einstein proposed. Here is a longer
    paragraph to ensure we meet the minimum content length requirement for the
    extractor. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do
    eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
    <p>Display math follows: $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$</p>
  `;
  const result = await extractArticle({
    html: fullPageHtml({ body: mathBody }),
    url: BASE_URL,
  });

  // inline 公式定界符保留（Readability 时代会丢失）
  assert.match(result.contentMarkdown, /\$E\s*=\s*mc/, 'inline 数学公式应保留 $...$ 定界符');
  // display 公式定界符保留
  assert.match(result.contentMarkdown, /\$\$/, 'display 数学公式应保留 $$...$$ 定界符');
});

test('extractArticle: 空内容抛错', async () => {
  const emptyHtml = `<!DOCTYPE html><html><head><title>Empty</title></head><body><nav>nav</nav></body></html>`;
  await assert.rejects(
    () => extractArticle({ html: emptyHtml, url: BASE_URL }),
    /too short|content/i,
    '无正文的页面应抛错',
  );
});

test('extractArticle: 元数据缺失时字段为空串而非 crash', async () => {
  // 无 author / published meta 标签的页面
  const minimalHtml = `<!DOCTYPE html><html lang="en"><head><title>No Meta</title></head>
    <body><article><h1>No Meta Page</h1>
    <p>This page has no author or published date metadata but has enough body text
    to pass the minimum content length check of the extractor module. We need at
    least two hundred characters. Lorem ipsum dolor sit amet consectetur.</p>
    </article></body></html>`;

  const result = await extractArticle({ html: minimalHtml, url: BASE_URL });

  assert.equal(typeof result.author, 'string');
  assert.equal(typeof result.publishedAt, 'string');
  assert.equal(typeof result.imageUrl, 'string');
  // 不 crash 即可，具体值取决于 Defuddle 能否从其他来源推断
});

test('extractArticle: contentMarkdown 不少于 MIN_CONTENT_CHARS', async () => {
  const result = await extractArticle({ html: fullPageHtml(), url: BASE_URL });
  const textLength = result.contentMarkdown.replace(/\s+/g, ' ').trim().length;
  assert.ok(textLength >= 200, `正文应 ≥ 200 字符，实际 ${textLength}`);
});

test('extractArticle: fbsbx.com 图片不被 embedToMarkdown 规则吞掉', async () => {
  // Defuddle 的 embedToMarkdown 用子串正则 `x\.com` 匹配，`*.fbsbx.com` 会被
  // 误判为 X/Twitter 嵌入并整体丢弃；extractor 用占位符改写后还原。
  const body = `
    <p>Evaluations</p>
    <img src="https://lookaside.fbsbx.com/elementpath/media/?media_id=123&version=1" alt="Chart one">
    <img src="https://lookaside.fbsbx.com/elementpath/media/?media_id=456" alt="Chart two">
    <p>This paragraph ensures the article is long enough for the extractor
    minimum content length check. Lorem ipsum dolor sit amet consectetur
    adipiscing elit sed do eiusmod tempor incididunt ut labore.</p>
  `;
  const result = await extractArticle({ html: fullPageHtml({ body }), url: BASE_URL });

  assert.match(result.contentMarkdown, /lookaside\.fbsbx\.com/, 'fbsbx.com 图片应保留');
  assert.match(result.contentMarkdown, /media_id=123/, 'query 参数应原样保留');
  assert.match(result.contentMarkdown, /media_id=456/, '第二张图也应保留');
  assert.doesNotMatch(result.contentMarkdown, /x__dot__com/, '占位符不应泄漏');
});

test('extractArticle: 客户证言轮播折叠为前 3 条并删 UI', async () => {
  // 复刻 Anthropic 类页面：16 条轮播会渲染成 16 张 logo + 无署名引文。
  // collapseCarousels 应只保留前 3 条、删除计数器/箭头、追加原文指引。
  const slide = (name: string, quote: string) => `
    <div class="carousel-item">
      <img alt="${name} logo" src="https://example.com/${name.toLowerCase()}.png">
      <blockquote><p>${quote}</p></blockquote>
    </div>`;
  const body = `
    <p>Customer stories below.</p>
    <div class="testimonial-carousel">
      <div class="carousel-track">
        ${slide('Alpha', 'Alpha quote: we built our system with Claude.')}
        ${slide('Beta', 'Beta quote: Claude Code leveled the playing field.')}
        ${slide('Gamma', 'Gamma quote: our team ships ten times faster.')}
        ${slide('Delta', 'Delta quote: this slide must be collapsed away.')}
      </div>
      <span class="carousel-counter">1 / 4</span>
      <button class="carousel-control-next">Next</button>
    </div>
    <p>This closing paragraph ensures the article body is comfortably longer
    than the two hundred character minimum required by the extractor before it
    returns a result. Lorem ipsum dolor sit amet consectetur adipiscing elit.</p>
  `;
  const result = await extractArticle({ html: fullPageHtml({ body }), url: BASE_URL });

  // 前 3 条 logo 与引文保留
  assert.match(result.contentMarkdown, /Alpha quote/, '第 1 条证言应保留');
  assert.match(result.contentMarkdown, /Beta quote/, '第 2 条证言应保留');
  assert.match(result.contentMarkdown, /Gamma quote/, '第 3 条证言应保留');
  // 第 4 条折叠掉
  assert.doesNotMatch(result.contentMarkdown, /Delta quote/, '第 4 条证言应被折叠');
  assert.doesNotMatch(result.contentMarkdown, /delta\.png/, '第 4 张 logo 不应出现');
  // 轮播 UI 删除
  assert.doesNotMatch(result.contentMarkdown, /Next/, '轮播箭头不应输出');
  assert.doesNotMatch(result.contentMarkdown, /1 \/ 4/, '轮播计数器不应输出');
  // 原文指引追加
  assert.match(result.contentMarkdown, /更多客户证言请见/, '应追加折叠指引');
  assert.match(result.contentMarkdown, /\[原文\]\(https:\/\/example\.com\/posts\/test-article\)/, '指引应链回原文');
});

test('extractArticle: 正文外 header 轮播不折叠、不注入证言指引', async () => {
  const slide = (name: string, quote: string) => `
    <div class="carousel-item">
      <img alt="${name} logo" src="https://example.com/${name.toLowerCase()}.png">
      <blockquote><p>${quote}</p></blockquote>
    </div>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Outside Carousel</title>
  <meta property="og:title" content="Outside Carousel">
  <meta name="author" content="Alice Author">
  <meta property="article:published_time" content="2026-01-15T00:00:00Z">
</head>
<body>
  <header>
    <div class="hero-carousel">
      <div class="carousel-track">
        ${slide('HeroA', 'Hero A must not be treated as a testimonial collapse.')}
        ${slide('HeroB', 'Hero B belongs to the marketing header carousel only.')}
        ${slide('HeroC', 'Hero C should remain outside the article content root.')}
        ${slide('HeroD', 'Hero D would trigger collapse notice if body-scoped.')}
      </div>
      <span class="carousel-counter">1 / 4</span>
    </div>
  </header>
  <article>
    <h1>Outside Carousel</h1>
    <p>This article body intentionally has no testimonial carousel. It only needs
    enough characters to pass the extractor minimum content length check with
    comfortable margin, so we keep writing ordinary prose about the product and
    the engineering process that produced it.</p>
  </article>
</body>
</html>`;
  const result = await extractArticle({ html, url: BASE_URL });

  assert.doesNotMatch(result.contentMarkdown, /更多客户证言请见/, 'header 轮播不应注入证言折叠指引');
  assert.doesNotMatch(result.contentMarkdown, /Hero D/, 'header 轮播不应被错误地折叠进正文');
});

test('extractArticle: 相对图片/链接 URL 绝对化', async () => {
  const body = `
    <p>Relative asset demo for the article.</p>
    <img src="back_arrow.png" alt="Back">
    <img src="golden_lantern.png" alt="Golden Lantern">
    <p><a href="/docs/guide">Guide</a> and <a href="relative/page">Relative page</a>.</p>
    <p>This paragraph provides the extra length required to pass the extractor
    minimum content length gate. Lorem ipsum dolor sit amet consectetur
    adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore.</p>
  `;
  const result = await extractArticle({ html: fullPageHtml({ body }), url: BASE_URL });

  assert.match(result.contentMarkdown, /!\[Back\]\(https:\/\/example\.com\/posts\/back_arrow\.png\)/);
  assert.match(result.contentMarkdown, /!\[Golden Lantern\]\(https:\/\/example\.com\/posts\/golden_lantern\.png\)/);
  assert.match(result.contentMarkdown, /\[Guide\]\(https:\/\/example\.com\/docs\/guide\)/);
  assert.match(result.contentMarkdown, /\[Relative page\]\(https:\/\/example\.com\/posts\/relative\/page\)/);
  // 绝对 URL / 协议相对链接不应被改写
  assert.doesNotMatch(result.contentMarkdown, /\(javascript:/i);
});

test('extractArticle: 逗号拼接的多时间戳取第一段（github.blog）', async () => {
  const body = `
    <p>This is a GitHub Engineering article with enough body text to pass the
    minimum content length check of the extractor module. Lorem ipsum dolor
    sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut
    labore et dolore magna aliqua.</p>
  `;
  // Defuddle 会把 JSON-LD 中两个等价 datePublished 拼成 "A, B"。
  const html = `<!DOCTYPE html><html lang="en"><head><title>Stack PR</title>
  <script type="application/ld+json">{"datePublished":"2026-08-04T09:47:18-07:00, 2026-08-04T16:47:18+00:00"}</script>
  </head><body><article><h1>Stack PR</h1>${body}</article></body></html>`;
  const result = await extractArticle({ html, url: 'https://github.blog/engineering/stack-pr/' });
  assert.match(result.publishedAt, /^2026-08-04T09:47:18-07:00$/, '应取第一段时间戳');
});

test('extractArticle: Next.js _createdAt 日期回退（anthropic research）', async () => {
  const body = `
    <p>This is an Anthropic Research article with enough body text to pass the
    minimum content length check of the extractor module. Lorem ipsum dolor
    sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut
    labore et dolore magna aliqua.</p>
  `;
  const html = `<!DOCTYPE html><html lang="en"><head><title>Riemann</title></head>
  <body><article><h1>Riemann</h1>${body}</article>
  <script>self.__next_f.push([1,"6:[\\"$\\",{\\"post\\":{\\"_createdAt\\":\\"2026-08-06T20:38:02Z\\"}]])</script>
  </body></html>`;
  const result = await extractArticle({ html, url: 'https://www.anthropic.com/research/riemann-zeta' });
  assert.match(result.publishedAt, /^2026-08-06T20:38:02Z$/, '应回退到 _createdAt');
});
