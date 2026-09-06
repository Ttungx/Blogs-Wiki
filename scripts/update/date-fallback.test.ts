import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchArticle, fetchArticleWithLocalization } from './fetch';
import type { SourceConfig } from './types';

/**
 * date_fallback 口径回归锚定（2026-09-05 wolfram 审计：正文历史年份
 * 1988/1990 被 visible 启发式误当发表日）。
 */

function htmlFixture(): string {
  return `<!DOCTYPE html>
<html><head><title>On Historical Systems</title></head>
<body><article>
<h1>On Historical Systems</h1>
<p>I first launched Mathematica on June 23, 1988, building on ideas from 1990-era research notebooks.</p>
${'<p>Steady body text keeps the extraction gate comfortably above the minimum length threshold.</p>\n'.repeat(20)}
</article></body></html>`;
}

const SOURCE: SourceConfig = {
  id: 'date-fallback-fixture',
  name: 'Date Fallback Fixture',
  type: 'personal',
  homepage_url: 'https://fixture.example/',
  blog_url: 'https://fixture.example/',
  domain: 'fixture.example',
  update_mode: 'dry-run-only',
};

const DISCOVERED = { url: 'https://fixture.example/2026/on-historical-systems/' };

function htmlFetchImpl(html = htmlFixture()) {
  return async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

test('默认 visible 口径：正文完整日期被启发式取走（锚定误解析形态）', async () => {
  const article = await fetchArticle(SOURCE, DISCOVERED, htmlFetchImpl());
  assert.equal(article.publishedAtSource, 'published');
  assert.ok(article.publishedAt.startsWith('1988-06-23'), `got ${article.publishedAt}`);
});

test('conservative 口径：跳过可见日期启发式，落收录日兜底', async () => {
  const article = await fetchArticle(
    { ...SOURCE, date_fallback: 'conservative' },
    DISCOVERED,
    htmlFetchImpl(),
  );
  assert.equal(article.publishedAtSource, 'ingested');
  assert.ok(!article.publishedAt.startsWith('1988'), `got ${article.publishedAt}`);
});

test('dcterms.date 进 meta 候选（Quarto 站点发表日）', async () => {
  const html = htmlFixture().replace(
    '<title>',
    '<meta name="dcterms.date" content="2026-02-12"><title>',
  );
  const article = await fetchArticle(SOURCE, DISCOVERED, htmlFetchImpl(html));
  assert.ok(article.publishedAt.startsWith('2026-02-12'), `got ${article.publishedAt}`);
});

// ── 双语源政策反转（2026-09-05）：英文母语原文保持主实体 ──

function zhHtmlFixture(): string {
  const zhBody = '这篇官方中文说明详细介绍了产品能力的来龙去脉与使用方式。'.repeat(12);
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>官方中文标题</title></head>
<body><article>
<h1>官方中文标题</h1>
<p>${zhBody}</p>
</article></body></html>`;
}

const BILINGUAL_SOURCE: SourceConfig = {
  ...SOURCE,
  prefer_official_zh: true,
  zh_path_map: { '/2026': '/zh/2026' },
};

function bilingualFetchImpl(zhServesChinese: boolean) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/zh/')) {
      const html = zhServesChinese
        ? zhHtmlFixture()
        : htmlFixture();
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response(htmlFixture(), { status: 200, headers: { 'content-type': 'text/html' } });
  };
}

test('双语源：英文原文保持主实体，官方中文挂 officialZh（不替换原文）', async () => {
  const article = await fetchArticleWithLocalization(
    BILINGUAL_SOURCE,
    DISCOVERED,
    bilingualFetchImpl(true),
  );
  assert.equal(article.originalLanguage, 'en');
  assert.ok(article.officialZh, 'officialZh 应被挂载');
  assert.equal(article.officialZh.url, 'https://fixture.example/zh/2026/on-historical-systems/');
  assert.equal(article.officialZh.title, '官方中文标题');
  assert.ok(article.officialZh.contentMarkdown.includes('官方中文说明'));
  // 英文原文本体不受影响
  assert.ok(article.contentMarkdown.includes('Mathematica'));
});

test('双语源：zh 探测未命中中文（页面仍是英文）→ 无 officialZh，回退模型翻译路径', async () => {
  const article = await fetchArticleWithLocalization(
    BILINGUAL_SOURCE,
    DISCOVERED,
    bilingualFetchImpl(false),
  );
  assert.equal(article.originalLanguage, 'en');
  assert.equal(article.officialZh, undefined);
});
