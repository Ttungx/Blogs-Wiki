import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canonicalizeUrl, isLikelyArticleUrl, normalizeHostname, hostInDomain, domainsIntersect } from './urls';
import { isCandidateArticle } from './discovery';
import type { SourceConfig } from './types';

test('isLikelyArticleUrl 拒绝 listing 页泄漏的模板占位符 URL', () => {
  // microsoft-research blog 首页客户端渲染，HTML 泄漏 Liquid 锚点
  // `{%- postPermalink %}`；canonicalize 后 URL 含 %7B/%7D。
  const base = 'https://www.microsoft.com/en-us/research/blog/';
  const templated = canonicalizeUrl('{%- postPermalink %}', base);
  assert.ok(templated, '模板锚点应能被 canonicalize 成 URL 字符串');
  assert.strictEqual(
    isLikelyArticleUrl(templated!, 'microsoft.com'),
    false,
    '模板占位符 URL 不应被判为文章',
  );
});

test('isLikelyArticleUrl 拒绝裸花括号 / Jinja / JS 模板', () => {
  assert.strictEqual(isLikelyArticleUrl('https://example.com/blog/{{slug}}', 'example.com'), false);
  assert.strictEqual(isLikelyArticleUrl('https://example.com/blog/{id}', 'example.com'), false);
});

test('isLikelyArticleUrl 接受正常文章 URL', () => {
  assert.strictEqual(
    isLikelyArticleUrl('https://www.microsoft.com/en-us/research/blog/phi-4/', 'microsoft.com'),
    true,
  );
  assert.strictEqual(
    isLikelyArticleUrl('https://openai.com/index/hello-gpt-4o/', 'openai.com'),
    true,
  );
});

test('isLikelyArticleUrl 拒绝非 Article 辅助路径', () => {
  assert.strictEqual(isLikelyArticleUrl('https://example.com/feed/', 'example.com'), false);
  assert.strictEqual(isLikelyArticleUrl('https://example.com/category/news/', 'example.com'), false);
});

const DEEPMIND: SourceConfig = {
  id: 'google-deepmind',
  name: 'Google DeepMind',
  type: 'company',
  homepage_url: 'https://deepmind.google/',
  blog_url: 'https://deepmind.google/blog/',
  domain: 'deepmind.google',
  update_mode: 'active',
  article_paths: ['/blog'],
  exclude_paths: ['^/blog/.*antigravity'],
};

test('isCandidateArticle 按 exclude_paths 排除迁移壳 URL', () => {
  // deepmind RSS 仍含已迁至 antigravity.google 的旧链接（302 meta-refresh 壳，
  // Defuddle 只能提取 ~169 字符）。exclude_paths 沿用既有迁移排除模式。
  assert.strictEqual(
    isCandidateArticle('https://deepmind.google/blog/introducing-google-antigravity-2-0/', DEEPMIND),
    false,
  );
  assert.strictEqual(
    isCandidateArticle('https://deepmind.google/blog/2026/08/10/gemini-update/', DEEPMIND),
    true,
  );
});

test('isLikelyArticleUrl 支持 allowNonArticlePaths 放宽全局黑名单', () => {
  // /press 默认被全局 NON_ARTICLE_PATHS 拒绝（公司站博客路径可能含此段）
  assert.strictEqual(isLikelyArticleUrl('https://example.com/press/some-article/', 'example.com'), false);
  // allowNonArticlePaths=true 时跳过黑名单，交给 SourceConfig.article_paths 白名单决定
  assert.strictEqual(
    isLikelyArticleUrl('https://example.com/press/some-article/', 'example.com', { allowNonArticlePaths: true }),
    true,
  );
});

test('isLikelyArticleUrl 支持 extra_domains 放行第二域名', () => {
  // karpathy：主域 bearblog + extra github.io legacy
  assert.strictEqual(
    isLikelyArticleUrl('https://karpathy.github.io/2020/06/11/why-i-no-longer-own-gpus/', 'karpathy.bearblog.dev'),
    false,
    '未配 extra_domains 时第二域名应被拒',
  );
  assert.strictEqual(
    isLikelyArticleUrl('https://karpathy.github.io/2020/06/11/why-i-no-longer-own-gpus/', 'karpathy.bearblog.dev', {
      extraDomains: ['karpathy.github.io'],
    }),
    true,
  );
});

test('normalizeHostname 去 scheme/路径/www 并小写', () => {
  assert.strictEqual(normalizeHostname('https://WWW.Example.com/path'), 'example.com');
  assert.strictEqual(normalizeHostname('example.com'), 'example.com');
  assert.strictEqual(normalizeHostname('www.example.com'), 'example.com');
  assert.strictEqual(normalizeHostname('http://Blog.Example.CO.uk/x'), 'blog.example.co.uk');
});

test('hostInDomain 相等或子域为真（大小写/www 无关）', () => {
  assert.strictEqual(hostInDomain('www.huggingface.co', 'huggingface.co'), true);
  assert.strictEqual(hostInDomain('HF.CO', 'hf.co'), true);
  assert.strictEqual(hostInDomain('blog.huggingface.co', 'huggingface.co'), true);
  assert.strictEqual(hostInDomain('huggingface.co', 'blog.huggingface.co'), false);
  assert.strictEqual(hostInDomain('notmatching.com', 'matching.com'), false);
});

test('domainsIntersect 双向（祖先/后代/相等），同级域不相交', () => {
  assert.strictEqual(domainsIntersect('huggingface.co', 'huggingface.co'), true);
  assert.strictEqual(domainsIntersect('blog.huggingface.co', 'huggingface.co'), true);
  assert.strictEqual(domainsIntersect('huggingface.co', 'blog.huggingface.co'), true);
  assert.strictEqual(domainsIntersect('research.google', 'deepmind.google'), false);
  assert.strictEqual(domainsIntersect('research.google', 'blog.google'), false);
});
