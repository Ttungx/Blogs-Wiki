import { FileArticleRepository } from '../../worker/repositories/file/file-article-repository';
import { FileSourceStateRepository } from '../../worker/repositories/file/file-source-state-repository';
import { createWorkerRepositories } from '../../worker/runtime/repositories';
import type { ArticleRepository } from '../../worker/repositories/article-repository';
import type { SourceStateRepository } from '../../worker/repositories/source-state-repository';
import type { D1Database } from '@cloudflare/workers-types';

// mappers 已提取到共享纯模块，这里 re-export 保持调用方（runner.ts）不破坏。
export {
  toDomainSource,
  toDomainArticle,
  toDomainTranslation,
} from '../../worker/domain/mappers';

export type StorageBackend = 'file' | 'd1';

export interface UpdateRepositories {
  articles: ArticleRepository;
  sourceState: SourceStateRepository;
}

export interface RepositoryFactoryOptions {
  rootDir: string;
  backend?: string;
  d1Database?: D1Database;
}

/**
 * 创建更新管线使用的持久化后端。
 *
 * Node 更新命令默认使用 FileRepository。D1 只能在拥有 Worker binding
 * 的运行时使用；显式选择 d1 但未注入 binding 时必须快速失败。
 */
export function createUpdateRepositories(options: RepositoryFactoryOptions): UpdateRepositories {
  const backend = (options.backend ?? process.env.STORAGE_BACKEND ?? 'file').trim().toLowerCase();

  if (backend === 'file') {
    return {
      articles: new FileArticleRepository({ rootDir: options.rootDir }),
      sourceState: new FileSourceStateRepository({ rootDir: options.rootDir }),
    };
  }

  if (backend === 'd1') {
    if (!options.d1Database) {
      throw new Error(
        'STORAGE_BACKEND=d1 requires an injected D1Database; Node update CLI cannot create a D1 binding',
      );
    }
    return createWorkerRepositories({ DB: options.d1Database });
  }

  throw new Error(`Unsupported STORAGE_BACKEND "${backend}"; expected "file" or "d1"`);
}
