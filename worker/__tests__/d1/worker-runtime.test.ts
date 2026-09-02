import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, test } from 'vitest';
import worker from '../../index';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe('Worker HTTP runtime handler', () => {
  test('health endpoint returns JSON 200', async () => {
    const response = await worker.fetch(new Request('https://example.com/'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      worker: 'blogs-wiki',
    });
  });

  test('storage health reads injected D1 binding', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/storage/health'),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      backend: 'd1',
    });
  });

  test('unknown route returns 404', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/unknown'),
      env,
    );
    expect(response.status).toBe(404);
  });
});
