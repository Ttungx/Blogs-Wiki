/**
 * content-sync/check 桥接 D1 集成测试（vitest-pool-workers，真实 Miniflare D1）。
 *
 * 直接调用 handleContentCheck 覆盖完整 HTTP 契约：
 * 方法/认证/media type/body 校验/条目校验/已存在查询/只读语义。
 * 与 content-sync 共用前置守卫，这里重点覆盖解析与查询分支。
 */

import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  executeContentSync,
  handleContentCheck,
  MAX_CHECK_ITEMS,
} from '../../runtime/content-sync';
import type { ContentSyncEnv } from '../../runtime/content-sync';
import { ALL_CATEGORIES, seedCategories } from './helpers';

const TOKEN = 'test-secret';

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `https://check.example/blog/post-${counter}/`;
}

function syncEnv(overrides: Partial<ContentSyncEnv> = {}): ContentSyncEnv {
  return { DB: env.DB, CONTENT_SYNC_TOKEN: TOKEN, ...overrides };
}

interface CheckRequestOptions {
  token?: string | null;
  contentType?: string;
  method?: string;
}

function checkRequest(
  body: unknown,
  options: CheckRequestOptions = {},
): Request {
  const headers: Record<string, string> = {
    ...(options.token !== null ? { authorization: `Bearer ${options.token ?? TOKEN}` } : {}),
    'content-type': options.contentType ?? 'application/json',
  };
  return new Request('https://example.com/api/content-sync/check', {
    method: options.method ?? 'POST',
    headers,
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

async function rowCount(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

/** 经 sync 端点写入一篇文章，供 check 查询命中。 */
async function seedOneArticle(sourceId: string, url: string): Promise<void> {
  const result = await executeContentSync(env.DB, {
    sources: [
      {
        id: sourceId,
        name: 'Check Blog',
        type: 'company',
        homepageUrl: `https://${sourceId}.example/`,
        blogUrl: `https://${sourceId}.example/blog`,
        domain: `${sourceId}.example`,
      },
    ],
    articles: [
      {
        id: `${sourceId}/post-${counter}`,
        sourceId,
        originalUrl: url,
        originalLanguage: 'en',
        publishedAt: '2026-08-01',
        sourceDomain: `${sourceId}.example`,
        versions: [
          {
            language: 'en',
            title: 'Seeded Post',
            contentMarkdown: '# Seeded\n\nBody.',
            provenance: 'original',
          },
        ],
      },
    ],
    sql: [],
  });
  expect(result.ok).toBe(true);
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedCategories(env.DB, ...ALL_CATEGORIES);
});

describe('content-sync/check HTTP 契约', () => {
  test('仅允许 POST：GET 返回 405 + allow 头', async () => {
    const response = await handleContentCheck(checkRequest(undefined, { method: 'GET' }), syncEnv());
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  test('缺失/错误 token 返回 401；token 未配置返回 503', async () => {
    const noAuth = await handleContentCheck(checkRequest({}, { token: null }), syncEnv());
    expect(noAuth.status).toBe(401);
    const badAuth = await handleContentCheck(checkRequest({}, { token: 'wrong-secret' }), syncEnv());
    expect(badAuth.status).toBe(401);
    const noConfig = await handleContentCheck(checkRequest({}), syncEnv({ CONTENT_SYNC_TOKEN: undefined }));
    expect(noConfig.status).toBe(503);
  });

  test('非 JSON media type 返回 415；空 body 与非法 JSON 返回 400', async () => {
    const wrongType = await handleContentCheck(
      checkRequest('{}', { contentType: 'text/plain' }),
      syncEnv(),
    );
    expect(wrongType.status).toBe(415);

    const empty = await handleContentCheck(checkRequest(undefined), syncEnv());
    expect(empty.status).toBe(400);

    const badJson = await handleContentCheck(checkRequest('{not-json'), syncEnv());
    expect(badJson.status).toBe(400);
    expect(((await badJson.json()) as { error: string }).error).toContain('invalid JSON');
  });

  test('items 非数组或超上限返回 400', async () => {
    const notArray = await handleContentCheck(checkRequest({ items: 'nope' }), syncEnv());
    expect(notArray.status).toBe(400);

    const tooMany = Array.from({ length: MAX_CHECK_ITEMS + 1 }, () => ({
      sourceId: 's',
      url: uniqueUrl(),
    }));
    const overflow = await handleContentCheck(checkRequest({ items: tooMany }), syncEnv());
    expect(overflow.status).toBe(400);
    expect(((await overflow.json()) as { error: string }).error).toContain('too many items');
  });

  test('条目字段非法（缺字段、url 非 http(s)）返回 400', async () => {
    const missingSource = await handleContentCheck(
      checkRequest({ items: [{ url: uniqueUrl() }] }),
      syncEnv(),
    );
    expect(missingSource.status).toBe(400);

    const badUrl = await handleContentCheck(
      checkRequest({ items: [{ sourceId: 's', url: 'ftp://x.example/a' }] }),
      syncEnv(),
    );
    expect(badUrl.status).toBe(400);
  });

  test('返回已存在子集；不同 sourceId 同 URL 不算命中；查询只读', async () => {
    const sourceId = 'check-blog';
    const seededUrl = uniqueUrl();
    await seedOneArticle(sourceId, seededUrl);

    const freshUrl = uniqueUrl();
    const before = await rowCount('articles');
    const response = await handleContentCheck(
      checkRequest({
        items: [
          { sourceId, url: seededUrl },
          { sourceId, url: freshUrl },
          { sourceId: 'another-blog', url: seededUrl },
        ],
      }),
      syncEnv(),
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { existing: Array<{ sourceId: string; url: string }> };
    expect(data.existing).toEqual([{ sourceId, url: seededUrl }]);
    expect(await rowCount('articles')).toBe(before);
  });
});
