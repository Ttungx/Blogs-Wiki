/**
 * D1 写入预算（docs/d1-write-budget.md）链尾契约的脚本级测试。
 *
 * 用真实 import-local-articles.mjs + sync-local-articles.mjs 子进程 + 本地
 * stub HTTP 服务器验证（阶段 A/C 验收）：
 * - 新增 3 个版本文件（mtime ≥ --since；beta 的 en+zh 两版本并入同一篇）→
 *   payload.articles.length === 2，恰好 1 次 POST /api/content-sync；
 * - 无新文件 → import 产出 0 篇 payload，sync 直接跳过 → **零 POST**；
 * - 251 篇 payload 且无 --full → sync 拒绝（闸门）；
 * - --full 放行。
 */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMPORT = path.join(ROOT, 'scripts', 'import-local-articles.mjs');
const SYNC = path.join(ROOT, 'scripts', 'sync-local-articles.mjs');

interface Posted {
  count: number;
  sizes: number[];
}

/** 起一个计数 POST 的 stub 服务器；返回 close()。 */
async function stubSyncServer(): Promise<{ origin: string; posted: Posted; close: () => Promise<void> }> {
  const posted: Posted = { count: 0, sizes: [] };
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/content-sync') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        posted.count += 1;
        posted.sizes.push(Buffer.concat(chunks).length);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, articles: { received: 0, created: 0, updated: 0, skipped: 0 } }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, posted, close: () => new Promise<void>((r) => server.close(() => r())) };
}

interface Posted {
  count: number;
  sizes: number[];
}

/** 文章由若干 <blogId>/<lang>/<slug>.md 组成。slug 相同 = 同一篇文章的不同语言版本。 */
function articleFrontmatter(blogId: string, language: string, slug: string): string {
  const url = `https://${blogId === 'alpha' ? 'a' : 'b'}.example/${slug}/`;
  return `---
blog_id: ${JSON.stringify(blogId)}
original_url: ${JSON.stringify(url)}
language: ${JSON.stringify(language)}
is_original: ${language === 'en' ? 'true' : 'false'}
title: ${JSON.stringify(slug)}
published_at: "2026-08-01T00:00:00.000Z"
categories: []
source_domain: ${JSON.stringify(blogId === 'alpha' ? 'a.example' : 'b.example')}
original_language: "en"
provenance: ${language === 'en' ? 'original' : 'model'}
version_at: "2026-08-01T00:00:00.000Z"
---
正文 ${slug}（${language}）
`;
}

/** 在 corpus 根下写一篇（或一个语言版本）。 */
async function writeArticle(
  base: string,
  blogId: string,
  slug: string,
  languages: string[],
): Promise<void> {
  for (const language of languages) {
    const sub = path.join(base, 'src', 'content', 'articles', blogId, language);
    await mkdir(sub, { recursive: true });
    await writeFile(
      path.join(sub, `${slug}.md`),
      articleFrontmatter(blogId, language, slug),
      'utf8',
    );
  }
}

/** 把某版本文件 mtime 拨到过去（早于 since 则被过滤）。 */
async function ageFile(filePath: string, days: number): Promise<void> {
  const past = Date.now() / 1000 - days * 86400;
  await utimes(filePath, past, past);
}

