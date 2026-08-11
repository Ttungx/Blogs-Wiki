import type { D1Database } from '@cloudflare/workers-types';
import { D1ArticleRepository } from '../repositories/d1/d1-article-repository';
import { D1SourceStateRepository } from '../repositories/d1/d1-source-state-repository';
import type { ArticleRepository } from '../repositories/article-repository';
import type { SourceStateRepository } from '../repositories/source-state-repository';

export interface WorkerEnv {
  DB: D1Database;
}

export interface WorkerRepositories {
  articles: ArticleRepository;
  sourceState: SourceStateRepository;
}

/**
 * Worker runtime 的唯一持久化注入点。
 *
 * D1 binding 由 Cloudflare 传入；Worker 业务层不读取环境变量，也不创建
 * 本地数据库连接。后续 Workflow 直接复用此工厂。
 */
export function createWorkerRepositories(env: WorkerEnv): WorkerRepositories {
  if (!env.DB) {
    throw new Error('Worker runtime requires the DB D1 binding');
  }

  return {
    articles: new D1ArticleRepository(env.DB),
    sourceState: new D1SourceStateRepository(env.DB),
  };
}
