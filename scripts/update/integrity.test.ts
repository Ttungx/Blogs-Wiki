import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkArticleIntegrity } from './backfill-integrity';
import { assertLinkIntegrity } from './content-integrity';
import type { ExtractedArticle, SourceConfig } from './types';

const BASE_SOURCE: SourceConfig = {
  id: 'test',
  name: 'Test',
  type: 'company',
  homepage_url: 'https://example.com/',
  blog_url: 'https://example.com/blog/',
  domain: 'example.com',
  update_mode: 'active',
};

function article(overrides: Partial<ExtractedArticle> = {}): ExtractedArticle {
  return {
    url: 'https://example.com/blog/post/',
    title: 'A solid article title',
    publishedAt: '2026-08-12T00:00:00Z',
    originalLanguage: 'en',
    contentMarkdown: 'This is a sufficiently long article body for testing. '.repeat(10),
    ...overrides,
  };
}

const errorCodes = (issues: { severity: string; code: string }[]) =>
  issues.filter((i) => i.severity === 'error').map((i) => i.code);

test('checkArticleIntegrity 正常文章无 error', () => {
  const { issues } = checkArticleIntegrity(article(), BASE_SOURCE);
  assert.equal(errorCodes(issues).length, 0);
});

test('checkArticleIntegrity 无标题 → missing-title', () => {
  assert.ok(errorCodes(checkArticleIntegrity(article({ title: '' }), BASE_SOURCE).issues).includes('missing-title'));
});

test('checkArticleIntegrity 内容过短 → content-too-short', () => {
  assert.ok(errorCodes(checkArticleIntegrity(article({ contentMarkdown: 'short' }), BASE_SOURCE).issues).includes('content-too-short'));
});

test('checkArticleIntegrity 无日期 → missing-published-date', () => {
  assert.ok(
    errorCodes(checkArticleIntegrity(article({ publishedAt: '' }), BASE_SOURCE).issues).includes('missing-published-date'),
  );
});

test('checkArticleIntegrity 导航列表（短正文 + 外链密集）→ looks-like-navigation-list', () => {
  const nav = '[a](https://x.com/a) [b](https://x.com/b) [c](https://x.com/c) [d](https://x.com/d)';
  assert.ok(
    errorCodes(checkArticleIntegrity(article({ contentMarkdown: nav }), BASE_SOURCE).issues).includes(
      'looks-like-navigation-list',
    ),
  );
});

test('checkArticleIntegrity min_content_chars 按源参数化（低阈值放行短文）', () => {
  const short = article({ contentMarkdown: 'x'.repeat(50) });
  // 默认阈值 200 下触发 content-too-short
  assert.ok(errorCodes(checkArticleIntegrity(short, BASE_SOURCE).issues).includes('content-too-short'));
  // source.min_content_chars=40 放行
  const relaxed: SourceConfig = { ...BASE_SOURCE, min_content_chars: 40 };
  assert.equal(
    errorCodes(checkArticleIntegrity(short, relaxed).issues).filter((c) => c === 'content-too-short').length,
    0,
  );
});

test('checkArticleIntegrity quality_filter 启用促销信号检测', () => {
  const promo = article({
    contentMarkdown: 'Generate transcript of this episode. ' + 'normal body content here. '.repeat(20),
  });
  // 默认不启用 quality_filter → 不检测
  assert.equal(
    errorCodes(checkArticleIntegrity(promo, BASE_SOURCE).issues).filter((c) => c === 'livestream-transcript').length,
    0,
  );
  // source.quality_filter=true → 检测
  const withFilter: SourceConfig = { ...BASE_SOURCE, quality_filter: true };
  assert.ok(
    errorCodes(checkArticleIntegrity(promo, withFilter).issues).includes('livestream-transcript'),
  );
});

// ── assertLinkIntegrity ──────────────────────────────────────────────

test('assertLinkIntegrity 链接与行内代码一致时通过', () => {
  const source = 'See [docs](https://example.com/docs) and `dim` for details.\n\n```js\ncode();\n```\n';
  const translated = '见[文档](https://example.com/docs)，`dim` 了解详情。\n\n```js\ncode();\n```\n';
  assertLinkIntegrity(source, translated);
});

test('assertLinkIntegrity 空对空通过', () => {
  assertLinkIntegrity('纯文本，无链接。', '纯文本翻译，无链接。');
});

test('assertLinkIntegrity 丢链（CTA 整行被删）抛错', () => {
  const source = '[Read more](https://example.com/full)\n\nAt the link above, details follow.\n';
  const translated = '在上方链接中，详情如下。\n';
  assert.throws(() => assertLinkIntegrity(source, translated), /source has 1 link\(s\), translated has 0/);
});

test('assertLinkIntegrity 全角括号污染 href 抛错', () => {
  const source = 'See [XLA](https://example.com/xla) today.\n';
  const translated = '见 [XLA](https://example.com/xla）高级语言) 今天。\n';
  assert.throws(() => assertLinkIntegrity(source, translated), /polluted destination/);
});

test('assertLinkIntegrity 改写 URL 抛错', () => {
  const source = 'See [a](https://example.com/a?ref=tracker) today.\n';
  const translated = '见 [a](https://example.com/a) 今天。\n';
  assert.throws(() => assertLinkIntegrity(source, translated), /expected https:\/\/example\.com\/a\?ref=tracker/);
});

test('assertLinkIntegrity 纯语序重排（链接集合一致）通过', () => {
  const source = 'See [a](https://example.com/a) and [b](https://example.com/b).\n';
  const translated = '见 [b](https://example.com/b) 与 [a](https://example.com/a)。\n';
  assertLinkIntegrity(source, translated);
});

test('assertLinkIntegrity http→https 升级放行', () => {
  const source = 'See [a](http://example.com/a) today.\n';
  const translated = '见 [a](https://example.com/a) 今天。\n';
  assertLinkIntegrity(source, translated);
});

test('assertLinkIntegrity 行内代码被改写抛错', () => {
  const source = 'Use `dim` here.\n';
  const translated = '在这里使用 `维度`。\n';
  assert.throws(() => assertLinkIntegrity(source, translated), /inline-code span 0 .*missing or altered/);
});

test('assertLinkIntegrity 模型给裸标识符加 code 格式放行', () => {
  const source = 'Use full async API.\n';
  const translated = '使用完整 `async` API。\n';
  assertLinkIntegrity(source, translated);
});

test('assertLinkIntegrity 围栏失衡（吞尾）抛错', () => {
  const source = 'Text [a](https://example.com/a).\n\n```js\ncode();\n```\n';
  const translated = '正文 [a](https://example.com/a)。\n\n```js\ncode();\n';
  assert.throws(() => assertLinkIntegrity(source, translated), /fence line/);
});
