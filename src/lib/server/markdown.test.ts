import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from './markdown';

test('文章 Markdown 保留阅读语义并按原文地址解析相对图片', async () => {
  const html = await renderMarkdown(
    [
      '# 文章标题',
      '',
      '## 第二节',
      '',
      '![相对图片](assets/chart.png)',
      '',
      '![绝对图片](https://cdn.example.com/cover.png)',
      '',
      '[相对链接](about)',
      '',
      '[危险链接](javascript:alert(1))',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```typescript',
      'const answer = 42;',
      '```',
    ].join('\n'),
    { baseUrl: 'https://example.com/news/reader/' },
  );

  assert.match(html, /<h2 id="文章标题">文章标题<\/h2>/);
  assert.match(html, /<h2 id="第二节">第二节<\/h2>/);
  assert.match(html, /src="https:\/\/example\.com\/news\/reader\/assets\/chart\.png"/);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/cover\.png"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /href="https:\/\/example\.com\/news\/reader\/about"/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /<div class="table-scroll"><table>/);
  assert.match(html, /<pre[^>]*data-language="typescript"/);
});

test('logo 段 + blockquote 包装为 reader-testimonial', async () => {
  const html = await renderMarkdown(
    [
      '![Customer logo](logos/acme.svg)',
      '',
      '> We shipped faster with the new stack.',
      '',
      '普通段落保持原样。',
    ].join('\n'),
    { baseUrl: 'https://example.com/news/reader/' },
  );

  assert.match(html, /<figure class="reader-testimonial">/);
  assert.match(html, /<div class="reader-testimonial-logo">/);
  assert.match(html, /src="https:\/\/example\.com\/news\/reader\/logos\/acme\.svg"/);
  assert.match(html, /alt="Customer logo"/);
  assert.match(html, /<blockquote class="reader-testimonial-quote">/);
  assert.match(html, /We shipped faster with the new stack\./);
  assert.doesNotMatch(html, /<p><img[^>]*alt="Customer logo"[^>]*><\/p>/);
  assert.match(html, /<p>普通段落保持原样。<\/p>/);
});
