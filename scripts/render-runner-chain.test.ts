/**
 * render-runner 链路契约：原文先行（AGENTS.md 翻译通道原则）。
 *
 * 翻译步骤整体失败（配置/配额/限流/网络）必须只 WARN 不中断链条，
 * 原文照常 quality-scan → import → sync 上线；其余步骤仍受 `set -e`
 * 严格约束。源码级断言（同 d1-budget-sync.test.ts 中 render-runner
 * 断言的先例，避免 import runner 触发其 main() 监听端口）。
 */

import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('render-runner 翻译失败降级原文先行，不中断链条', async () => {
  const src = await readFile(path.join(ROOT, 'scripts', 'render-runner.mjs'), 'utf8');

  // 其余步骤仍严格：set -e 保留，不允许 blanket 关闭。
  assert.match(src, /'set -e'/);
  assert.doesNotMatch(src, /set \+e/);

  // 翻译步骤带 || 容错 + 可 grep 的 WARN 标记。
  assert.match(src, /translate:batch -- \$\{sourceArg\} --report logs\/report/);
  assert.match(src, /\|\| echo "\[runner\] WARN translate degraded/);

  // 链序不变：抓取 → 翻译 → 打分 → 打包 → 推送（在 buildChainScript 的
  // return 数组内断言，避免命中文件头注释）。
  const fnStart = src.indexOf('function buildChainScript');
  assert.notEqual(fnStart, -1);
  const retStart = src.indexOf('return [', fnStart);
  const retEnd = src.indexOf('].join', retStart);
  assert.notEqual(retStart, -1);
  assert.notEqual(retEnd, -1);
  const chain = src.slice(retStart, retEnd);
  const order = [
    'fetchStep',
    'translateStep',
    'quality-scan',
    'import-local-articles.mjs',
    'sync-local-articles.mjs',
  ].map((marker) => {
    const index = chain.indexOf(marker);
    assert.notEqual(index, -1, `chain missing step: ${marker}`);
    return index;
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
