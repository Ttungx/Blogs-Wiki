/**
 * FileSourceStateRepository —— 文件后端的 SourceStateRepository 实现。
 *
 * 行为与 `scripts/update/persist.ts` 的状态函数 + `scripts/update/index.ts:106-135`
 * 的 reconcileProcessed 语义对齐：
 *
 * - loadAll：读 `<rootDir>/src/data/processed-urls.json`，兼容新版
 *   `{version, updated_at, blogs}` 与旧版扁平 `{blogId: [urls]}`（复刻 persist.ts:19-43）
 * - markProcessed：内存追加 + 落盘（2 空格 JSON + 尾换行，复刻 persist.ts:45-59）
 * - reconcile：接收已知 (sourceId, url) 条目，回填未记录的，返回新增数
 *   （语义复刻 index.ts:106-135；扫文件由调用方做，接口纯函数化）
 *
 * 文件不存在时视为空状态（ENOENT 静默返回 emptyProcessedState）。
 *
 * 与 scripts/update/persist.ts 并存，读写同一文件。Phase 5 接线后两者合并；
 * Phase 6 D1 source_items 表落地时，本实现切换为 D1SourceStateRepository。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProcessedStateSnapshot } from '../../domain/types';
import type { SourceStateRepository } from '../source-state-repository';
import { DATA_DIR, JSON_INDENT, PROCESSED_FILE } from './paths';

export interface FileSourceStateRepositoryOptions {
  /** 仓库根目录。 */
  rootDir: string;
}

function emptyState(): ProcessedStateSnapshot {
  return { version: 1, updatedAt: null, blogs: {} };
}

export class FileSourceStateRepository implements SourceStateRepository {
  private readonly stateFile: string;

  constructor(options: FileSourceStateRepositoryOptions) {
    this.stateFile = path.join(options.rootDir, ...DATA_DIR, PROCESSED_FILE);
  }

  async loadAll(): Promise<ProcessedStateSnapshot> {
    let raw: string;
    try {
      raw = await fs.readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return emptyState();
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return emptyState();

    // 兼容新版 {version, updated_at, blogs} 与旧版扁平 {blogId: [urls]}
    // 复刻 persist.ts:27-37
    const blogs =
      (parsed.blogs as Record<string, string[]> | undefined) ??
      (() => {
        const { version: _version, updated_at: _updatedAt, ...rest } = parsed;
        void _version;
        void _updatedAt;
        return rest as Record<string, string[]>;
      })();

    return {
      version: typeof parsed.version === 'number' ? (parsed.version as number) : 1,
      updatedAt: typeof parsed.updated_at === 'string' ? (parsed.updated_at as string) : null,
      blogs,
    };
  }

  async hasSeen(sourceId: string, url: string): Promise<boolean> {
    const state = await this.loadAll();
    return (state.blogs[sourceId] ?? []).includes(url);
  }

  async markProcessed(sourceId: string, url: string): Promise<void> {
    const state = await this.loadAll();
    const existing = state.blogs[sourceId] ?? [];
    if (!existing.includes(url)) existing.push(url);
    state.blogs[sourceId] = existing;
    state.updatedAt = new Date().toISOString();
    await this.persist(state);
  }

  async listProcessed(sourceId: string): Promise<string[]> {
    const state = await this.loadAll();
    return [...(state.blogs[sourceId] ?? [])];
  }

  async reconcile(entries: Iterable<{ sourceId: string; url: string }>): Promise<number> {
    const state = await this.loadAll();
    let added = 0;
    for (const { sourceId, url } of entries) {
      const existing = state.blogs[sourceId] ?? [];
      if (!existing.includes(url)) {
        existing.push(url);
        state.blogs[sourceId] = existing;
        added += 1;
      }
    }
    if (added > 0) {
      state.updatedAt = new Date().toISOString();
      await this.persist(state);
    }
    return added;
  }

  private async persist(state: ProcessedStateSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    // 磁盘格式必须保持旧管线的 snake_case；领域模型只在内存中用 camelCase。
    const diskState = {
      version: state.version,
      updated_at: state.updatedAt,
      blogs: state.blogs,
    };
    await fs.writeFile(this.stateFile, `${JSON.stringify(diskState, null, JSON_INDENT)}\n`, 'utf8');
  }
}
