/**
 * 质量模型测试（plan §32/§37.5）：
 * 1. parity —— TS 推理与 Python 训练侧在同一 artifact 上分数一致（plan §26 硬要求）
 * 2. 硬案例回归 —— 高价值文章绝不被 auto-reject（plan §18 安全属性）
 * 3. 门禁策略 —— 默认 off；shadow 只记录不拦截；enforce 才可阻塞（plan §28/§29）
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyArticleQuality,
  evaluateQualityGate,
  loadQualityModel,
  resolveQualityGateMode,
  setQualityModelForTest,
  type QualityModelArtifact,
} from './quality-model';

const ART_DIR = join(import.meta.dirname, '..', '..', 'ml', 'artifacts', 'current');
const model = JSON.parse(readFileSync(join(ART_DIR, 'model.json'), 'utf8')) as QualityModelArtifact;
const fixture = JSON.parse(readFileSync(join(ART_DIR, 'parity_fixture.json'), 'utf8')) as {
  samples: Array<{ id: string; title: string; text: string; label: string; score: number }>;
};
const hardcases = JSON.parse(readFileSync(join(ART_DIR, 'hardcases.json'), 'utf8')) as Array<{
  category: string; id: string; title: string; text: string; label: string; pyScore: number;
}>;

test('parity：TS 分数与 Python 导出一致（浮点容差 1e-6）', () => {
  setQualityModelForTest(model);
  assert.ok(fixture.samples.length >= 20);
  let worst = 0;
  for (const s of fixture.samples) {
    const v = classifyArticleQuality({ title: s.title, contentMarkdown: s.text }, model);
    worst = Math.max(worst, Math.abs(v.score - s.score));
  }
  assert.ok(worst <= 1e-6, `最大偏差 ${worst} 超过 1e-6`);
});

test('硬案例回归：KEEP 类高价值样本绝不被 auto-reject（plan §18）', () => {
  for (const h of hardcases.filter((x) => x.label === 'keep')) {
    const v = classifyArticleQuality({ title: h.title, contentMarkdown: h.text }, model);
    assert.ok(
      v.score < model.threshold,
      `${h.id}（${h.category}）score=${v.score.toFixed(4)} 被 auto-reject——出现系统性误杀`,
    );
  }
});

test('硬案例回归：公告/推广类负例高于阈值', () => {
  for (const h of hardcases.filter((x) => x.category === 'announce_reject' || x.category === 'promo_reject')) {
    const v = classifyArticleQuality({ title: h.title, contentMarkdown: h.text }, model);
    assert.ok(v.score >= model.threshold, `${h.id} score=${v.score.toFixed(4)} 低于阈值，负例漏放`);
  }
});

test('决策语义与阈值一致', () => {
  setQualityModelForTest(model);
  for (const s of fixture.samples.slice(0, 6)) {
    const v = classifyArticleQuality({ title: s.title, contentMarkdown: s.text }, model);
    assert.equal(v.decision, v.score >= model.threshold ? 'reject' : 'keep');
    assert.equal(v.modelVersion, model.modelVersion);
  }
});

test('QUALITY_GATE_MODE 缺省/非法值一律 off（fail-safe）', () => {
  assert.equal(resolveQualityGateMode({}), 'off');
  assert.equal(resolveQualityGateMode({ QUALITY_GATE_MODE: '' }), 'off');
  assert.equal(resolveQualityGateMode({ QUALITY_GATE_MODE: 'yes' }), 'off');
  assert.equal(resolveQualityGateMode({ QUALITY_GATE_MODE: 'SHADOW' }), 'shadow');
  assert.equal(resolveQualityGateMode({ QUALITY_GATE_MODE: 'enforce' }), 'enforce');
});

test('off 模式不加载模型、不改变行为', () => {
  setQualityModelForTest(null); // 若 off 模式触底加载会直接抛错
  const out = evaluateQualityGate({ title: 't', contentMarkdown: 'body' }, 'off');
  assert.equal(out.mode, 'off');
  assert.equal(out.blocked, false);
  assert.equal(out.verdict.modelVersion, 'none');
});

test('stage 模式（入库但不上线）：与 shadow 同行为，不拦截', () => {
  setQualityModelForTest(model);
  const hot = hardcases.find((x) => x.category === 'announce_reject')!;
  const out = evaluateQualityGate({ title: hot.title, contentMarkdown: hot.text }, 'stage', { url: hot.url });
  assert.equal(out.blocked, false);
  assert.equal(out.verdict.decision, 'reject');
  assert.equal(resolveQualityGateMode({ QUALITY_GATE_MODE: 'stage' }), 'stage');
});

test('shadow 模式计算并记录 wouldReject，但不拦截', () => {
  setQualityModelForTest(model);
  const lines: string[] = [];
  const hot = hardcases.find((x) => x.category === 'announce_reject')!;
  const out = evaluateQualityGate({ title: hot.title, contentMarkdown: hot.text }, 'shadow', {
    log: (m) => lines.push(m),
  });
  assert.equal(out.blocked, false);
  assert.equal(out.verdict.decision, 'reject');
  assert.ok(lines[0].includes('wouldReject=true'));
});

test('enforce 模式仅对 reject 判定阻塞', () => {
  setQualityModelForTest(model);
  const hot = hardcases.find((x) => x.category === 'announce_reject')!;
  const good = hardcases.find((x) => x.label === 'keep')!;
  assert.equal(evaluateQualityGate({ title: hot.title, contentMarkdown: hot.text }, 'enforce').blocked, true);
  assert.equal(evaluateQualityGate({ title: good.title, contentMarkdown: good.text }, 'enforce').blocked, false);
});

test('真实 artifact 可加载且字段完整', () => {
  setQualityModelForTest(null);
  const m = loadQualityModel();
  assert.ok(m.modelVersion);
  assert.ok(m.threshold > 0 && m.threshold < 1);
  assert.ok(Object.keys(m.char).length > 10000);
  setQualityModelForTest(model);
});
