/**
 * 翻译链错误分类与重试提示的纯逻辑测试（node:test，无网络依赖）。
 *
 * 2026-09-12 生产排障沉淀：认证类失败（坏 key）要能被熔断识别，
 * 还原失败（丢 {{BW:...}} 占位符）要能触发带提示重试。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAuthError } from './translate';
import { isRestoreError, RETRY_PROTECT_HINT } from './translation-plan';

test('isAuthError 识别认证类失败（HTTP 401/403 与 key 文案）', () => {
  assert.equal(isAuthError(new Error('HTTP 401 — Unauthorized')), true);
  assert.equal(
    isAuthError(new Error('HTTP 400  — [{"error":{"code":400,"message":"Please pass a valid API key"}}]')),
    true,
  );
  assert.equal(isAuthError(new Error('HTTP 403 Forbidden')), true);
  assert.equal(isAuthError(new Error('invalid_api_key: bad key')), true);
  assert.equal(isAuthError(new Error('request unauthorized: missing bearer')), true);
});

test('isAuthError 不误伤限流/超时/普通失败', () => {
  assert.equal(isAuthError(new Error('The operation was aborted due to timeout')), false);
  assert.equal(isAuthError(new Error('HTTP 429 — rate limited, retry after 30s')), false);
  assert.equal(isAuthError(new Error('restore failed: token {{BW:url:2}} appears 0 times')), false);
  assert.equal(isAuthError(new Error('HTTP 500 — internal error')), false);
});

test('isAuthError 接受非 Error 输入', () => {
  assert.equal(isAuthError('HTTP 401 unauthorized'), true);
  assert.equal(isAuthError(undefined), false);
});

test('isRestoreError 只认 restore failed 前缀的 Error', () => {
  assert.equal(
    isRestoreError(new Error('restore failed: token {{BW:url:2}} (url) appears 0 times, expected exactly 1')),
    true,
  );
  assert.equal(isRestoreError(new Error('HTTP 400 bad request')), false);
  assert.equal(isRestoreError('restore failed: plain string'), false);
  assert.equal(isRestoreError(undefined), false);
});

test('RETRY_PROTECT_HINT 明确占位符逐字复现约束', () => {
  assert.ok(RETRY_PROTECT_HINT.includes('{{BW:'));
  assert.ok(/EXACTLY once/i.test(RETRY_PROTECT_HINT));
});
