/**
 * `npm run block:source` —— 把"移除一个博客源"固化成一等可复用操作。
 *
 * 职责（且仅此）：
 *   1) 收集该源的全部文章 URL（三源并集，只读）：`.corpus-archive/{批次}/<id>`、
 *      `src/content/articles/<id>`、`processed-urls.json`；canonicalize 归一 + 去重 + 排序。
 *   2) 安全阀：新拉黑域与任何**现存源**声明的域名（domain / extra_domains，含子域/父域）
 *      相交即拒绝 apply —— 堵死"拉黑 kimi.com 误杀活跃 moonshot"这类改名遗迹场景。
 *   3) 写 `src/data/blocked-sources.json`（门禁登记表）+ `src/data/blocked-urls.json`（URL 账本）。
 *   4) 可选删实时目录 `src/content/articles/<id>/`（删前先复制到 gitignored `logs/blocked-backup/`）。
 *      **绝不触碰 `.corpus-archive` 下任何文件（训练语料，只读）与远程 D1。**
 *   5) `--verify`：只读自检两份文件的一致性与零冲突。
 *
 * 不做：git 操作、交互、D1 迁移。零网络、零密钥。
 *
 * 用法（源已从 sources.json 移除时进入"重建模式"，需显式 --domain）：
 *   npm run block:source -- --source simon-willison --domain simonwillison.net \
 *     --name "Simon Willison's Weblog" --blocked-at 2026-08-28 --reason "..."   # 预演
 *   ... --apply                                                                  # 落盘
 *   npm run block:source -- --verify                                             # 自检
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeUrl, hostInDomain } from './urls';
import { loadSourcesUnchecked } from './config';
import { frontmatterValue, loadProcessedState } from './persist';
import { findBlockedConflicts, loadBlockedSources, type BlockedSource } from './blocked-sources';
import type { SourceConfig } from './types';

const BLOCKED_SOURCES_REL = path.join('src', 'data', 'blocked-sources.json');
const BLOCKED_URLS_REL = path.join('src', 'data', 'blocked-urls.json');
const ARTICLES_REL = path.join('src', 'content', 'articles');
const ARCHIVE_REL = '.corpus-archive';
const BACKUP_REL = path.join('logs', 'blocked-backup');
const NEVER_BLOCK = ['kimi', 'keli-wen', 'glm']; // 改名遗迹（migration 0006/0008），非移除源

interface Options {
  sourceId?: string;
  domain?: string;
  name?: string;
  reason?: string;
  blockedAt: string;
  apply: boolean;
  keepArticles: boolean;
  purgeProcessed: boolean;
  force: boolean;
  verify: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    blockedAt: new Date().toISOString().slice(0, 10),
    apply: false,
    keepArticles: false,
    purgeProcessed: false,
    force: false,
    verify: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--source': options.sourceId = next(); break;
      case '--domain': options.domain = next(); break;
      case '--name': options.name = next(); break;
      case '--reason': options.reason = next(); break;
      case '--blocked-at': options.blockedAt = next(); break;
      case '--apply': options.apply = true; break;
      case '--keep-articles': options.keepArticles = true; break;
      case '--purge-processed': options.purgeProcessed = true; break;
      case '--force': options.force = true; break;
      case '--verify': options.verify = true; break;
      default: throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

async function readOriginalUrls(rootDir: string, baseRel: string, sourceId: string) {
  const base = path.join(rootDir, baseRel);
  const urls: string[] = [];
  let files = 0;
  let contamination = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(base, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { urls, files, contamination };
    throw error;
  }
  for (const rel of entries) {
    if (!rel.endsWith('.md')) continue;
    files += 1;
    const raw = await fs.readFile(path.join(base, rel), 'utf8');
    const blogId = frontmatterValue(raw, 'blog_id');
    if (blogId && blogId !== sourceId) { contamination += 1; continue; }
    const url = frontmatterValue(raw, 'original_url');
    if (url) urls.push(url);
  }
  return { urls, files, contamination };
}

async function archiveBatches(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(rootDir, ARCHIVE_REL), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function collectUrls(rootDir: string, sourceId: string) {
  const collected = new Set<string>();
  const breakdown: Record<string, number> = {};
  let contamination = 0;

  for (const batch of await archiveBatches(rootDir)) {
    const { urls, contamination: c } = await readOriginalUrls(rootDir, path.join(ARCHIVE_REL, batch, sourceId), sourceId);
    contamination += c;
    const before = collected.size;
    urls.forEach((u) => { const n = canonicalizeUrl(u); if (n) collected.add(n); });
    breakdown[`corpus-archive/${batch}`] = collected.size - before;
  }

  const live = await readOriginalUrls(rootDir, path.join(ARTICLES_REL, sourceId), sourceId);
  contamination += live.contamination;
  const beforeLive = collected.size;
  live.urls.forEach((u) => { const n = canonicalizeUrl(u); if (n) collected.add(n); });
  breakdown['src/content/articles'] = collected.size - beforeLive;

  const processed = (await loadProcessedState(rootDir)).blogs[sourceId] ?? [];
  const beforeProc = collected.size;
  processed.forEach((u) => { const n = canonicalizeUrl(u); if (n) collected.add(n); });
  breakdown['processed-urls'] = collected.size - beforeProc;

  return { urls: [...collected].sort(), breakdown, liveFileCount: live.files, contamination };
}

async function atomicWriteJson(rootDir: string, rel: string, data: unknown) {
  const file = path.join(rootDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

async function runVerify(rootDir: string): Promise<number> {
  const problems: string[] = [];
  const sources = await loadSourcesUnchecked(rootDir);
  const blocked = await loadBlockedSources(rootDir);
  let urlsLedger: { records?: Record<string, { count?: number; urls?: string[] }> } = { records: {} };
  try {
    urlsLedger = JSON.parse(await fs.readFile(path.join(rootDir, BLOCKED_URLS_REL), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`blocked-urls.json 读取失败：${error}`);
  }
  const records = urlsLedger.records ?? {};

  for (const entry of blocked) {
    if (NEVER_BLOCK.includes(entry.id)) problems.push(`拉黑了改名遗迹源：${entry.id}`);
    const rec = records[entry.id];
    if (!rec) { problems.push(`${entry.id}: 账本缺 records 条目`); continue; }
    if (entry.url_count !== undefined && entry.url_count !== rec.urls?.length) {
      problems.push(`${entry.id}: url_count=${entry.url_count} ≠ 账本 ${rec.urls?.length}`);
    }
    if (rec.count !== undefined && rec.count !== rec.urls?.length) {
      problems.push(`${entry.id}: record.count=${rec.count} ≠ urls.length=${rec.urls?.length}`);
    }
    const urls = rec.urls ?? [];
    const sorted = [...urls].sort();
    if (JSON.stringify(urls) !== JSON.stringify(sorted)) problems.push(`${entry.id}: urls 未字典序排序`);
    if (new Set(urls).size !== urls.length) problems.push(`${entry.id}: urls 含重复`);
    const allowed = [entry.domain, ...(entry.extra_domains ?? [])];
    for (const u of urls) {
      if (!allowed.some((d) => hostInDomain(new URL(u).hostname, d))) {
        problems.push(`${entry.id}: URL host 不在拉黑域内 ${u}`);
        break;
      }
    }
  }

  const conflicts = findBlockedConflicts(sources, blocked);
  for (const c of conflicts) problems.push(`拉黑域与现存源冲突：${c.source.id} ← ${c.detail}`);

  if (problems.length) {
    console.error(`✗ blocked-sources verify 失败（${problems.length} 项）:`);
    problems.forEach((p) => console.error(`   - ${p}`));
    return 1;
  }
  console.log(`✓ blocked-sources verify 通过：${blocked.length} 条拉黑，URL 账本一致，与现存 ${sources.length} 源零冲突`);
  return 0;
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const options = parseArgs(process.argv.slice(2));

  if (options.verify) {
    process.exitCode = await runVerify(rootDir);
    return;
  }
  if (!options.sourceId) throw new Error('需要 --source <id>（或 --verify）');
  if (NEVER_BLOCK.includes(options.sourceId)) {
    throw new Error(`${options.sourceId} 是改名遗迹（见 migration 0006/0008），不是移除源，禁止拉黑`);
  }

  const sources = await loadSourcesUnchecked(rootDir);
  const existing = sources.find((s) => s.id === options.sourceId);
  const domain = options.domain ?? existing?.domain;
  if (!domain) {
    throw new Error(`源 ${options.sourceId} 不在 sources.json（已移除），需显式提供 --domain <host>`);
  }
  const extraDomains = existing?.extra_domains ?? [];
  const name = options.name ?? existing?.name ?? options.sourceId;

  const candidate: BlockedSource = {
    id: options.sourceId,
    name,
    domain,
    extra_domains: extraDomains.length ? extraDomains : undefined,
    blocked_at: options.blockedAt,
    reason: options.reason ?? '',
  };

  // 安全阀：与现存源（排除目标本身）的域名相交检查
  const others = sources.filter((s) => s.id !== options.sourceId);
  const conflicts = findBlockedConflicts(others, [candidate]);
  const activeConflicts = conflicts.filter((c) => (c.source as SourceConfig).update_mode === 'active');
  for (const c of conflicts) {
    const level = activeConflicts.includes(c) ? '✗ 致命' : '⚠ 警告';
    console.log(`${level}：拉黑域 ${domain} 与现存源 ${c.source.id}（${c.source.domain}）相交 —— ${c.detail}`);
  }
  // active 源相交 = kimi 场景，无条件拒绝（--force 也不放行）。
  if (activeConflicts.length) {
    throw new Error(
      `拒绝拉黑：目标域与活跃源 ${activeConflicts.map((c) => c.source.id).join('、')} 相交。` +
      `这通常是改名遗迹（如 kimi→moonshot）而非真移除；请核对后再决定。`,
    );
  }
  if (conflicts.length && options.apply && !options.force) {
    throw new Error('存在与 dry-run-only 源的域名相交；确认无误请加 --force');
  }

  // 收集 URL
  const { urls, breakdown, liveFileCount, contamination } = await collectUrls(rootDir, options.sourceId);
  const allowedHosts = [domain, ...extraDomains];
  const foreign = urls.filter((u) => !allowedHosts.some((d) => hostInDomain(new URL(u).hostname, d)));

  console.log(`\n=== block:source ${options.sourceId}（${domain}）${options.apply ? '[APPLY]' : '[预演]'}`);
  console.log(`name        : ${name}`);
  console.log(`blocked_at  : ${options.blockedAt}`);
  console.log(`reason      : ${candidate.reason || '（未提供 --reason）'}`);
  console.log(`URL 来源分解: ${JSON.stringify(breakdown)}`);
  console.log(`唯一 URL 数 : ${urls.length}`);
  if (contamination) console.log(`跳过 blog_id 不符文件: ${contamination}`);
  if (foreign.length) console.log(`⚠ 非本域 URL（将被拒绝写入）: ${foreign.length}，例如 ${foreign[0]}`);
  console.log(`实时目录文件: ${liveFileCount}（--apply 且未 --keep-articles 时删除，先备份到 ${BACKUP_REL}/）`);
  console.log(`归档目录    : 只读，绝不删除`);

  if (!options.apply) {
    console.log(`\n预演结束。核对无误后追加 --apply 落盘。`);
    return;
  }
  if (!candidate.reason.trim()) throw new Error('--apply 需要 --reason');

  // 写 blocked-sources.json
  const blockedFile = path.join(rootDir, BLOCKED_SOURCES_REL);
  let registry = { version: 1, updated_at: null as string | null, blocked: [] as BlockedSource[] };
  try {
    registry = JSON.parse(await fs.readFile(blockedFile, 'utf8'));
    if (!Array.isArray(registry.blocked)) registry.blocked = [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const cleanUrls = urls.filter((u) => !foreign.includes(u));
  const entry: BlockedSource = { ...candidate, url_count: cleanUrls.length,
    registry: 'docs/blog-source-registry.md#已移除源拉黑--tombstone' };
  registry.blocked = registry.blocked.filter((b) => b.id !== options.sourceId);
  registry.blocked.push(entry);
  registry.blocked.sort((a, b) => a.id.localeCompare(b.id));
  registry.updated_at = new Date().toISOString();
  await atomicWriteJson(rootDir, BLOCKED_SOURCES_REL, registry);

  // 写 blocked-urls.json（append-only：解除拉黑后仍保留）
  const urlsFile = path.join(rootDir, BLOCKED_URLS_REL);
  let ledger: { version: number; updated_at: string | null; records: Record<string, unknown> } =
    { version: 1, updated_at: null, records: {} };
  try {
    ledger = JSON.parse(await fs.readFile(urlsFile, 'utf8'));
    if (!ledger.records) ledger.records = {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  ledger.records[options.sourceId] = {
    domain,
    extra_domains: extraDomains.length ? extraDomains : undefined,
    blocked_at: options.blockedAt,
    collected_from: [`corpus-archive`, ARTICLES_REL, 'processed-urls'],
    count: cleanUrls.length,
    urls: cleanUrls,
  };
  ledger.updated_at = new Date().toISOString();
  await atomicWriteJson(rootDir, BLOCKED_URLS_REL, ledger);

  // 删实时目录（先备份）；绝不触碰归档
  if (!options.keepArticles && liveFileCount > 0) {
    const liveDir = path.join(rootDir, ARTICLES_REL, options.sourceId);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(rootDir, BACKUP_REL, `${options.sourceId}-${stamp}`);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.cp(liveDir, backupDir, { recursive: true });
    await fs.rm(liveDir, { recursive: true, force: true });
    console.log(`✓ 已删实时目录并备份 ${liveFileCount} 文件 → ${path.relative(rootDir, backupDir)}`);
  } else if (liveFileCount === 0) {
    console.log(`实时目录无该源文件（空操作）。`);
  }

  if (options.purgeProcessed) {
    const state = await loadProcessedState(rootDir);
    if (state.blogs[options.sourceId]) {
      delete state.blogs[options.sourceId];
      const { saveProcessedState } = await import('./persist');
      await saveProcessedState(rootDir, state);
      console.log(`✓ 已从 processed-urls.json 清除该源 key（--purge-processed）`);
    }
  }

  console.log(
    `\n✓ 已写入 blocked-sources.json + blocked-urls.json。\n` +
    `剩余人工清单（本工具不代做）：\n` +
    `  - src/content/blogs/${options.sourceId}.md 删除（若是 demo 展示条目可保留）→ npx tsx scripts/generate-blogs-static.ts\n` +
    `  - 确认 src/data/sources.json 已无该条目\n` +
    `  - scripts/update/backfill.ts 的 WAVES 与 backfill-policy.ts 若有该 id 一并清理\n` +
    `  - docs/blog-source-registry.md 更新\n` +
    `  - npm run test:update && npm run block:source -- --verify`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
