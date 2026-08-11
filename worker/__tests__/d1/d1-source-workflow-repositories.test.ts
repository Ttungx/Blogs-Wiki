import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, test } from 'vitest';
import { D1SourceItemRepository } from '../../repositories/d1/d1-source-item-repository.ts';
import { D1SourceRunRepository } from '../../repositories/d1/d1-source-run-repository.ts';
import { seedSources } from './helpers.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedSources(
    env.DB,
    {
      id: 'workflow-state',
      name: 'Workflow State',
      type: 'company',
      homepageUrl: 'https://state.example.com/',
      blogUrl: 'https://state.example.com/blog/',
      domain: 'state.example.com',
    },
    {
      id: 'workflow-runs',
      name: 'Workflow Runs',
      type: 'company',
      homepageUrl: 'https://runs.example.com/',
      blogUrl: 'https://runs.example.com/blog/',
      domain: 'runs.example.com',
    },
  );
  await env.DB
    .prepare(`
      INSERT INTO articles (id, source_id, original_url, original_language, published_at, source_domain)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `)
    .bind(
      'workflow-state/article-one',
      'workflow-state',
      'https://state.example.com/article/one',
      'en',
      '2026-08-10',
      'state.example.com',
    )
    .run();
});

describe('D1SourceItemRepository', () => {
  test('discover 幂等，并保留已发布条目的终态', async () => {
    const repo = new D1SourceItemRepository(env.DB);
    const first = await repo.discover({
      sourceId: 'workflow-state',
      originalUrl: 'https://state.example.com/article/one',
      title: 'First title',
      publishedAt: '2026-08-10',
    });
    expect(first.status).toBe('discovered');

    await repo.transition(first.id, 'fetching');
    await repo.transition(first.id, 'fetched');
    await repo.transition(first.id, 'translating');
    const published = await repo.transition(first.id, 'published', {
      articleId: 'workflow-state/article-one',
    });

    const second = await repo.discover({
      sourceId: 'workflow-state',
      originalUrl: 'https://state.example.com/article/one',
      title: 'Updated title',
    });
    expect(second.id).toBe(published.id);
    expect(second.status).toBe('published');
    expect(second.articleId).toBe('workflow-state/article-one');
    expect(second.title).toBe('Updated title');
    expect(second.publishedAt).toBe('2026-08-10');
  });

  test('非法状态转换被拒绝，失败会递增尝试次数', async () => {
    const repo = new D1SourceItemRepository(env.DB);
    const item = await repo.discover({
      sourceId: 'workflow-state',
      originalUrl: 'https://state.example.com/article/failure',
    });

    await expect(repo.transition(item.id, 'published')).rejects.toThrow(
      'invalid source item transition',
    );
    const failed = await repo.recordFailure(item.id, 'fetch timeout');
    expect(failed.status).toBe('failed');
    expect(failed.attemptCount).toBe(1);
    expect(failed.lastError).toBe('fetch timeout');

    const retry = await repo.discover({
      sourceId: 'workflow-state',
      originalUrl: 'https://state.example.com/article/failure',
    });
    expect(retry.status).toBe('discovered');
    expect(retry.attemptCount).toBe(1);
    expect(retry.lastError).toBeUndefined();
  });

  test('按来源和状态列出待处理条目', async () => {
    const repo = new D1SourceItemRepository(env.DB);
    const item = await repo.discover({
      sourceId: 'workflow-state',
      originalUrl: 'https://state.example.com/article/pending',
    });
    expect(
      (await repo.listBySource('workflow-state', ['discovered'])).some(
        (candidate) => candidate.id === item.id,
      ),
    ).toBe(true);
  });
});

describe('D1SourceRunRepository', () => {
  test('创建并更新运行记录', async () => {
    const repo = new D1SourceRunRepository(env.DB);
    const run = await repo.create({
      sourceId: 'workflow-runs',
      trigger: 'manual',
      startedAt: '2026-08-11T00:00:00.000Z',
    });
    expect(run.status).toBe('running');
    expect(run.trigger).toBe('manual');

    const completed = await repo.update(run.id, {
      status: 'partial',
      finishedAt: '2026-08-11T00:01:00.000Z',
      discovered: 3,
      pending: 1,
      processed: 1,
      failed: 1,
      errors: 'one article failed',
    });
    expect(completed).toMatchObject({
      status: 'partial',
      discovered: 3,
      pending: 1,
      processed: 1,
      failed: 1,
      errors: 'one article failed',
      finishedAt: '2026-08-11T00:01:00.000Z',
    });
  });
});
