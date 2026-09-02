/**
 * content-sync 桥接 D1 集成测试（vitest-pool-workers，真实 Miniflare D1）。
 *
 * 直接调用 handleContentSync 覆盖完整 HTTP 契约：
 * 方法/认证/media type/body 上限/校验错误/幂等写入/统计/sql 直通。
 * 每个测试用唯一 URL 避免同一 D1 存储测试间数据污染。
 */

import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  handleContentSync,
  MAX_BODY_BYTES,
} from '../../runtime/content-sync';
import type { ContentSyncEnv, SyncPayload } from '../../runtime/content-sync';
import { ALL_CATEGORIES, seedCategories } from './helpers';

const TOKEN = 'test-secret';

let urlCounter = 0;
function uniqueUrl(): string {
  urlCounter += 1;
  return `https://sync.example/blog/post-${urlCounter}/`;
}

function makePayload(overrides: Partial<SyncPayload> = {}): SyncPayload {
  const payload: SyncPayload = {
    sources: [
      {
        id: 'sync-blog',
        name: 'Sync Blog',
        type: 'company',
        homepageUrl: 'https://sync.example/',
        blogUrl: 'https://sync.example/blog',
        domain: 'sync.example',
      },
    ],
    articles: [
      {
        id: `sync-blog/post-${urlCounter + 1}`,
        sourceId: 'sync-blog',
        originalUrl: uniqueUrl(),
        originalLanguage: 'en',
        publishedAt: '2026-08-01',
        imageUrl: 'https://sync.example/img.jpg',
        author: 'Sync Author',
        sourceDomain: 'sync.example',
        categories: ['AI'],
        versions: [
          {
            language: 'en',
            title: 'First Post',
            contentMarkdown: '# Hello\n\nOriginal body.',
            provenance: 'original',
          },
          {
            language: 'zh-cn',
            title: '第一篇文章',
            contentMarkdown: '## 你好\n\n翻译正文。',
            provenance: 'model',
            translationModel: 'test-model',
          },
        ],
      },
    ],
    sql: [],
  };
  return { ...payload, ...overrides, sql: overrides.sql ?? [] };
}

function syncEnv(overrides: Partial<ContentSyncEnv> = {}): ContentSyncEnv {
  return { DB: env.DB, CONTENT_SYNC_TOKEN: TOKEN, ...overrides };
}

function post(
  body: string | undefined,
  options: { token?: string | null; contentType?: string; method?: string; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = {
    // token 默认 test-secret；显式传 null 才省略认证头。
    ...(options.token !== null ? { authorization: `Bearer ${options.token ?? TOKEN}` } : {}),
    'content-type': options.contentType ?? 'application/json',
    ...options.headers,
  };
  return new Request('https://example.com/api/content-sync', {
    method: options.method ?? 'POST',
    headers,
    ...(body !== undefined ? { body } : {}),
  });
}

async function rowCount(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedCategories(env.DB, ...ALL_CATEGORIES);
});

describe('content-sync HTTP 契约', () => {
  test('仅允许 POST：GET 返回 405 + allow 头', async () => {
    const response = await handleContentSync(post(undefined, { method: 'GET' }), syncEnv());
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  test('缺失/错误 token 返回 401', async () => {
    const noAuth = await handleContentSync(post('{}', { token: null }), syncEnv());
    expect(noAuth.status).toBe(401);
    const badAuth = await handleContentSync(post('{}', { token: 'wrong-secret' }), syncEnv());
    expect(badAuth.status).toBe(401);
  });

  test('token 未配置返回 503', async () => {
    const response = await handleContentSync(post('{}'), syncEnv({ CONTENT_SYNC_TOKEN: undefined }));
    expect(response.status).toBe(503);
  });

  test('非 application/json 返回 415', async () => {
    const response = await handleContentSync(post('{}', { contentType: 'text/plain' }), syncEnv());
    expect(response.status).toBe(415);
  });

  test('body 超上限返回 413（实际字节数）', async () => {
    const oversized = '{' + 'x'.repeat(MAX_BODY_BYTES) + '}';
    const response = await handleContentSync(post(oversized), syncEnv());
    expect(response.status).toBe(413);
  });

  test('content-length 声明超上限返回 413', async () => {
    const request = new Request('https://example.com/api/content-sync', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': String(MAX_BODY_BYTES + 1),
      },
    });
    const response = await handleContentSync(request, syncEnv());
    expect(response.status).toBe(413);
  });

  test('非法 JSON 返回 400', async () => {
    const response = await handleContentSync(post('not json'), syncEnv());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('not valid JSON') });
  });

  test('未知来源（payload 与 DB 均无）返回 400 且不写库', async () => {
    const payload = makePayload();
    payload.articles[0]!.sourceId = 'ghost-source';
    const before = await rowCount('articles');
    const response = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('unknown sources') });
    expect(await rowCount('articles')).toBe(before);
  });

  test('非法 provenance 返回 400', async () => {
    const payload = makePayload();
    payload.articles[0]!.versions[0]!.provenance = 'ai' as SyncPayload['articles'][number]['versions'][number]['provenance'];
    const response = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('invalid provenance') });
  });
});

