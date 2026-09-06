import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stripInlineDataUriImages } from './markdown-sanitize';

test('stripInlineDataUriImages 剥离 base64 内联图（labonne/Quarto）', () => {
  const md = [
    '# Title',
    '',
    '![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)',
    '',
    '正文段落。',
    '',
    '![chart](data:image/jpeg;base64,/9j/4QC8RXhpZgAASUkqAAgAAAAGABAABAAABgAA)',
    '',
  ].join('\n');
  const out = stripInlineDataUriImages(md);
  assert.ok(!out.includes('data:image'), 'data URI 应全部剥离');
  assert.ok(out.includes('# Title'));
  assert.ok(out.includes('正文段落。'));
});

test('stripInlineDataUriImages 保留远程图与普通链接', () => {
  const md = '![chart](https://cdn.example/a.png) 和 [link](https://example.com)';
  assert.equal(stripInlineDataUriImages(md), md);
});

test('stripInlineDataUriImages 剥离 HTML img data URI（API 直返 markdown 的源）', () => {
  const out = stripInlineDataUriImages('<img src="data:image/png;base64,AAA" alt="x">正文');
  assert.ok(!out.includes('data:image'));
  assert.ok(out.includes('正文'));
});
