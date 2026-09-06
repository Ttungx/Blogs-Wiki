import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { selectCoverImage } from './fetch';

test('selectCoverImage 正文第一张图优先于 og:image', () => {
  assert.equal(
    selectCoverImage('https://example.com/body-first.png', 'https://example.com/og-card.jpg'),
    'https://example.com/body-first.png',
  );
});

test('selectCoverImage 正文无图时 fallback 到 og:image', () => {
  assert.equal(selectCoverImage(undefined, 'https://example.com/og-card.jpg'), 'https://example.com/og-card.jpg');
});

test('selectCoverImage 两者皆无返回 undefined（列表隐藏配图）', () => {
  assert.equal(selectCoverImage(undefined, undefined), undefined);
});
