import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDateSafe } from './content';

test('D1 datetime(now) 无时区字符串按 UTC 解析', () => {
  // D1 datetime('now') 返回 "YYYY-MM-DD HH:mm:ss"（UTC，无 Z）。
  // 若不补 Z，东八区等环境会把 23:30 当成本地时间，显示错一天。
  const date = parseDateSafe('2026-08-10 23:30:00');
  assert.ok(date);
  assert.equal(date.toISOString(), '2026-08-10T23:30:00.000Z');
});

test('D1 datetime(now) 带小数秒也按 UTC 解析', () => {
  const date = parseDateSafe('2026-08-10 23:30:00.123');
  assert.ok(date);
  assert.equal(date.toISOString(), '2026-08-10T23:30:00.123Z');
});

test('纯日期 YYYY-MM-DD 可解析', () => {
  const date = parseDateSafe('2026-08-10');
  assert.ok(date);
  assert.equal(date.getUTCFullYear(), 2026);
  assert.equal(date.getUTCMonth(), 7);
  assert.equal(date.getUTCDate(), 10);
});

test('ISO 8601 无时区按本地解析后仍返回有效 Date', () => {
  const date = parseDateSafe('2026-08-10T23:30:00');
  assert.ok(date);
  assert.equal(Number.isNaN(date.getTime()), false);
});

test('ISO 8601 带 Z 的字符串保持原语义', () => {
  const date = parseDateSafe('2026-08-10T23:30:00Z');
  assert.ok(date);
  assert.equal(date.toISOString(), '2026-08-10T23:30:00.000Z');
});

test('ISO 8601 带偏移的字符串保持原语义', () => {
  const date = parseDateSafe('2026-08-10T23:30:00+08:00');
  assert.ok(date);
  assert.equal(date.toISOString(), '2026-08-10T15:30:00.000Z');
});

test('空值返回 null', () => {
  assert.equal(parseDateSafe(null), null);
  assert.equal(parseDateSafe(undefined), null);
  assert.equal(parseDateSafe(''), null);
});

test('无法解析的文本返回 null', () => {
  assert.equal(parseDateSafe('not-a-date'), null);
  assert.equal(parseDateSafe('2026-13-99'), null);
});
