#!/usr/bin/env node
/**
 * Render 免费 Web Service 入口：外部定时器（Cloudflare Worker Cron，
 * 每 15 分钟）请求 /run 触发「单源更新链」，与 content-sync 组合构成
 * 无状态内容更新路径。
 *
 * 为什么重活不放进 Worker：Workers 免费版单请求 10ms CPU，Defuddle 解析
 * 一篇 HTML 就会超限；这里跑完整 Node 环境，无此限制。
 *
 * 设计要点：
 * - 无状态轮转选源：按时间片（RUN_INTERVAL_MINUTES，默认 5 分钟,与 cron 频率一致）取模决定
 *   本轮处理的源。容器重启/休眠唤醒不影响正确性；25 源 × 15 分钟 ≈ 每源
 *   每 6 小时更新一次（Worker cron `7,22,37,52 * * * *` 与切片同频）。
 *   ping 同时让免费实例保持常驻（约 720h/月 < 750h 免费额度），消除冷启动。
 * - 触发即返回：spawn 子进程异步执行整条链（update → translate:batch 补翻
 *   → quality-scan → import → sync），HTTP 立即 202，绕开平台路由超时；
 *   进度看日志文件与 Render 日志流。
 * - ⚠️ D1 写入预算（2026-09-02 起，docs/d1-write-budget.md）：链尾 import/sync
 *   严格按本源 `--source` + `--since startedAt` 收本轮产物；无新文件则产出
 *   0 篇 payload，sync 直接跳过不 POST。链上不再存在整库全量步骤。
 * - 幂等兜底：漏跑/重复跑无害——content-sync 按 (source_id, original_url)
 *   去重，且 B 阶段起按内容指纹跳过未变化文章（重复 payload 零写入）；
 *   管线 CONTENT_SYNC_CHECK_URL 预检避免重复抓取+翻译（含 90 天内
 *   门禁拒绝负缓存，经 /api/content-sync/items 上报）。
 * - 忙碌保护：同一时刻最多一条链在跑；忙时返回 202 busy，下轮自动补位。
 * - 轮次看门狗：单轮超过 RUNNER_ROUND_STALL_MINUTES（默认 90 分钟，容纳长文预算轮）视为
 *   失速，标记 stalled-watchdog 并放行新轮（链路幂等，重叠安全）。
 *
 * 环境变量：
 *   PORT                  监听端口（Render 注入，默认 8080）
 *   RUNNER_KEY            /run 鉴权 key（必须设置；与 CF Worker 的
 *                         CONTENT_SYNC_TOKEN 同值）
 *   RUN_INTERVAL_MINUTES  无状态轮转时间片长度（默认 5,须与 Worker cron 频率一致,否则同一片内的 ping 全部重复同源）
 *   RUNNER_ROUND_STALL_MINUTES  单轮失速看门狗阈值（默认 45）
 *   UPDATE_LIMIT          每源单次最大文章数（默认走 sources.json 配置）
 *   CONTENT_SYNC_TOKEN / CONTENT_SYNC_URL / CONTENT_SYNC_CHECK_URL /
 *   OPENAI_API_KEY / OPENAI_BASE_URL / TRANSLATION_MODEL /
 *   MODEL_REASONING_EFFORT   更新链所需，透传给子进程
 *
 * 端点：
 *   GET  /healthz   健康检查（Render healthCheckPath 用）
 *   GET  /status    运行状态 JSON
 *   GET|POST /run?key=K[&source=id][&limit=n]   触发一轮更新链
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const INTERVAL_MS = Number(process.env.RUN_INTERVAL_MINUTES || 5) * 60_000;
const DEFAULT_LIMIT = (process.env.UPDATE_LIMIT || '').trim();
const LOG_DIR = path.join(ROOT, 'logs', 'runs');
const KEEP_LOGS = 50;
// Windows 本地调试靠 PATH 找 Git Bash；Render Linux 固定 /bin/bash。
const SHELL = process.platform === 'win32' ? 'bash' : '/bin/bash';

function loadActiveSources() {
  const file = path.join(ROOT, 'src', 'data', 'sources.json');
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error('sources.json must be a top-level array');
  const active = list.filter((s) => s && typeof s.id === 'string' && s.update_mode === 'active');
  if (active.length === 0) throw new Error('no active sources in sources.json');
  return active;
}

function pruneLogs() {
  try {
    if (!existsSync(LOG_DIR)) return;
    const files = readdirSync(LOG_DIR)
      .map((name) => {
        const full = path.join(LOG_DIR, name);
        return { full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (const stale of files.slice(KEEP_LOGS)) unlinkSync(stale.full);
  } catch (error) {
    console.error(`log prune failed: ${error instanceof Error ? error.message : error}`);
  }
}

let busy = false;
let lastRun = null;
// 每源最近若干轮的运行结果。容器每 1-2 轮重建，内存态随之重置；这里只求
// 「本实例可见的最近历史」，够用来回答「这个源到底还活着吗」。
const RUN_HISTORY_LIMIT = 60;
const runHistory = [];

/**
 * 从链日志里抠出本轮吞吐指标。日志行形如：
 *   [openai] discovered 205, new 7, processing 3
 *   openai: discovered=205 new=7 processed=1 failed=2
 */
