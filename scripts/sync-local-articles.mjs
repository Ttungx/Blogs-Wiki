/**
 * 把 import-local-articles.mjs 生成的 JSON payload 分片同步到 Worker。
 *
 * 正文不进 git、不上传 artifact；每个分片独立幂等，失败立即退出。
 *
 * 用法：
 *   node scripts/import-local-articles.mjs --json --output .tmp-import-articles.json
 *   node scripts/sync-local-articles.mjs --input .tmp-import-articles.json \
 *     --endpoint https://blogs-wiki.example.workers.dev/api/content-sync
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function option(name, fallback) {
  const prefix = `--${name}=`;
  const index = process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (index === -1) return fallback;
  return process.argv[index].startsWith(prefix) ? process.argv[index].slice(prefix.length) : process.argv[index + 1];
}

const input = join(ROOT, option('input', '.tmp-import-articles.json'));
const endpoint = option('endpoint', process.env.CONTENT_SYNC_URL);
const token = option('token', process.env.CONTENT_SYNC_TOKEN);

if (!endpoint) throw new Error('missing --endpoint or CONTENT_SYNC_URL');
if (!token) throw new Error('missing --token or CONTENT_SYNC_TOKEN');
if (!statSync(input, { throwIfNoEntry: false })) throw new Error(`payload not found: ${input}`);

const payload = JSON.parse(readFileSync(input, 'utf8'));
if (!Array.isArray(payload.sources) || !Array.isArray(payload.articles)) {
  throw new Error('payload must contain sources and articles arrays');
}

function encodedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function makeChunks() {
  const chunks = [];
  let current = { sources: payload.sources, articles: [] };
  for (const article of payload.articles) {
    // 服务端单载荷文章上限 200（content-sync MAX_ITEMS），按数量分块
    if (current.articles.length >= 200) {
      chunks.push(current);
      current = { sources: [], articles: [] };
    }
    const candidate = { sources: current.sources, articles: [...current.articles, article] };
    if (current.articles.length > 0 && encodedBytes(candidate) > MAX_BODY_BYTES) {
      chunks.push(current);
      current = { sources: [], articles: [article] };
    } else {
      current = candidate;
    }
    if (encodedBytes(current) > MAX_BODY_BYTES) {
      throw new Error(`single article exceeds sync payload limit: ${article.id}`);
    }
  }
  if (current.articles.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

const chunks = makeChunks();
let created = 0;
let updated = 0;
for (const [index, chunk] of chunks.entries()) {
  const body = JSON.stringify(chunk);
  // 网络抖动重试（本地代理/免费实例偶发 ECONNRESET）；幂等 upsert 安全重放
  let response = null;
  let text = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        },
        body,
      });
      text = await response.text();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    break;
  }
  if (!response || !response.ok) {
    throw new Error(`content sync failed (chunk ${index + 1}/${chunks.length}, HTTP ${response ? response.status : 'network'}): ${text}`);
  }
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`content sync returned invalid JSON (chunk ${index + 1}/${chunks.length})`);
  }
  created += result.articles?.created ?? 0;
  updated += result.articles?.updated ?? 0;
  console.log(`Synced chunk ${index + 1}/${chunks.length}: ${result.articles?.received ?? 0} articles`);
}

console.log(`Content sync complete: ${payload.articles.length} articles, created ${created}, updated ${updated}`);
