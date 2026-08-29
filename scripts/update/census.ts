/**
 * 发现层清点（census）：只枚举文章 URL 并统计数量，不抓正文、不翻译、不写文章。
 *
 * 口径：
 * - 仅统计 update_mode === "active" 的源（--only 可再过滤）。
 * - type === "personal"（个人作者）：计入全部候选文章。
 * - 其余（company 等）：只计入发布日期 >= 2019-01-01 的候选；日期未知单独计数。
 * - 日期来源：发现层 publishedAt（RSS pubDate / sitemap lastmod / listing 提取），
 *   缺失时回退 url_date_pattern 从 URL 推断；仍无则计 unknown。
 *   注意 sitemap lastmod 为最后修改时间，可能晚于真实发布日期。
 *
 * 用法：npx tsx --env-file-if-exists=.env scripts/update/census.ts [--only id1,id2]
 * 输出：控制台表格 + .tmp-census.json（增量落盘，中断不丢数据）。
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from './config';
import { diagnoseSourceDiscovery } from './discovery';
import { createFetchImpl } from './network';
import { urlDateFromPattern } from './url-date';
// 触发 curl 回退注册（fetch-backend 顶层 import 同款；census 不走 fetch-backend）。
// openai 等 CDN 对 Node TLS 指纹 + 无尾斜杠 sitemap 路径返回 403，需 curl 栈兜底。
import '../../worker/fetch/curl';
import type { Logger, SourceConfig } from './types';

const CENSUS_START_YEAR = 2019;

interface SourceCensus {
  sourceId: string;
  type: string;
  ok: boolean;
  totalCandidates: number;
  counted: number; // 计入范围的数量（personal 全部 / company 2019+）
  dateKnown: number;
  dateUnknown: number;
  byYear: Record<string, number>;
  paths: Array<{ name: string; ok: boolean; rawCount: number; candidateCount: number; error?: string }>;
  error?: string;
}

function parseDate(raw: string | undefined, url: string, pattern: string | undefined): string | undefined {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return urlDateFromPattern(pattern, url);
}

const logger: Logger = {
  info: (message) => console.log(`ℹ ${message}`),
  warn: (message) => console.warn(`⚠ ${message}`),
  error: (message) => console.error(`✗ ${message}`),
};

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex !== -1 ? (args[onlyIndex + 1] ?? '').split(',').filter(Boolean) : null;

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const allSources = await loadSources(rootDir);
  const sources: SourceConfig[] = allSources.filter((source) => {
    if (source.update_mode !== 'active') return false;
    return !only || only.includes(source.id);
  });

  console.log(`census: ${sources.length} active source(s)${only ? ` (filtered: ${only.join(', ')})` : ''}`);
  const fetchImpl = createFetchImpl(logger);
  const results: SourceCensus[] = [];
  const outFile = '.tmp-census.json';
  if (existsSync(outFile)) {
    try {
      results.push(...(JSON.parse(readFileSync(outFile, 'utf8')) as SourceCensus[]));
      console.log(`resumed with ${results.length} previous result(s)`);
    } catch {
      // 损坏的旧结果文件直接忽略，重新清点
    }
  }
  const done = new Set(results.map((r) => r.sourceId));

  for (const source of sources) {
    if (done.has(source.id)) {
      console.log(`skip (already counted): ${source.id}`);
      continue;
    }
    const startedAt = Date.now();
    try {
      const diagnostic = await diagnoseSourceDiscovery(source, fetchImpl);
      const pattern = (source as unknown as { url_date_pattern?: string }).url_date_pattern;
      // min_published_year 覆盖默认口径：company 的 2019 下限与 personal 的
      // "不限时间" 都以源级配置为准。设置后
      // 日期未知的候选不再计入（无法判定是否在窗口内）。
      const startYear = source.min_published_year ?? CENSUS_START_YEAR;
      const bounded = source.min_published_year !== undefined || source.type !== 'personal';
      const byYear: Record<string, number> = {};
      let dateKnown = 0;
      let dateUnknown = 0;
      let counted = 0;

      for (const candidate of diagnostic.candidates) {
        const date = parseDate(candidate.publishedAt, candidate.url, pattern);
        if (!date) {
          dateUnknown += 1;
          // 个人作者不限时间：日期未知的候选仍计入范围（真实日期在抓取正文层再取）
          if (!bounded) counted += 1;
          continue;
        }
        dateKnown += 1;
        const year = date.slice(0, 4);
        byYear[year] = (byYear[year] ?? 0) + 1;
        if (!bounded || year >= String(startYear)) counted += 1;
      }

      results.push({
        sourceId: source.id,
        type: source.type,
        ok: true,
        totalCandidates: diagnostic.candidates.length,
        counted,
        dateKnown,
        dateUnknown,
        byYear,
        paths: diagnostic.paths.map((p) => ({
          name: p.name,
          ok: p.ok,
          rawCount: p.rawCount,
          candidateCount: p.candidateCount,
          error: p.error,
        })),
      });
      console.log(
        `✓ ${source.id.padEnd(22)} candidates=${diagnostic.candidates.length} counted=${counted} unknownDate=${dateUnknown} (${Math.round((Date.now() - startedAt) / 1000)}s)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        sourceId: source.id,
        type: source.type,
        ok: false,
        totalCandidates: 0,
        counted: 0,
        dateKnown: 0,
        dateUnknown: 0,
        byYear: {},
        paths: [],
        error: message,
      });
      console.error(`✗ ${source.id.padEnd(22)} FAILED: ${message}`);
    }
    writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const okCount = results.filter((r) => r.ok).length;
  const total = results.reduce((sum, r) => sum + r.counted, 0);
  console.log(`\ncensus done: ${okCount}/${results.length} sources ok, counted total = ${total}`);
  console.log(`results written to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
