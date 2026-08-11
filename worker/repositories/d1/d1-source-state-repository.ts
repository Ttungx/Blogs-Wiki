/**
 * D1SourceStateRepository —— D1 后端的 SourceStateRepository 实现。
 *
 * 用 source_items 表的 status='published' 映射"已处理"语义。
 * 当前接口只表达"处理过没有"（Phase 1 契约），完整状态机语义
 * （discovered/fetching/.../failed）留到 Phase 7 Workflow 运行时。
 */

import type { ProcessedStateSnapshot } from '../../domain/types';
import type { D1Database } from '@cloudflare/workers-types';
import type { SourceStateRepository } from '../source-state-repository';

export class D1SourceStateRepository implements SourceStateRepository {
  constructor(private readonly db: D1Database) {}

  async hasSeen(sourceId: string, url: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS hit FROM source_items WHERE source_id = ? AND original_url = ? AND status = ? LIMIT 1')
      .bind(sourceId, url, 'published')
      .first();
    return row !== null;
  }

  async markProcessed(sourceId: string, url: string): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO source_items (source_id, original_url, status)
        VALUES (?, ?, 'published')
        ON CONFLICT(source_id, original_url) DO UPDATE SET
          status = 'published',
          updated_at = datetime('now')
      `)
      .bind(sourceId, url)
      .run();
  }

  async listProcessed(sourceId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare('SELECT original_url FROM source_items WHERE source_id = ? AND status = ?')
      .bind(sourceId, 'published')
      .all<{ original_url: string }>();
    return results.map((row) => row.original_url);
  }

  async loadAll(): Promise<ProcessedStateSnapshot> {
    const { results } = await this.db
      .prepare("SELECT source_id, original_url FROM source_items WHERE status = 'published'")
      .all<{ source_id: string; original_url: string }>();

    const blogs: Record<string, string[]> = {};
    for (const row of results) {
      (blogs[row.source_id] ??= []).push(row.original_url);
    }

    const meta = await this.db
      .prepare('SELECT MAX(updated_at) AS latest FROM source_items')
      .first<{ latest: string | null }>();

    return {
      version: 1,
      updatedAt: meta?.latest ?? null,
      blogs,
    };
  }

  async reconcile(entries: Iterable<{ sourceId: string; url: string }>): Promise<number> {
    let added = 0;
    for (const { sourceId, url } of entries) {
      const result = await this.db
        .prepare(`
          INSERT INTO source_items (source_id, original_url, status)
          VALUES (?, ?, 'published')
          ON CONFLICT(source_id, original_url) DO NOTHING
        `)
        .bind(sourceId, url)
        .run();
      added += result.meta.changes;
    }
    return added;
  }
}
