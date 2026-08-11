import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, afterEach, describe, expect, test, vi } from 'vitest';
import worker from '../../index';

const articleHtml = `<!doctype html>
<html lang="en">
  <head><title>Runtime article</title></head>
  <body><article><h1>Runtime article</h1><p>${'Worker runtime extraction fixture. '.repeat(12)}</p></article></body>
</html>`;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Worker HTTP runtime handler', () => {
  test('health endpoint returns JSON 200', async () => {
    const response = await worker.fetch(new Request('https://example.com/'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      worker: 'blogs-wiki-extractor-poc',
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

  test('extract endpoint validates URL and extracts through Worker fetch', async () => {
    const missingUrl = await worker.fetch(
      new Request('https://example.com/extract'),
      env,
    );
    expect(missingUrl.status).toBe(400);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(articleHtml)));
    const response = await worker.fetch(
      new Request('https://example.com/extract?url=https%3A%2F%2Fexample.com%2Farticle'),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      url: 'https://example.com/article',
      title: 'Runtime article',
      language: 'en',
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
