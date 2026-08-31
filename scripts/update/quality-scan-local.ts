/**
 * 本地文章质量门禁扫描（stage 模式专用，用户决策 2026-08-31「入库但不上线」）。
 *
 * 遍历 src/content/articles/**/*.md，用当前模型逐篇打分，输出
 * ml/local-quality-verdicts.jsonl（按相对路径对齐）：
 *   {"file":"anthropic/en/foo.md","score":0.98,"wouldReject":true,"modelVersion":"v3-..."}
 * import-local-articles.mjs 读取该文件：wouldReject 的文章 published=false
 * （照常入库保存，SSR 不展示），并附带 score/model 供复审与模型升级后重评。
 *
 * 仅在 QUALITY_GATE_MODE=stage 时产出；off/shadow/enforce 下清空输出（影子观察期
 * 不改变上线行为）。重跑覆盖。
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyArticleQuality, loadQualityModel, resolveQualityGateMode } from './quality-model';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARTICLES_DIR = join(ROOT, 'src', 'content', 'articles');
const OUT = resolve(process.env.QUALITY_VERDICTS_FILE ?? join(ROOT, 'ml', 'local-quality-verdicts.jsonl'));

mkdirSync(dirname(OUT), { recursive: true });

const mode = resolveQualityGateMode();
if (mode !== 'stage') {
  try { rmSync(OUT, { force: true }); } catch { /* ignore */ }
  console.log(`quality-scan: QUALITY_GATE_MODE=${mode}，非 stage 不产出结论（${OUT} 已清空）`);
  process.exit(0);
}

const model = loadQualityModel();
let written = 0;
const lines: string[] = [];
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

for (const file of walk(ARTICLES_DIR)) {
  const raw = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) continue;
  const body = m[2].trim();
  if (!body) continue;
  // frontmatter 里取 title（轻量解析即可：title 行）
  const titleLine = /^title:\s*["']?([^"'\n]*)["']?$/m.exec(m[1]);
  const title = titleLine?.[1]?.trim() ?? '';
  const v = classifyArticleQuality({ title, contentMarkdown: body }, model);
  const rel = relative(ARTICLES_DIR, file).replace(/\\/g, '/');
  lines.push(JSON.stringify({
    file: rel,
    score: v.score,
    wouldReject: v.decision === 'reject',
    modelVersion: v.modelVersion,
  }));
  written += 1;
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`quality-scan: ${written} 篇已打分（stage）→ ${relative(ROOT, OUT)}｜模型 ${model.modelVersion}｜阈值 ${model.threshold}`);