function extractRunMetrics(text) {
  const metrics = { discovered: null, new: null, processing: null, processed: null, failed: null };
  const progress = text.match(/discovered\s+(\d+),\s+new\s+(\d+),\s+processing\s+(\d+)/);
  if (progress) {
    metrics.discovered = Number(progress[1]);
    metrics.new = Number(progress[2]);
    metrics.processing = Number(progress[3]);
  }
  const summary = text.match(/processed=(\d+)\s+failed=(\d+)/);
  if (summary) {
    metrics.processed = Number(summary[1]);
    metrics.failed = Number(summary[2]);
  }
  return metrics;
}

/** 值得打进日志流的行：抓取失败、翻译降级、门禁拒绝、OOM 等。 */
const NOISE_RE = /error:|Error:|warning:|WARN |FATAL|failed|rejected|degraded/i;

/** 单轮失速上限（毫秒），超过即被看门狗放行；RUNNER_ROUND_STALL_MINUTES 可调。 */
const ROUND_STALL_LIMIT_MS =
  Math.max(1, Number((process.env.RUNNER_ROUND_STALL_MINUTES ?? '90').trim()) || 90) * 60_000;

function extractNotableLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && NOISE_RE.test(line))
    .slice(-25);
}

/**
 * 按源汇总「最近 N 轮是否持续零产出」。只统计本实例见到的轮次；
 * 阈值 2 轮即可报警——7 小时一轮的源，连续 2 轮空转就是 14 小时没进新文章。
 */
function summarizeZeroYield(history) {
  const bySource = new Map();
  for (const run of history) {
    if (!run || !run.sourceId) continue;
    const entry = bySource.get(run.sourceId) ?? { sourceId: run.sourceId, runs: 0, zeroRuns: 0 };
    entry.runs += 1;
    if (run.metrics?.processed === 0) entry.zeroRuns += 1;
    bySource.set(run.sourceId, entry);
  }
  return [...bySource.values()].filter((e) => e.runs >= 2 && e.zeroRuns === e.runs);
}

