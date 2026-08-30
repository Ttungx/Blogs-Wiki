import { readFileSync } from 'node:fs';
import { scoreArticle } from '../scripts/update/quality-model.ts';

const samples = JSON.parse(readFileSync('ml/manual-test-samples.json', 'utf8')).filter((s) => s.text);
const models = {
  v2: JSON.parse(readFileSync('ml/artifacts/v2-20260830/model.json', 'utf8')),
  v3: JSON.parse(readFileSync('ml/artifacts/current/model.json', 'utf8')),
};
console.log(`v2 threshold=${models.v2.threshold}｜v3 threshold=${models.v3.threshold}\n`);
let aOk = 0, bOk = 0;
for (const s of samples) {
  const expectReject = s.expect === 'reject';
  const sA = scoreArticle(models.v2, s.title ?? '', s.text);
  const sB = scoreArticle(models.v3, s.title ?? '', s.text);
  const dA = (sA >= models.v2.threshold) === expectReject;
  const dB = (sB >= models.v3.threshold) === expectReject;
  if (dA) aOk++; if (dB) bOk++;
  const diff = Math.abs(sB - sA) > 0.3 ? ' ⚡' : '';
  console.log(`${dA ? '✓' : '✗'}→${dB ? '✓' : '✗'} expect=${s.expect.padEnd(6)} v2=${sA.toFixed(4)} v3=${sB.toFixed(4)}${diff}  ${s.title?.slice(0, 42)}`);
}
console.log(`\n判定一致：v2 ${aOk}/${samples.length} → v3 ${bOk}/${samples.length}`);
