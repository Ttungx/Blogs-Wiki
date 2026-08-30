import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreArticle, loadQualityModel, setQualityModelForTest } from '../scripts/update/quality-model.ts';

const samples = JSON.parse(readFileSync('ml/manual-test-samples.json', 'utf8')).filter((s) => s.text);
const models = {
  v1: JSON.parse(readFileSync('ml/artifacts/v1-20260830/model.json', 'utf8')),
  v2: JSON.parse(readFileSync('ml/artifacts/current/model.json', 'utf8')),
};
console.log(`v1 threshold=${models.v1.threshold}｜v2 threshold=${models.v2.threshold}\n`);
let v1ok = 0, v2ok = 0;
for (const s of samples) {
  const expectReject = s.expect === 'reject';
  const s1 = scoreArticle(models.v1, s.title ?? '', s.text);
  const s2 = scoreArticle(models.v2, s.title ?? '', s.text);
  const d1 = (s1 >= models.v1.threshold) === expectReject;
  const d2 = (s2 >= models.v2.threshold) === expectReject;
  if (d1) v1ok++; if (d2) v2ok++;
  const diff = Math.abs(s2 - s1) > 0.3 ? ' ⚡' : '';
  console.log(`${d1 ? '✓' : '✗'}→${d2 ? '✓' : '✗'} expect=${s.expect.padEnd(6)} v1=${s1.toFixed(4)} v2=${s2.toFixed(4)}${diff}  ${s.title?.slice(0, 42)}`);
}
console.log(`\n判定一致：v1 ${v1ok}/${samples.length} → v2 ${v2ok}/${samples.length}`);
