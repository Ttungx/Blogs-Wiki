import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWorkerEntry } from './inject-worker-entry.js';

test('Worker 入口把 scheduled 挂在 default export 对象上', () => {
  const source = renderWorkerEntry();
  assert.match(source, /export default \{/);
  assert.match(source, /fetch: fetchHandler,/);
  assert.match(source, /scheduled,/);
  assert.doesNotMatch(source, /export async function scheduled/);
  assert.doesNotMatch(source, /export default original/);
});
