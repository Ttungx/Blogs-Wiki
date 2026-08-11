/**
 * FileSourceStateRepository 测试。
 *
 * 覆盖接口契约：loadAll（新版/旧版/缺失文件）、hasSeen、markProcessed（幂等/落盘）、
 * listProcessed（副本隔离）、reconcile（回填计数/不写盘/空输入）。
 *
 * 每个测试使用独立临时目录，finally 中清理，互不干扰。
 */

import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FileSourceStateRepository } from '../repositories/file/file-source-state-repository.ts';

/** processed-urls.json 在仓库根下的相对路径（对齐 paths.ts 的 DATA_DIR/PROCESSED_FILE）。 */
function stateFilePath(rootDir: string): string {
  return path.join(rootDir, 'src', 'data', 'processed-urls.json');
}

/** 预置 processed-urls.json 内容。 */
async function presetState(rootDir: string, content: unknown): Promise<void> {
  const file = stateFilePath(rootDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(content), 'utf8');
}

test('loadAll: 文件不存在返回空状态', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    const state = await repo.loadAll();
    assert.deepEqual(state, { version: 1, updatedAt: null, blogs: {} });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('loadAll: 新版格式 {version, updated_at, blogs} 正确解析', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    await presetState(rootDir, {
      version: 1,
      updated_at: '2026-08-08T15:13:53.169Z',
      blogs: { openai: ['https://openai.com/index/gpt-4-1/'] },
    });
    const repo = new FileSourceStateRepository({ rootDir });
    const state = await repo.loadAll();
    assert.equal(state.version, 1);
    assert.equal(state.updatedAt, '2026-08-08T15:13:53.169Z');
    assert.deepEqual(state.blogs, { openai: ['https://openai.com/index/gpt-4-1/'] });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('loadAll: 旧版扁平 {blogId: [urls]} 兼容', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    await presetState(rootDir, { 'legacy-blog': ['https://example.com/legacy/'] });
    const repo = new FileSourceStateRepository({ rootDir });
    const state = await repo.loadAll();
    // 旧版无 version/updated_at，落到默认值
    assert.equal(state.version, 1);
    assert.equal(state.updatedAt, null);
    // 扁平键原样进 blogs
    assert.equal(state.blogs['legacy-blog']?.includes('https://example.com/legacy/'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('hasSeen: 未记录返回 false', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    const seen = await repo.hasSeen('smoke-blog', 'https://example.com/x/');
    assert.equal(seen, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('markProcessed: 首次写入，hasSeen 变 true，文件落盘', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    await repo.markProcessed('smoke-blog', 'https://example.com/x/');
    const seen = await repo.hasSeen('smoke-blog', 'https://example.com/x/');
    assert.equal(seen, true);

    // 文件确实落盘且内容正确
    const raw = await readFile(stateFilePath(rootDir), 'utf8');
    const state = JSON.parse(raw);
    assert.ok(state.blogs['smoke-blog'].includes('https://example.com/x/'));
    assert.equal(state.version, 1);
    assert.equal(Number.isNaN(new Date(state.updated_at).getTime()), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('markProcessed: 重复标记幂等，数组不增长', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    await repo.markProcessed('smoke-blog', 'https://example.com/x/');
    await repo.markProcessed('smoke-blog', 'https://example.com/x/');
    const state = await repo.loadAll();
    assert.equal(state.blogs['smoke-blog'].length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('markProcessed: 不同 source 隔离', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    await repo.markProcessed('a', 'url-a');
    await repo.markProcessed('b', 'url-b');
    const state = await repo.loadAll();
    assert.equal(state.blogs.a.length, 1);
    assert.equal(state.blogs.b.length, 1);
    assert.equal(state.blogs.a[0], 'url-a');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listProcessed: 返回副本（修改不影响内部）', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    await repo.markProcessed('a', 'url-1');
    await repo.markProcessed('a', 'url-2');
    const list = await repo.listProcessed('a');
    assert.deepEqual(list, ['url-1', 'url-2']);
    list.push('url-3'); // 修改副本
    const again = await repo.listProcessed('a');
    assert.deepEqual(again, ['url-1', 'url-2']); // 内部不受影响
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('listProcessed: 未知 source 返回空数组', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    const list = await repo.listProcessed('unknown');
    assert.deepEqual(list, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('reconcile: 回填未记录条目，返回新增数', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    await presetState(rootDir, { blogs: { a: ['existing'] } });
    const repo = new FileSourceStateRepository({ rootDir });
    const added = await repo.reconcile([
      { sourceId: 'a', url: 'existing' }, // 已存在，不增
      { sourceId: 'a', url: 'new-a-1' }, // 新增
      { sourceId: 'b', url: 'new-b-1' }, // 新增
    ]);
    assert.equal(added, 2);
    const state = await repo.loadAll();
    assert.equal(state.blogs.a.includes('existing'), true);
    assert.equal(state.blogs.a.includes('new-a-1'), true);
    assert.equal(state.blogs.b.includes('new-b-1'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('reconcile: 全部已存在时返回 0，不写盘', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    await repo.markProcessed('a', 'url');
    const mtimeBefore = (await stat(stateFilePath(rootDir))).mtimeMs;
    const added = await repo.reconcile([{ sourceId: 'a', url: 'url' }]);
    assert.equal(added, 0);
    // 无新增不落盘：文件 mtime 不变
    const mtimeAfter = (await stat(stateFilePath(rootDir))).mtimeMs;
    assert.equal(mtimeAfter, mtimeBefore);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('reconcile: 空 entries 返回 0', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    const added = await repo.reconcile([]);
    assert.equal(added, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('reconcile: 空仓库接收新条目正常工作', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'bw-worker-state-'));
  try {
    const repo = new FileSourceStateRepository({ rootDir });
    const added = await repo.reconcile([{ sourceId: 'fresh', url: 'https://fresh.com/1' }]);
    assert.equal(added, 1);
    const seen = await repo.hasSeen('fresh', 'https://fresh.com/1');
    assert.equal(seen, true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