describe('content-sync 写入与幂等', () => {
  test('合法载荷写入 sources/articles/versions/categories 并返回统计', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;
    const response = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      articles: { received: 1, created: 1, updated: 0 },
      sql: { statements: 0, executed: 0 },
    });

    const identity = await env.DB
      .prepare('SELECT id, source_id, original_url, published_at, image_url, author FROM articles WHERE id = ?')
      .bind(article.id)
      .first<{
        id: string;
        source_id: string;
        original_url: string;
        published_at: string;
        image_url: string;
        author: string;
      }>();
    expect(identity).toMatchObject({
      id: article.id,
      source_id: 'sync-blog',
      original_url: article.originalUrl,
      published_at: '2026-08-01',
      image_url: 'https://sync.example/img.jpg',
      author: 'Sync Author',
    });

    const versions = await env.DB
      .prepare('SELECT language, provenance, translation_model FROM article_versions WHERE article_id = ? ORDER BY language')
      .bind(article.id)
      .all<{ language: string; provenance: string; translation_model: string | null }>();
    expect(versions.results).toHaveLength(2);
    expect(versions.results[0]).toMatchObject({ language: 'en', provenance: 'original' });
    expect(versions.results[1]).toMatchObject({
      language: 'zh-cn',
      provenance: 'model',
      translation_model: 'test-model',
    });

    const categories = await env.DB
      .prepare('SELECT category_name FROM article_categories WHERE article_id = ?')
      .bind(article.id)
      .all<{ category_name: string }>();
    expect(categories.results.map((r) => r.category_name)).toEqual(['AI']);

    const source = await env.DB.prepare('SELECT name, domain FROM sources WHERE id = ?').bind('sync-blog').first();
    expect(source).toMatchObject({ name: 'Sync Blog', domain: 'sync.example' });
  });

  test('重复提交幂等：created=0、updated=0、整篇 skip（零写入）', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;

    const first = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect((await first.json())).toMatchObject({ articles: { received: 1, created: 1, updated: 0 } });

    const second = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      articles: { received: 1, created: 0, updated: 0, skipped: 1 },
    });

    const count = await rowCount('articles');
    const versions = await env.DB
      .prepare('SELECT COUNT(*) AS count FROM article_versions WHERE article_id = ?')
      .bind(article.id)
      .first<{ count: number }>();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(versions?.count).toBe(2);
  });

  test('阶段 B：内容不变时重复提交不刷新 updated_at', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;
    await handleContentSync(post(JSON.stringify(payload)), syncEnv());

    // 哨兵时间：若服务端仍无条件 updated_at=now 会被冲掉，skip 路径则保留。
    const sentinel = '2099-01-01 00:00:00';
    await env.DB
      .prepare('UPDATE articles SET updated_at = ? WHERE id = ?')
      .bind(sentinel, article.id)
      .run();
    await env.DB
      .prepare('UPDATE article_versions SET updated_at = ? WHERE article_id = ?')
      .bind(sentinel, article.id)
      .run();

    const second = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ articles: { received: 1, skipped: 1 } });

    const articleRow = await env.DB
      .prepare('SELECT updated_at FROM articles WHERE id = ?')
      .bind(article.id)
      .first<{ updated_at: string }>();
    expect(articleRow?.updated_at).toBe(sentinel);
    const versionRows = await env.DB
      .prepare('SELECT updated_at FROM article_versions WHERE article_id = ?')
      .bind(article.id)
      .all<{ updated_at: string }>();
    for (const row of versionRows.results) expect(row.updated_at).toBe(sentinel);
  });

  test('身份字段变化（published/quality）不被 skip 吞掉', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;
    await handleContentSync(post(JSON.stringify(payload)), syncEnv());

    // 只翻 published + 内容全不变 → 必须走 upsert，不能整篇 skip。
    const flipped: SyncPayload = {
      sources: [],
      articles: [{ ...article, published: false }],
      sql: [],
    };
    const response = await handleContentSync(post(JSON.stringify(flipped)), syncEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ articles: { received: 1, updated: 1 } });

    const row = await env.DB
      .prepare('SELECT published FROM articles WHERE id = ?')
      .bind(article.id)
      .first<{ published: number }>();
    expect(row?.published).toBe(0);
  });

  test('分类 diff：集合相等时不动 article_categories 行', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;
    await handleContentSync(post(JSON.stringify(payload)), syncEnv());

    // 记录 rowid：若分类被 DELETE+INSERT 重建，rowid 会变；未触碰则保留。
    const before = await env.DB
      .prepare('SELECT rowid FROM article_categories WHERE article_id = ?')
      .bind(article.id)
      .first<{ rowid: number }>();

    // 内容也变一点（保证走 updated 路径而非整篇 skip），但分类不变。
    const touched: SyncPayload = {
      sources: [],
      articles: [
        {
          ...article,
          versions: [
            {
              ...article.versions[0]!,
              title: 'First Post (touched)',
              contentMarkdown: '# Hello\n\nOriginal body (edited).',
            },
            article.versions[1]!,
          ],
        },
      ],
      sql: [],
    };
    const response = await handleContentSync(post(JSON.stringify(touched)), syncEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ articles: { received: 1, updated: 1 } });

    // 分类集合没变 → 不该 DELETE+INSERT（rowid 哨兵保留）。
    const after = await env.DB
      .prepare('SELECT rowid FROM article_categories WHERE article_id = ?')
      .bind(article.id)
      .first<{ rowid: number }>();
    expect(after).toEqual(before);
  });

  test('分类 diff：集合变化时重建', async () => {
    const payload = makePayload();
    const article = payload.articles[0]!;
    await handleContentSync(post(JSON.stringify(payload)), syncEnv());

    const recat: SyncPayload = {
      sources: [],
      articles: [{ ...article, categories: ['AI', 'LLM'] }],
      sql: [],
    };
    const response = await handleContentSync(post(JSON.stringify(recat)), syncEnv());
    expect(response.status).toBe(200);
    const cats = await env.DB
      .prepare('SELECT category_name FROM article_categories WHERE article_id = ? ORDER BY category_name')
      .bind(article.id)
      .all<{ category_name: string }>();
    expect(cats.results.map((r) => r.category_name)).toEqual(['AI', 'LLM']);
  });

  test('省略可选字段时保留现值（COALESCE），不覆盖', async () => {
    const first = makePayload();
    const article = first.articles[0]!;
    await handleContentSync(post(JSON.stringify(first)), syncEnv());

    // 第二次只带必填字段，不带 imageUrl / author / categories
    const second: SyncPayload = {
      sources: first.sources,
      articles: [
        {
          id: article.id,
          sourceId: article.sourceId,
          originalUrl: article.originalUrl,
          originalLanguage: article.originalLanguage,
          publishedAt: article.publishedAt,
          sourceDomain: article.sourceDomain,
          versions: article.versions,
        },
      ],
      sql: [],
    };
    const response = await handleContentSync(post(JSON.stringify(second)), syncEnv());
    expect(response.status).toBe(200);

    const identity = await env.DB
      .prepare('SELECT image_url, author FROM articles WHERE id = ?')
      .bind(article.id)
      .first<{ image_url: string | null; author: string | null }>();
    expect(identity?.image_url).toBe('https://sync.example/img.jpg');
    expect(identity?.author).toBe('Sync Author');
  });

  test('模型译文保留首次生成时间，重译不覆盖 translated_at', async () => {
    const firstTranslatedAt = '2026-08-10T01:02:03.000Z';
    const laterTranslatedAt = '2026-08-12T04:05:06.000Z';
    const first = makePayload();
    const article = first.articles[0]!;
    const modelVersion = article.versions.find((v) => v.language === 'zh-cn')!;
    modelVersion.translatedAt = firstTranslatedAt;

    await handleContentSync(post(JSON.stringify(first)), syncEnv());

    const retranslated: SyncPayload = {
      sources: [],
      articles: [
        {
          ...article,
          versions: [
            article.versions.find((v) => v.language === 'en')!,
            {
              ...modelVersion,
              title: '重译后的标题',
              contentMarkdown: '## 重译正文\n\n第二次模型译文。',
              translatedAt: laterTranslatedAt,
            },
          ],
        },
      ],
      sql: [],
    };
    const response = await handleContentSync(post(JSON.stringify(retranslated)), syncEnv());
    expect(response.status).toBe(200);

    const version = await env.DB
      .prepare(
        'SELECT title, translated_at FROM article_versions WHERE article_id = ? AND language = ?',
      )
      .bind(article.id, 'zh-cn')
      .first<{ title: string; translated_at: string | null }>();
    expect(version?.title).toBe('重译后的标题');
    expect(version?.translated_at).toBe(firstTranslatedAt);
  });

  test('categories 省略时不触碰现有分类；空数组时清空', async () => {
    const first = makePayload();
    const article = first.articles[0]!;
    await handleContentSync(post(JSON.stringify(first)), syncEnv());

    // 省略 categories → 保留
    const noCategories: SyncPayload = {
      sources: [],
      articles: [{ ...article, categories: undefined }],
      sql: [],
    };
    await handleContentSync(post(JSON.stringify(noCategories)), syncEnv());
    const kept = await env.DB
      .prepare('SELECT category_name FROM article_categories WHERE article_id = ?')
      .bind(article.id)
      .all<{ category_name: string }>();
    expect(kept.results.map((r) => r.category_name)).toEqual(['AI']);

    // 空数组 → 清空
    const cleared: SyncPayload = {
      sources: [],
      articles: [{ ...article, categories: [] }],
      sql: [],
    };
    await handleContentSync(post(JSON.stringify(cleared)), syncEnv());
    const after = await env.DB
      .prepare('SELECT COUNT(*) AS count FROM article_categories WHERE article_id = ?')
      .bind(article.id)
      .first<{ count: number }>();
    expect(after?.count).toBe(0);
  });
});

describe('content-sync sql 直通模式', () => {
  test('DML 语句执行并返回统计', async () => {
    const payload: SyncPayload = {
      sources: [],
      articles: [],
      sql: ["INSERT INTO categories (name) VALUES ('Sync-Cat') ON CONFLICT(name) DO NOTHING"],
    };
    const response = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      articles: { received: 0, created: 0, updated: 0 },
      sql: { statements: 1, executed: 1 },
    });
    const row = await env.DB.prepare('SELECT name FROM categories WHERE name = ?').bind('Sync-Cat').first();
    expect(row).toMatchObject({ name: 'Sync-Cat' });
  });

  test('拒绝 DDL / DQL / 内嵌分号，且不写库', async () => {
    for (const sql of [
      'CREATE TABLE evil (id INTEGER)',
      'SELECT * FROM articles',
      "INSERT INTO categories (name) VALUES ('X'); DROP TABLE categories",
    ]) {
      const payload: SyncPayload = { sources: [], articles: [], sql: [sql] };
      const response = await handleContentSync(post(JSON.stringify(payload)), syncEnv());
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('rejected') });
    }
    const evilTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evil'").first();
    expect(evilTable).toBeNull();
  });
});
