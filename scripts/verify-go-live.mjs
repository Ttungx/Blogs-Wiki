#!/usr/bin/env node
/**
 * 完整上线只读验证脚本 —— 不改任何状态，逐项检查并输出 PASS/FAIL/WARN。
 *
 * 用法：
 *   node scripts/verify-go-live.mjs [--d1] [--site URL] [--runner URL]
 *
 * 检查项：
 *   站点首页 / /api/health/ 200
 *   /api/content-sync/check|items 未认证 401（路由在线且受保护）
 *   Render /healthz ok、/status JSON（源数、忙碌态、最近一次链）
 *   --d1: wrangler 查远程 D1 最近 24h 翻译入库数（自动 tick 的落地证据；
 *         0 篇为 WARN——可能是安静期，不阻断）
 *
 * 全部 FAIL 计数为 0 时退出码 0，否则 1。
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const SITE = argValue('--site', 'https://blogswiki.dpdns.org').replace(/\/+$/, '');
const RUNNER = argValue('--runner', 'https://blogs-wiki-updater.onrender.com').replace(/\/+$/, '');
const WITH_D1 = args.includes('--d1');

const results = [];
function record(level, name, detail = '') {
  results.push(level);
  console.log(`${level.padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectHttp(name, url, expected, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    record(res.status === expected ? 'PASS' : 'FAIL', name, `HTTP ${res.status}（期望 ${expected}）`);
    return res;
  } catch (error) {
    record('FAIL', name, error.message);
    return null;
  }
}

// ── 站点 ─────────────────────────────────────────────
await expectHttp('站点首页', `${SITE}/`, 200);
await expectHttp('站点 /api/health/', `${SITE}/api/health/`, 200);

const postJson = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
});
await expectHttp('/api/content-sync/check/ 未认证 401', `${SITE}/api/content-sync/check/`, 401, postJson('{"items":[]}'));
await expectHttp('/api/content-sync/items/ 未认证 401', `${SITE}/api/content-sync/items/`, 401, postJson('{"items":[]}'));

// ── Render runner ────────────────────────────────────
const health = await expectHttp('Render /healthz', `${RUNNER}/healthz`, 200);
if (health) {
  const body = (await health.text()).trim();
  record(body === 'ok' ? 'PASS' : 'FAIL', 'Render /healthz 响应体', body || '(空)');
}

const status = await expectHttp('Render /status', `${RUNNER}/status`, 200);
if (status) {
  try {
    const info = await status.json();
    record(Number.isInteger(info.activeSources) && info.activeSources > 0 ? 'PASS' : 'FAIL',
      'Runner active sources', `${info.activeSources} 源，interval=${info.intervalMinutes}min`);
    record(typeof info.busy === 'boolean' ? 'PASS' : 'FAIL', 'Runner busy 状态可读', `busy=${info.busy}`);
    console.log(`INFO lastRun: ${info.lastRun ? `${info.lastRun.sourceId} ${info.lastRun.status} @ ${info.lastRun.startedAt}` : 'null（本次唤醒后尚无链路；放行后应看到近期记录）'}`);
  } catch (error) {
    record('FAIL', 'Runner /status 解析', error.message);
  }
}

// ── D1 内容新鲜度（可选） ─────────────────────────────
if (WITH_D1) {
  const query = `SELECT (SELECT COUNT(*) FROM article_versions WHERE provenance='model' AND translated_at >= datetime('now','-1 day')) AS recent_24h, (SELECT MAX(translated_at) FROM article_versions WHERE provenance='model') AS latest`;
  const proc = spawnSync('npx', ['wrangler', 'd1', 'execute', 'blogs-wiki', '--remote', '--json', '--command', query],
    { encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000 });
  if (proc.status !== 0) {
    record('FAIL', 'D1 新鲜度查询', (proc.stderr || proc.stdout || '').slice(0, 300));
  } else {
    try {
      const parsed = JSON.parse(proc.stdout);
      const row = parsed[0]?.results?.[0] ?? {};
      const recent = Number(row.recent_24h ?? 0);
      record(recent > 0 ? 'PASS' : 'WARN', '最近 24h 翻译入库',
        `${recent} 篇；最新 translated_at=${row.latest ?? '无'}${recent === 0 ? '（可能为安静期；放行后持续为 0 则自动 tick 未生效）' : ''}`);
    } catch (error) {
      record('FAIL', 'D1 新鲜度解析', error.message);
    }
  }
}

// ── 汇总 ─────────────────────────────────────────────
const failed = results.filter((level) => level === 'FAIL').length;
const warned = results.filter((level) => level === 'WARN').length;
console.log(`\n汇总：${results.length} 项 — PASS ${results.length - failed - warned} / WARN ${warned} / FAIL ${failed}`);
process.exit(failed > 0 ? 1 : 0);
