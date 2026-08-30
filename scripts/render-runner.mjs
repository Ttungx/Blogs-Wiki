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
 * - 无状态轮转选源：按时间片（RUN_INTERVAL_MINUTES，默认 15 分钟）取模决定
 *   本轮处理的源。容器重启/休眠唤醒不影响正确性；25 源 × 15 分钟 ≈ 每源
 *   每 6 小时更新一次（Worker cron `7,22,37,52 * * * *` 与切片同频）。
 *   ping 同时让免费实例保持常驻（约 720h/月 < 750h 免费额度），消除冷启动。
 * - 触发即返回：spawn 子进程异步执行整条链（update → translate:batch 补翻
 *   → import → sync），HTTP 立即 202，绕开平台路由超时；进度看日志文件
 *   与 Render 日志流。
 * - 幂等兜底：漏跑/重复跑无害——content-sync 按 (source_id, original_url)
 *   去重；管线 CONTENT_SYNC_CHECK_URL 预检避免重复抓取+翻译（含 90 天内
 *   门禁拒绝负缓存，经 /api/content-sync/items 上报）。
 * - 忙碌保护：同一时刻最多一条链在跑；忙时返回 202 busy，下轮自动补位。
 *
 * 环境变量：
 *   PORT                  监听端口（Render 注入，默认 8080）
 *   RUNNER_KEY            /run 鉴权 key（必须设置；与 CF Worker 的
 *                         CONTENT_SYNC_TOKEN 同值）
 *   RUN_INTERVAL_MINUTES  无状态轮转时间片长度（默认 15）
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
const INTERVAL_MS = Number(process.env.RUN_INTERVAL_MINUTES || 15) * 60_000;
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

function buildChainScript(sourceId, limitArg) {
  // 单条链：发现/去重/抓取/翻译 → 补翻缺失译文 → 生成本地 payload → 分片推送 D1。
  // translate:batch 只补本地 corpus 缺 zh 版本的原文（断点续传），单篇失败
  // 只记错误台账不退出，不会拖垮链条；随后 import+sync 把新译文一并推上 D1。
  return [
    'set -e',
    `npm run update -- --source ${JSON.stringify(sourceId)} --report logs/report${limitArg}`,
    `npm run translate:batch -- --source ${JSON.stringify(sourceId)} --report logs/report`,
    'node scripts/import-local-articles.mjs --json --output logs/.tmp-import-articles.json',
    'node scripts/sync-local-articles.mjs --input logs/.tmp-import-articles.json',
    'echo CHAIN_OK',
  ].join('\n');
}

function startUpdateChain(sourceId, limitArg) {
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `${stamp}_${sourceId}.log`);
  const startedAt = new Date().toISOString();

  busy = true;
  lastRun = {
    sourceId,
    startedAt,
    finishedAt: null,
    status: 'running',
    logFile: path.relative(ROOT, logFile),
  };

  let fd;
  try {
    fd = openSync(logFile, 'a');
    const child = spawn(
      SHELL,
      ['-c', buildChainScript(sourceId, limitArg)],
      { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd], env: process.env },
    );
    child.on('close', (code) => {
      busy = false;
      lastRun.status = code === 0 ? 'ok' : `exit-${code}`;
      lastRun.finishedAt = new Date().toISOString();
      console.log(`[runner] ${sourceId} chain ${lastRun.status} (${lastRun.logFile})`);
      // 链路失败时把日志尾部打到 stdout（Render 日志流可见），否则错误只在容器文件里。
      if (code !== 0) {
        try {
          const tail = readFileSync(lastRun.logFile, 'utf8').split('\n').slice(-40).join('\n');
          console.error(`[runner] === chain failure log tail (${sourceId}) ===\n${tail}`);
        } catch (e) {
          console.error(`[runner] failed to read chain log: ${e.message}`);
        }
      }
      pruneLogs();
    });
    child.on('error', (err) => {
      busy = false;
      lastRun.status = 'spawn-error';
      console.error(`[runner] spawn failed: ${err.message}`);
    });
    child.unref();
  } catch (error) {
    busy = false;
    lastRun.status = 'start-error';
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  return lastRun;
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
      respond(res, 202, { status: 'busy', lastRun });
      return;
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