function buildChainScript(sourceId, limitArg, startedAt) {
  // 单条链：发现/去重/抓取/翻译 → 补翻缺失译文 → 质量打分（仅本源）→
  // 本轮产物（本源 + mtime >= startedAt）→ 分片推送 D1。
  // translate:batch 只补本地 corpus 缺 zh 版本的原文（断点续传），单篇失败
  // 只记错误台账不退出，不会拖垮链条；随后 import+sync 把新译文一并推上 D1。
  // 原文先行（AGENTS.md 翻译通道原则）：翻译步骤整体失败（配置/配额/限流/网络）
  // 只记 WARN 不中断链条——原文照常 quality-scan → import → sync 上线展示；
  // 下轮 translate:batch 重扫缺 zh 原文自动补翻，译文经 import+sync 增量上 D1。
  // ⚠️ D1 写入预算（docs/d1-write-budget.md）：链尾 import/sync 必须锁定本源
  // + startedAt 增量，禁止整库全量（每日写入曾打到 9 万行）。无新文件时
  // import 产出 0 篇 payload，sync 直接跳过，不 POST。
  // RUNNER_BACKFILL=true（生产回填期）：把增量 update 换成历史 backfill——
  // Render 自抓全量历史并翻译，兼容本地回填文件不在容器内的现状（2026-08-31）。
  const fetchStep = process.env.RUNNER_BACKFILL === 'true'
    ? `npm run backfill -- --source ${JSON.stringify(sourceId)}${limitArg}`
    : `npm run update -- --source ${JSON.stringify(sourceId)} --report logs/report${limitArg}`;
  const sourceArg = `--source ${JSON.stringify(sourceId)}`;
  const sinceArg = `--since ${JSON.stringify(startedAt)}`;
  // 翻译容错：任何失败都降级为原文先行（见上），链条继续。WARN 行为可 grep 审计：
  // Render 日志流搜 "WARN translate degraded"。
  const translateStep =
    `npm run translate:batch -- ${sourceArg} --report logs/report` +
    ` || echo "[runner] WARN translate degraded, continuing with originals (${sourceId})"`;
  // D1 补翻（2026-09-09）：translate:batch 只扫容器本地磁盘，而免费实例每
  // 1-2 轮就重建，历史英文原文永远扫不到。这一步直接向 D1 要「有原文、缺
  // 中译」的清单，翻译后写回，与容器本地状态解耦——这是英文残留的自愈通道。
  // 默认每轮 12 篇（并发 3 + 10 分钟预算内），TRANSLATE_BACKLOG_LIMIT=0 可关闭。
  const backlogLimit = Number((process.env.TRANSLATE_BACKLOG_LIMIT ?? '12').trim());
  const backlogStep =
    Number.isFinite(backlogLimit) && backlogLimit > 0
      ? [
          `npm run translate:backlog -- ${sourceArg} --limit ${Math.floor(backlogLimit)}` +
            ` || echo "[runner] WARN translate backlog degraded (${sourceId})"`,
        ]
      : [];
  return [
    'set -e',
    fetchStep,
    translateStep,
    ...backlogStep,
    `npm run quality-scan -- ${sourceArg}`,
    `node scripts/import-local-articles.mjs --json ${sinceArg} ${sourceArg} --output logs/.tmp-import-articles.json`,
    `node scripts/sync-local-articles.mjs --input logs/.tmp-import-articles.json`,
    'echo CHAIN_OK',
  ].join('\n');
}

function startUpdateChain(sourceId, limitArg) {
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `${stamp}_${sourceId}.log`);
  const startedAt = new Date().toISOString();

  busy = true;
  // 每轮独立 run 对象（而非引用模块级 lastRun）：看门狗放行新轮后，旧子
  // 进程的 close 回调只回写自己的 run，不会污染新一轮的状态。
  const run = {
    sourceId,
    startedAt,
    finishedAt: null,
    status: 'running',
    logFile: path.relative(ROOT, logFile),
  };
  lastRun = run;

  let fd;
  try {
    fd = openSync(logFile, 'a');
    const child = spawn(
      SHELL,
      ['-c', buildChainScript(sourceId, limitArg, startedAt)],
      { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd], env: process.env },
    );
    child.on('close', (code) => {
      busy = false;
      run.status = code === 0 ? 'ok' : `exit-${code}`;
      run.finishedAt = new Date().toISOString();

      let logText = '';
      try {
        logText = readFileSync(run.logFile, 'utf8');
      } catch (e) {
        console.error(`[runner] failed to read chain log: ${e.message}`);
      }
      run.metrics = extractRunMetrics(logText);
      const m = run.metrics;

      console.log(
        `[runner] ${sourceId} chain ${run.status} (${run.logFile})` +
          (m.processed !== null ? ` processed=${m.processed} failed=${m.failed}` : ''),
      );

      if (code !== 0) {
        // 链路失败：把日志尾部打到 stdout（Render 日志流可见），并存入
        // run.errorTail（/status 暴露），否则错误只在容器文件里。
        const tail = logText.split('\n').slice(-40).join('\n');
        run.errorTail = tail.slice(-4000);
        console.error(`[runner] === chain failure log tail (${sourceId}) ===\n${tail}`);
      } else {
        // 成功轮次同样要把告警行打进日志流。2026-09-09 事故根因：源级失败
        // 与篇级失败都不改退出码，链照常 CHAIN_OK，于是「每轮 0 篇入库」
        // 在 Render 日志流里和「正常运转」长得一模一样，连续 7 天无人察觉。
        const notable = extractNotableLines(logText);
        if (notable.length > 0) {
          run.warningTail = notable.join('\n').slice(-4000);
          console.warn(`[runner] === chain warning summary (${sourceId}) ===\n${run.warningTail}`);
        }
        if (m.processed === 0) {
          console.warn(
            `[runner] ${sourceId} produced 0 new article(s) this round ` +
              `(discovered=${m.discovered} new=${m.new} processing=${m.processing})`,
          );
        }
      }

      runHistory.push(run);
      if (runHistory.length > RUN_HISTORY_LIMIT) runHistory.shift();
      pruneLogs();
    });
    child.on('error', (err) => {
      busy = false;
      run.status = 'spawn-error';
      console.error(`[runner] spawn failed: ${err.message}`);
    });
    child.unref();
  } catch (error) {
    busy = false;
    run.status = 'start-error';
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  return run;
}