function runNode(script: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

test('3 个新版本文件 → import 出 2 篇文章 payload、恰好 1 次 POST', async () => {
  const { origin, posted, close } = await stubSyncServer();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'd1-budget-sync-'));
  try {
    const since = new Date(Date.now() - 10_000).toISOString();
    // alpha: en 1 篇；beta: en + zh-cn（同 slug → 合并成一篇文章）。
    await writeArticle(dir, 'alpha', 'p1', ['en']);
    await writeArticle(dir, 'beta', 'p1', ['en', 'zh-cn']);
    await writeFile(path.join(dir, 'a.md'), 'x'); // 无关文件不应影响 walk
    const out = path.join(dir, 'payload.json');

    const importRun = await runNode(IMPORT, [
      '--json',
      '--source',
      'alpha',
      '--source',
      'beta',
      '--root',
      dir,
      '--since',
      since,
      '--output',
      out,
    ]);
    assert.equal(importRun.code, 0, importRun.stderr);
    assert.match(importRun.stdout, /2 articles/);
    const payload = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(payload.articles.length, 2); // 两篇文章（beta 两版本合一）

    const syncRun = await runNode(SYNC, [
      '--input',
      out,
      '--endpoint',
      `${origin}/api/content-sync`,
      '--token',
      'test-secret',
    ]);
    assert.equal(syncRun.code, 0, syncRun.stderr);
    assert.equal(posted.count, 1);
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('无新文件（全部 mtime 早于 since）→ 0 篇 payload、零 POST', async () => {
  const { origin, posted, close } = await stubSyncServer();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'd1-budget-sync-'));
  try {
    const since = new Date(Date.now() + 5_000).toISOString();
    await writeArticle(dir, 'alpha', 'p1', ['en']);
    const file = path.join(dir, 'src', 'content', 'articles', 'alpha', 'en', 'p1.md');
    await ageFile(file, 5);
    const out = path.join(dir, 'payload.json');

    const importRun = await runNode(IMPORT, [
      '--json',
      '--source',
      'alpha',
      '--root',
      dir,
      '--since',
      since,
      '--output',
      out,
    ]);
    assert.equal(importRun.code, 0, importRun.stderr);
    assert.match(importRun.stdout, /0 articles/);
    const payload = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(payload.articles.length, 0);

    const syncRun = await runNode(SYNC, [
      '--input',
      out,
      '--endpoint',
      `${origin}/api/content-sync`,
      '--token',
      'test-secret',
    ]);
    assert.equal(syncRun.code, 0, syncRun.stderr);
    assert.match(syncRun.stdout, /0 articles in payload/);
    assert.equal(posted.count, 0);
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('>200 篇 payload 默认拒绝，--full 放行', async () => {
  const { origin, posted, close } = await stubSyncServer();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'd1-budget-gate-'));
  try {
    const out = path.join(dir, 'big.json');
    const big = {
      sources: [{ id: 'alpha', name: 'Alpha', type: 'company', homepageUrl: 'https://a.example/', blogUrl: 'https://a.example/', domain: 'a.example' }],
      articles: Array.from({ length: 251 }, (_, i) => ({
        id: `alpha/a-${i}`,
        sourceId: 'alpha',
        originalUrl: `https://a.example/a-${i}/`,
        originalLanguage: 'en',
        publishedAt: '2026-08-01',
        sourceDomain: 'a.example',
        categories: [],
        versions: [
          {
            language: 'en',
            title: `A ${i}`,
            contentMarkdown: `body ${i}`,
            provenance: 'original',
          },
        ],
      })),
      sql: [],
    };
    await writeFile(out, JSON.stringify(big), 'utf8');

    const denied = await runNode(SYNC, [
      '--input',
      out,
      '--endpoint',
      `${origin}/api/content-sync`,
      '--token',
      'test-secret',
    ]);
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /默认拒绝超大 payload/);
    assert.equal(posted.count, 0);

    const allowed = await runNode(SYNC, [
      '--input',
      out,
      '--full',
      '--endpoint',
      `${origin}/api/content-sync`,
      '--token',
      'test-secret',
    ]);
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(posted.count, 2); // 251 篇按服务端 200 上限分两片（各为幂等独立 POST）
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('render-runner 链尾 import 使用 --since 而不是 ----since', async () => {
  const src = await readFile(path.join(ROOT, 'scripts', 'render-runner.mjs'), 'utf8');
  assert.match(src, /import-local-articles\.mjs --json \$\{sinceArg\}/);
  assert.doesNotMatch(src, /--json --\$\{sinceArg\}/);
});
