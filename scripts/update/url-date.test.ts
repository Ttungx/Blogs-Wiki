import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { urlDateFromPattern } from './url-date';

test('urlDateFromPattern 英文月份缩写', () => {
  assert.equal(
    urlDateFromPattern('/(\\d{4})/([A-Za-z]{3})/(\\d{1,2})/', 'https://example.com/2026/Jul/9/slug/'),
    '2026-07-09',
  );
});

test('urlDateFromPattern 数字月份（mindhacks 镜像文件名 `_YYYY_MM_DD_`）', () => {
  assert.equal(
    urlDateFromPattern(
      '_(\\d{4})_(\\d{2})_(\\d{2})_',
      'https://mirror.example/posts/_2009_12_20_dark-time_%E6%9A%97%E6%97%B6%E9%97%B4.html',
    ),
    '2009-12-20',
  );
});

test('urlDateFromPattern 越界数字月份降级为年份', () => {
  assert.equal(
    urlDateFromPattern('_(\\d{4})_(\\d{2})_', 'https://mirror.example/posts/_2009_13_x.html'),
    '2009-01-01',
  );
});

test('urlDateFromPattern 只有年份捕获组', () => {
  assert.equal(urlDateFromPattern('/(\\d{4})/', 'https://example.com/2024/post/'), '2024-01-01');
});

test('urlDateFromPattern 无匹配 / 无模式返回 undefined', () => {
  assert.equal(urlDateFromPattern(undefined, 'https://example.com/2024/'), undefined);
  assert.equal(urlDateFromPattern('/(\\d{4})/', 'https://example.com/post/'), undefined);
});
