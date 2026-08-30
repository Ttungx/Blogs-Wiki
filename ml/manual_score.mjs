/**
 * 真实样本手动验证打分：读 manual-test-samples.json → 生产 TS 推理（scripts/update/quality-model.ts）
 * → 对照人工预期（expect），输出通过/拒绝判定表。此脚本只读不写生产状态。
 */
import { readFileSync } from 'node:fs';
import { classifyArticleQuality, loadQualityModel } from '../scripts/update/quality-model.ts';

const samples = JSON.parse(readFileSync(new URL('./manual-test-samples.json', import.meta.url), 'utf8'))
  .filter((s) => s.text);
const model = loadQualityModel();
console.log(`模型 ${model.modelVersion}｜threshold ${model.threshold}｜样本 ${samples.length} 篇\n`);

let hit = 0;
const rows = samples.map((s) => {
  const v = classifyArticleQuality({ title: s.title ?? '', contentMarkdown: s.text }, model);
  const gateVerdict = v.decision === 'reject' ? 'reject' : 'pass';
  const expectVerdict = s.expect === 'reject' ? 'reject' : 'pass';
  const correct = gateVerdict === expectVerdict;
  if (correct) hit += 1;
  return { ...s, score: v.score, gateVerdict, correct };
});

for (const r of rows) {
  const mark = r.correct ? '✓' : '✗';
  console.log(
    `${mark} expect=${r.expect.padEnd(6)} gate=${r.gateVerdict.padEnd(6)} score=${r.score.toFixed(4)} len=${String(r.text.length).padStart(6)}  ${r.title?.slice(0, 46)}`,
  );
}
console.log(`\n判定一致 ${hit}/${rows.length}`);
const missed = rows.filter((r) => !r.correct);
for (const r of missed) {
  console.log(`\n[误判] ${r.url}\n  人工预期=${r.expect}（${r.why}）→ gate=${r.gateVerdict} score=${r.score.toFixed(4)}`);
}
