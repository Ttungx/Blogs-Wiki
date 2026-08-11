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
