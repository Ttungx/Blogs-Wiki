/**
 * Wrangler 配置之外的测试 binding 类型。
 *
 * `cloudflare:test` 的 env 使用 Cloudflare.Env；vitest-pool-workers
 * 注入 TEST_MIGRATIONS 供 D1 测试应用迁移，因此在独立 worker tsconfig
 * 中显式补上这两个字段。
 */
declare module 'cloudflare:test' {
  type WorkersD1Database = import('@cloudflare/workers-types').D1Database;

  export interface D1Migration {
    name: string;
    queries: string[];
  }

  export const env: {
    DB: WorkersD1Database;
    TEST_MIGRATIONS: D1Migration[];
  };

  export function applyD1Migrations(
    db: WorkersD1Database,
    migrations: D1Migration[],
    migrationsTableName?: string,
  ): Promise<void>;
}
