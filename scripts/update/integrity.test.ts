import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkArticleIntegrity } from './backfill-integrity';
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
