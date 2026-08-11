import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, test } from 'vitest';
import { createUpdateRepositories } from '../../../scripts/update/repository-factory';
import { createWorkerRepositories } from '../../runtime/repositories';
import { D1ArticleRepository } from '../../repositories/d1/d1-article-repository';
import { D1SourceStateRepository } from '../../repositories/d1/d1-source-state-repository';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

test('factory creates D1 repositories when binding is injected', () => {
  const repositories = createUpdateRepositories({
    rootDir: '.',
    backend: 'd1',
    d1Database: env.DB,
  });
  expect(repositories.articles).toBeInstanceOf(D1ArticleRepository);
  expect(repositories.sourceState).toBeInstanceOf(D1SourceStateRepository);
});

test('Worker runtime factory injects env.DB into D1 repositories', () => {
  const repositories = createWorkerRepositories(env);
  expect(repositories.articles).toBeInstanceOf(D1ArticleRepository);
  expect(repositories.sourceState).toBeInstanceOf(D1SourceStateRepository);
});
