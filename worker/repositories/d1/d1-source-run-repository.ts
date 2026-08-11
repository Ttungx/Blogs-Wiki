import type { D1Database } from '@cloudflare/workers-types';
import type {
  CreateSourceRunInput,
  SourceRunRecord,
  SourceRunStatus,
  SourceRunTrigger,
  UpdateSourceRunInput,
} from '../../domain/types';
import type { SourceRunRepository } from '../source-run-repository';

interface SourceRunRow {
  id: number;
  source_id: string;
  started_at: string;
  finished_at: string | null;
  status: SourceRunStatus;
  discovered: number;
  pending: number;
  processed: number;
  failed: number;
  errors: string | null;
  trigger: SourceRunTrigger | null;
}

export class D1SourceRunRepository implements SourceRunRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateSourceRunInput): Promise<SourceRunRecord> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const result = await this.db
      .prepare(`
        INSERT INTO source_runs (source_id, started_at, trigger)
        VALUES (?, ?, ?)
      `)
      .bind(input.sourceId, startedAt, input.trigger ?? null)
      .run();
    const id = result.meta.last_row_id;
    if (typeof id !== 'number') throw new Error('D1 did not return source run id');
    const run = await this.getById(id);
    if (!run) throw new Error(`source run was not persisted: ${id}`);
    return run;
  }

  async getById(id: number): Promise<SourceRunRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM source_runs WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SourceRunRow>();
    return row ? rowToRecord(row) : null;
  }

  async update(id: number, input: UpdateSourceRunInput): Promise<SourceRunRecord> {
    const result = await this.db
      .prepare(`
        UPDATE source_runs
        SET status = COALESCE(?, status),
            finished_at = COALESCE(?, finished_at),
            discovered = COALESCE(?, discovered),
            pending = COALESCE(?, pending),
            processed = COALESCE(?, processed),
            failed = COALESCE(?, failed),
            errors = COALESCE(?, errors)
        WHERE id = ?
      `)
      .bind(
        input.status ?? null,
        input.finishedAt ?? null,
        input.discovered ?? null,
        input.pending ?? null,
        input.processed ?? null,
        input.failed ?? null,
        input.errors ?? null,
        id,
      )
      .run();
    if (result.meta.changes === 0) throw new Error(`source run not found: ${id}`);
    const run = await this.getById(id);
    if (!run) throw new Error(`source run disappeared after update: ${id}`);
    return run;
  }
}

function rowToRecord(row: SourceRunRow): SourceRunRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    startedAt: row.started_at,
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    status: row.status,
    discovered: row.discovered,
    pending: row.pending,
    processed: row.processed,
    failed: row.failed,
    ...(row.errors ? { errors: row.errors } : {}),
    ...(row.trigger ? { trigger: row.trigger } : {}),
  };
}
