/**
 * 本地文章质量门禁扫描（stage 模式专用，用户决策 2026-08-31「入库但不上线」）。
 *
 * 遍历 src/content/articles 下所有 markdown 文件，用当前模型逐篇打分，输出
 * ml/local-quality-verdicts.jsonl（按相对路径对齐）：
 *   {"file":"anthropic/en/foo.md","score":0.98,"wouldReject":true,"modelVersion":"v3-..."}
 * import-local-articles.mjs 读取该文件：wouldReject 的文章 published=false
 * （照常入库保存，SSR 不展示），并附带 score/model 供复审与模型升级后重评。
 *
 * 仅在 QUALITY_GATE_MODE=stage 时产出；off/shadow/enforce 下清空输出（影子观察期
 * 不改变上线行为）。重跑覆盖。
 *
 * 用法：quality-scan [--source <id>]
 *   --source <id>   只扫该源目录（render-runner 链尾逐源调用，禁止每轮扫全库）
 *   不带 --source = 显式运维全扫（消耗模型调用，勿绑 15 分钟链）
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyArticleQuality,
  isVerdictFresh,
  loadQualityModel,
  resolveQualityGateMode,
  verdictLine,
} from './quality-model';
import type { StoredQualityVerdict } from './quality-model';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARTICLES_DIR = join(ROOT, 'src', 'content', 'articles');
const OUT = resolve(process.env.QUALITY_VERDICTS_FILE ?? join(ROOT, 'ml', 'local-quality-verdicts.jsonl'));

const sourceArgIndex = process.argv.findIndex((arg) => arg === '--source' || arg.startsWith('--source='));
const sourceId = sourceArgIndex === -1
  ? ''
  : process.argv[sourceArgIndex]!.startsWith('--source=')
    ? process.argv[sourceArgIndex]!.slice('--source='.length)
    : process.argv[sourceArgIndex + 1] ?? '';

mkdirSync(dirname(OUT), { recursive: true });

const mode = resolveQualityGateMode();
if (mode !== 'stage') {
  try { rmSync(OUT, { force: true }); } catch { /* ignore */ }
  console.log(`quality-scan: QUALITY_GATE_MODE=${mode}，非 stage 不产出结论（${OUT} 已清空）`);
  process.exit(0);
}

const model = loadQualityModel();
let written = 0;
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// 逐源调用只覆写该源的 verdict 条目（保留其余源的既有结论，供运维复审）；
// 不带 --source 的全扫整体覆盖（历史行为）。
// 增量指纹 = mtimeMs + modelVersion + threshold：三者不变直接复用旧结论
// （import 只读 file/score/wouldReject，多余字段对消费方透明）。
let mergedLines: string[] = [];
const prevByFile = new Map<string, StoredQualityVerdict>();
if (sourceId) {
  try {
    const before = readFileSync(OUT, 'utf8');
    for (const l of before.split('\n')) {
      if (!l.trim()) continue;
      mergedLines.push(l);
      try {
        const v = JSON.parse(l) as StoredQualityVerdict;
        if (v.file) prevByFile.set(v.file, v);
      } catch { /* 坏行忽略，重扫兜底 */ }
    }
    mergedLines = mergedLines.filter((l) => !l.includes(`"file":"${sourceId}/`));
  } catch { /* 无旧文件 */ }
}

const scanBase = sourceId ? join(ARTICLES_DIR, sourceId) : ARTICLES_DIR;
if (sourceId && !existsSync(scanBase)) {
  console.log(`quality-scan: source ${sourceId} 无本地 corpus，跳过（0 篇）`);
  writeFileSync(OUT, mergedLines.join('\n') + (mergedLines.length ? '\n' : ''), 'utf8');
  process.exit(0);
}

for (const file of walk(scanBase)) {
  const rel = relative(ARTICLES_DIR, file).replace(/\\/g, '/');
  const mtimeMs = statSync(file).mtimeMs;
  const prev = prevByFile.get(rel);
  if (prev && isVerdictFresh(prev, model, mtimeMs)) {
    mergedLines.push(verdictLine(prev));
    written += 1;
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) continue;
  const body = m[2].trim();
  if (!body) continue;
  // frontmatter 里取 title（轻量解析即可：title 行）
  const titleLine = /^title:\s*["']?([^"'\n]*)["']?$/m.exec(m[1]);
  const title = titleLine?.[1]?.trim() ?? '';
  const v = classifyArticleQuality({ title, contentMarkdown: body }, model);
  mergedLines.push(verdictLine({
    file: rel,
    score: v.score,
    wouldReject: v.decision === 'reject',
    modelVersion: v.modelVersion,
    threshold: model.threshold,
    mtimeMs,
  }));
  written += 1;
}

writeFileSync(OUT, mergedLines.join('\n') + (mergedLines.length ? '\n' : ''), 'utf8');
console.log(`quality-scan: ${written} 篇结论（stage，mtime 增量）→ ${relative(ROOT, OUT)}｜模型 ${model.modelVersion}｜阈值 ${model.threshold}｜范围 ${sourceId ? `source:${sourceId}` : '全部'}`);