import type { D1Database } from '@cloudflare/workers-types';
import { assertSourceItemTransition } from '../../domain/source-state';
import type {
  DiscoverSourceItemInput,
  SourceItemRecord,
  SourceItemStatus,
} from '../../domain/types';
import type { SourceItemRepository } from '../source-item-repository';

interface SourceItemRow {
  id: number;
  source_id: string;
  original_url: string;
  title: string | null;
  published_at: string | null;
  status: SourceItemStatus;
  attempt_count: number;
  last_error: string | null;
  article_id: string | null;
  discovered_at: string;
  updated_at: string;
}

export class D1SourceItemRepository implements SourceItemRepository {
  constructor(private readonly db: D1Database) {}

  async discover(input: DiscoverSourceItemInput): Promise<SourceItemRecord> {
    await this.db
      .prepare(`
        INSERT INTO source_items (source_id, original_url, title, published_at, status)
        VALUES (?, ?, ?, ?, 'discovered')
        ON CONFLICT(source_id, original_url) DO UPDATE SET
          title = COALESCE(excluded.title, source_items.title),
          published_at = COALESCE(excluded.published_at, source_items.published_at),
          status = CASE
            WHEN source_items.status = 'failed' THEN 'discovered'
            ELSE source_items.status
          END,
          last_error = CASE
            WHEN source_items.status = 'failed' THEN NULL
            ELSE source_items.last_error
          END,
          updated_at = datetime('now')
      `)
      .bind(
        input.sourceId,
        input.originalUrl,
        input.title ?? null,
        input.publishedAt ?? null,
      )
      .run();

    const row = await this.db
      .prepare('SELECT * FROM source_items WHERE source_id = ? AND original_url = ? LIMIT 1')
      .bind(input.sourceId, input.originalUrl)
      .first<SourceItemRow>();
    if (!row) throw new Error(`source item was not persisted: ${input.sourceId} ${input.originalUrl}`);
    return rowToRecord(row);
  }

  async getById(id: number): Promise<SourceItemRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM source_items WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SourceItemRow>();
    return row ? rowToRecord(row) : null;
  }

  async listBySource(sourceId: string, statuses?: SourceItemStatus[]): Promise<SourceItemRecord[]> {
    if (!statuses?.length) {
      const { results } = await this.db
        .prepare('SELECT * FROM source_items WHERE source_id = ? ORDER BY id')
        .bind(sourceId)
        .all<SourceItemRow>();
      return results.map(rowToRecord);
    }

    const placeholders = statuses.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(
        `SELECT * FROM source_items
         WHERE source_id = ? AND status IN (${placeholders})
         ORDER BY id`,
      )
      .bind(sourceId, ...statuses)
      .all<SourceItemRow>();
    return results.map(rowToRecord);
  }

  async transition(
    id: number,
    status: SourceItemStatus,
    options: { articleId?: string } = {},
  ): Promise<SourceItemRecord> {
    const current = await this.getById(id);
    if (!current) throw new Error(`source item not found: ${id}`);
    assertSourceItemTransition(current.status, status);

    await this.db
      .prepare(`
        UPDATE source_items
        SET status = ?,
            article_id = COALESCE(?, article_id),
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(status, options.articleId ?? null, id)
      .run();

    const updated = await this.getById(id);
    if (!updated) throw new Error(`source item disappeared after transition: ${id}`);
    return updated;
  }

  async recordFailure(id: number, error: string): Promise<SourceItemRecord> {
    const current = await this.getById(id);
    if (!current) throw new Error(`source item not found: ${id}`);
    if (current.status === 'published' || current.status === 'skipped') {
      throw new Error(`cannot fail terminal source item: ${current.status}`);
    }

    await this.db
      .prepare(`
        UPDATE source_items
        SET status = 'failed',
            attempt_count = attempt_count + 1,
            last_error = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(error, id)
      .run();

    const updated = await this.getById(id);
    if (!updated) throw new Error(`source item disappeared after failure: ${id}`);
    return updated;
  }
}

function rowToRecord(row: SourceItemRow): SourceItemRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    originalUrl: row.original_url,
    ...(row.title ? { title: row.title } : {}),
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    status: row.status,
    attemptCount: row.attempt_count,
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.article_id ? { articleId: row.article_id } : {}),
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  };
}
