/**
 * 伪数学判定与三处消费方的回归测试（node:test）。
 *
 * 背景 2026-09-12：正文美元金额对 `$600 ... $7,000` 被 remark-math 配对成
 * 行内公式——KaTeX 渲染成无空格斜体吞掉整段英文（openai/
 * research-acceleration-view-inside-openai），翻译保护还会阻止该句翻译。
 * 判定统一在 src/lib/server/math-guard.ts，渲染 / 翻译保护 / 完整性校验共用。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { isPseudoMath } from '../../src/lib/server/math-guard';
import { assertMathIntegrity, collectMathInventory } from './content-integrity';
import { protectMarkdown } from './translation-plan';

test('isPseudoMath：缺 TeX 信号的金额/文本判定为伪数学', () => {
  assert.equal(isPseudoMath('600 per day of inference at API prices. The 90th percentile user'), true);
  assert.equal(isPseudoMath('99.6 与 99.8 之间的差距'), true);
  assert.equal(isPseudoMath(''), false);
  assert.equal(isPseudoMath(null), false);
});

test('isPseudoMath：带 TeX 信号的真公式不是伪数学', () => {
  assert.equal(isPseudoMath('E = mc^2'), false);
  assert.equal(isPseudoMath('\\frac{a}{b}'), false);
  assert.equal(isPseudoMath('\\begin{align} L &= E \\\\ \\end{align}'), false);
  assert.equal(isPseudoMath('a_1 + b_2'), false);
});

test('collectMathInventory 不把伪数学计入清单', () => {
  const markdown = '超过 $600 per day of inference. The 90th percentile user uses more than $7,000 tokens.';
  assert.deepEqual(collectMathInventory(markdown), []);
  // 真公式仍正常计入
  assert.equal(collectMathInventory('能量 $E = mc^2$。').length, 1);
});

test('assertMathIntegrity：译文不再保留伪数学不算丢失', async () => {
  const source = '超过 $600 per day of inference at API prices. The 90th percentile now uses more than $7,000 tokens.';
  // 译文把金额句翻译成了中文（伪数学形态自然消失）
  const translated = '每天使用的 token 超过 600 美元，第 90 百分位的用户每天使用超过 7,000 个 token。';
  assert.doesNotThrow(() => assertMathIntegrity(source, translated));
  // 真公式被删仍然必须报错
  assert.throws(() => assertMathIntegrity('公式 $E = mc^2$。', '公式没了。'));
});

test('protectMarkdown 不保护伪数学（金额句可被翻译）', () => {
  const markdown = '超过 $600 per day of inference at API prices. The 90th percentile uses more than $7,000 tokens.';
  const { text, spans } = protectMarkdown(markdown);
  assert.equal(spans.filter((span) => span.kind === 'inline-math' || span.kind === 'math').length, 0);
  // 美元金额原文保留在模型可见文本里（可被翻译）
  assert.match(text, /600 per day of inference/);
  // 真公式仍被保护
  const realMath = protectMarkdown('公式 $E = mc^2$。');
  assert.equal(realMath.spans.filter((span) => span.kind === 'inline-math' || span.kind === 'math').length, 1);
});
