/**
 * 永久拉黑（tombstone）门禁单元测试。
 *
 * 覆盖：同 id / 同域名（含 www、大小写）/ 子域 / 父域 / extra_domains 相交均拒绝加载；
 * 无关源不误伤；文件缺失向后兼容；文件损坏 fail-closed；多冲突一次性全报；
 * loadSourcesUnchecked 绕过门禁（供 block-source 工具与 smoke 使用）。
 */

import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadSources, loadSourcesUnchecked } from './config';
import { findBlockedConflicts, type BlockedSource } from './blocked-sources';
import type { SourceConfig } from './types';

function makeSource(id: string, domain: string, extra?: Partial<SourceConfig>): SourceConfig {
  return {
    id, name: id, type: 'company', domain,
    homepage_url: `https://${domain}/`, blog_url: `https://${domain}/blog/`,
    update_mode: 'active', ...extra,
  } as SourceConfig;
}

const blocked: BlockedSource = {
  id: 'hugging-face', domain: 'huggingface.co',
  blocked_at: '2026-08-28', reason: '文章量过大',
};

async function project(sources: SourceConfig[], blockedEntries: BlockedSource[] | null): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'blocked-'));
  await mkdir(path.join(root, 'src', 'data'), { recursive: true });
  await writeFile(path.join(root, 'src', 'data', 'sources.json'), JSON.stringify(sources), 'utf8');
  if (blockedEntries !== null) {
    await writeFile(
      path.join(root, 'src', 'data', 'blocked-sources.json'),
      JSON.stringify({ version: 1, updated_at: null, blocked: blockedEntries }),
      'utf8',
    );
  }
  return root;
}

const cleanup = (root: string) => rm(root, { recursive: true, force: true });

test('findBlockedConflicts：同 id 命中', () => {
  const c = findBlockedConflicts([makeSource('hugging-face', 'hf.co')], [blocked]);
  assert.equal(c[0]?.matched_by, 'id');
});

test('findBlockedConflicts：同 domain 命中（换 id）', () => {
  const c = findBlockedConflicts([makeSource('hf-blog', 'huggingface.co')], [blocked]);
  assert.equal(c[0]?.matched_by, 'domain');
});

test('findBlockedConflicts：子域与父域都算相交', () => {
  assert.ok(findBlockedConflicts([makeSource('x', 'blog.huggingface.co')], [blocked]).length);
  // 反向：拉黑子域、现存父域
  const childBlock: BlockedSource = { ...blocked, id: 'cf', domain: 'blog.cloudflare.com' };
  assert.ok(findBlockedConflicts([makeSource('y', 'cloudflare.com')], [childBlock]).length);
});

test('findBlockedConflicts：同级域不误伤（research.google vs deepmind.google/blog.google）', () => {
  const grBlock: BlockedSource = { id: 'google-research', domain: 'research.google', blocked_at: '', reason: '' };
  assert.equal(findBlockedConflicts([makeSource('dm', 'deepmind.google')], [grBlock]).length, 0);
  assert.equal(findBlockedConflicts([makeSource('gs', 'blog.google')], [grBlock]).length, 0);
});

test('findBlockedConflicts：命中 extra_domains', () => {
  const src = makeSource('karpathy', 'karpathy.bearblog.dev', { extra_domains: ['huggingface.co'] });
  const c = findBlockedConflicts([src], [blocked]);
  assert.equal(c[0]?.matched_by, 'extra_domains');
});

test('loadSources：同 id 回写 → 抛 Blocked source violation', async () => {
  const root = await project([makeSource('hugging-face', 'huggingface.co')], [blocked]);
  await assert.rejects(() => loadSources(root), /Blocked source violation/);
  await cleanup(root);
});

test('loadSources：同域 + www + 大小写变体 → 抛错', async () => {
  const root = await project([makeSource('other', 'WWW.HuggingFace.CO')], [blocked]);
  await assert.rejects(() => loadSources(root), /Blocked source violation/);
  await cleanup(root);
});

test('loadSources：无关活跃源 → 正常加载', async () => {
  const root = await project([makeSource('deepmind', 'deepmind.google')], [blocked]);
  const sources = await loadSources(root);
  assert.equal(sources.length, 1);
  await cleanup(root);
});

test('loadSources：blocked-sources.json 缺失 → 向后兼容', async () => {
  const root = await project([makeSource('hugging-face', 'huggingface.co')], null);
  const sources = await loadSources(root);
  assert.equal(sources.length, 1);
  await cleanup(root);
});

test('loadSources：blocked-sources.json 损坏 → fail-closed 抛错', async () => {
  const root = await project([makeSource('a', 'a.com')], [blocked]);
  await writeFile(path.join(root, 'src', 'data', 'blocked-sources.json'), '{ not json', 'utf8');
  await assert.rejects(() => loadSources(root), /不是合法 JSON/);
  await cleanup(root);
});

test('loadSources：多冲突一次性全报', async () => {
  const b2: BlockedSource = { id: 'simon-willison', domain: 'simonwillison.net', blocked_at: '', reason: '量大' };
  const root = await project(
    [makeSource('hugging-face', 'huggingface.co'), makeSource('simon-willison', 'simonwillison.net')],
    [blocked, b2],
  );
  await assert.rejects(
    () => loadSources(root),
    (err: Error) => /hugging-face/.test(err.message) && /simon-willison/.test(err.message),
  );
  await cleanup(root);
});

test('loadSourcesUnchecked：有冲突也不抛（工具依赖该能力）', async () => {
  const root = await project([makeSource('hugging-face', 'huggingface.co')], [blocked]);
  const sources = await loadSourcesUnchecked(root);
  assert.equal(sources.length, 1);
  await cleanup(root);
});