function pickSource(sources, explicitId) {
  if (explicitId) {
    const matched = sources.find((s) => s.id === explicitId);
    if (!matched) throw new Error(`unknown source id "${explicitId}"`);
    return matched;
  }
  const bucket = Math.floor(Date.now() / INTERVAL_MS);
  return sources[bucket % sources.length];
}

function respond(res, status, body) {
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
  });
  res.end(text);
}

function authorized(url) {
  const expected = (process.env.RUNNER_KEY || '').trim();
  if (!expected) return false;
  const provided = url.searchParams.get('key') ?? '';
  return provided === expected;
}

function parseLimit(raw) {
  if (raw === null) return DEFAULT_LIMIT ? ` --limit ${DEFAULT_LIMIT}` : '';
  if (!/^\d+$/.test(raw)) throw new Error('limit must be a non-negative integer');
  return ` --limit ${raw}`;
}

function handle(req, res, sources, bootAt) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') {
    respond(res, 200, 'ok');
    return;
  }

  if (url.pathname === '/status') {
    respond(res, 200, {
      busy,
      lastRun,
      // 最近若干轮（本实例内存态）。用来判断某个源是不是长期 0 产出：
      // 连着几轮 processed=0 就说明它已经事实停更，而不是「暂时没新文章」。
      history: runHistory,
      zeroYieldSources: summarizeZeroYield(runHistory),
      activeSources: sources.length,
      intervalMinutes: Math.round(INTERVAL_MS / 60_000),
      uptimeSeconds: Math.round((Date.now() - bootAt) / 1000),
    });
    return;
  }

  if (url.pathname === '/') {
    respond(res, 200, {
      service: 'blogs-wiki-updater',
      endpoints: ['/healthz', '/status', '/run?key=KEY[&source=id][&limit=n]'],
    });
    return;
  }

  if (url.pathname === '/run') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      respond(res, 405, { error: 'method not allowed' });
      return;
    }
    if (!authorized(url)) {
      respond(res, 401, { error: 'unauthorized' });
      return;
    }
    if (busy) {
      // 看门狗（2026-09-12）：单轮失速（实证：4 篇长文 × 全链 8 模型各 300s
      // 超时能把一轮拖到数小时）不得阻塞整个轮转。超时后标记 stalled-watchdog
      // 并放行新轮；旧子进程照常跑完，链路按 (source_id, original_url) 幂等，
      // 与新轮重叠安全。RUNNER_ROUND_STALL_MINUTES 可调（默认 45 分钟）。
      const startedMs = lastRun?.startedAt ? Date.parse(lastRun.startedAt) : NaN;
      if (Number.isFinite(startedMs) && Date.now() - startedMs > ROUND_STALL_LIMIT_MS) {
        const stalledSource = lastRun?.sourceId ?? '?';
        lastRun.status = 'stalled-watchdog';
        lastRun.finishedAt = new Date().toISOString();
        busy = false;
        console.warn(
          `[runner] WARN round watchdog: ${stalledSource} exceeded ` +
            `${Math.round(ROUND_STALL_LIMIT_MS / 60_000)}min, releasing busy for next round`,
        );
      } else {
        respond(res, 202, { status: 'busy', lastRun });
        return;
      }
    }

    let limitArg;
    try {
      limitArg = parseLimit(url.searchParams.get('limit'));
    } catch (error) {
      respond(res, 400, { error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const source = pickSource(sources, url.searchParams.get('source'));
    const started = startUpdateChain(source.id, limitArg);
    respond(res, 202, { status: 'started', sourceId: started.sourceId, logFile: started.logFile });
    return;
  }

  respond(res, 404, { error: 'not found' });
}

function main() {
  if (!(process.env.RUNNER_KEY || '').trim()) {
    console.error('[runner] fatal: RUNNER_KEY is not set; refusing to serve /run.');
  }
  const sources = loadActiveSources();
  const bootAt = Date.now();
  console.log(`[runner] ${sources.length} active source(s); rotation interval ${Math.round(INTERVAL_MS / 60_000)}min`);

  const server = http.createServer((req, res) => {
    try {
      handle(req, res, sources, bootAt);
    } catch (error) {
      respond(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(PORT, () => {
    console.log(`[runner] listening on :${PORT}`);
  });
}

main();
