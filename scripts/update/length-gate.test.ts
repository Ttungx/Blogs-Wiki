import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  checkOriginalLength,
  LENGTH_GATE_CODE,
  LENGTH_GATE_MIN_EN_WORDS,
  LENGTH_GATE_MIN_ZH_CJK_CHARS,
} from './length-gate';

const enWords = (n: number): string => Array.from({ length: n }, (_, i) => `w${i % 37}`).join(' ');

test('length-gate: 英文原文 300 词硬阈值（边界两侧）', () => {
  const below = checkOriginalLength('en', enWords(LENGTH_GATE_MIN_EN_WORDS - 1));
  assert.equal(below.ok, false);
  assert.equal(below.metric, LENGTH_GATE_MIN_EN_WORDS - 1);

  const at = checkOriginalLength('en', enWords(LENGTH_GATE_MIN_EN_WORDS));
  assert.equal(at.ok, true);
  assert.equal(at.metric, LENGTH_GATE_MIN_EN_WORDS);
});

test('length-gate: 中文原文 1500 CJK 字符硬阈值（边界两侧）', () => {
  const zhText = (n: number): string => Array.from({ length: n }, () => '好').join('');
  // markdown 骨架用 ASCII，避免混入 CJK 干扰边界计数
  const below = checkOriginalLength('zh', `# Heading\n\n${zhText(LENGTH_GATE_MIN_ZH_CJK_CHARS - 1)}`);
  assert.equal(below.ok, false);
  assert.equal(below.metric, LENGTH_GATE_MIN_ZH_CJK_CHARS - 1);

  const at = checkOriginalLength('zh', zhText(LENGTH_GATE_MIN_ZH_CJK_CHARS));
  assert.equal(at.ok, true);
});

test('length-gate: zh-cn 语言码同走 CJK 口径', () => {
  const verdict = checkOriginalLength('zh-cn', enWords(500));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.metric, 0);
});

test('length-gate: 中文源残留英文原文（CJK=0）被拦', () => {
  const verdict = checkOriginalLength('zh', enWords(400));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.metric, 0);
});

test('length-gate: markdown 语法不虚增英文词数', () => {
  // 300 词正文包上标题/列表等 markdown 标记，词数按空白切分自然计入
  const body = `${enWords(299)}\n\n- tail`;
  const verdict = checkOriginalLength('en', `# Title\n\n${body}`);
  assert.equal(verdict.ok, true);
});

test('length-gate: 空内容一律拒绝；源级豁免放行', () => {
  assert.equal(checkOriginalLength('en', '').ok, false);
  assert.equal(checkOriginalLength('en', '   \n  ').ok, false);

  const exempt = checkOriginalLength('en', enWords(20), { disabled: true });
  assert.equal(exempt.ok, true);
  const exemptZh = checkOriginalLength('zh', enWords(400), { disabled: true });
  assert.equal(exemptZh.ok, true);
});

test('length-gate: 永久拒绝错误码不在可重试白名单语义内（契约锚定）', () => {
  assert.equal(LENGTH_GATE_CODE, 'original-too-short');
});
