/**
 * worker/runtime/content-sync.ts 纯逻辑测试（node:test，无 D1 依赖）。
 *
 * 覆盖：payload 结构/字段校验、SQL DML 白名单、上限、重复检测。
 * D1 写入与完整 HTTP 契约在 worker/__tests__/d1/content-sync.test.ts。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  isAllowedSqlStatement,
  MAX_ARTICLES,
  MAX_ITEMS,
  MAX_SOURCES,
  MAX_SQL_STATEMENTS,
  normalizeSqlStatements,
  parseItemsPayload,
  parseSyncPayload,
  SyncPayloadError,
} from '../runtime/content-sync.ts';
import type { SyncPayload } from '../runtime/content-sync.ts';

// ── 测试固件 ──────────────────────────────────────────

function makeArticle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sync-blog/first-post',
    sourceId: 'sync-blog',
    originalUrl: 'https://sync.example/blog/first-post/',
    originalLanguage: 'en',
    publishedAt: '2026-08-01',
    sourceDomain: 'sync.example',
    categories: ['AI'],
    versions: [
      {
        language: 'en',
        title: 'First Post',
        contentMarkdown: '# Hello',
        provenance: 'original',
      },
    ],
    ...overrides,
  };
}

function makeSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sync-blog',
    name: 'Sync Blog',
    type: 'company',
    homepageUrl: 'https://sync.example/',
    blogUrl: 'https://sync.example/blog',
    domain: 'sync.example',
    ...overrides,
  };
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sources: [makeSource()],
    articles: [makeArticle()],
    ...overrides,
  };
}

function assertPayloadError(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof SyncPayloadError, `expected SyncPayloadError, got ${String(error)}`);
    assert.match(error.message, pattern);
    return true;
  });
}

// ── 解析与校验 ────────────────────────────────────────

test('parseSyncPayload 解析合法完整载荷', () => {
  const payload = parseSyncPayload(JSON.stringify(makePayload()));
  assert.equal(payload.sources.length, 1);
  assert.equal(payload.sources[0]!.id, 'sync-blog');
  assert.equal(payload.articles.length, 1);
  const article = payload.articles[0]!;
  assert.equal(article.id, 'sync-blog/first-post');
  assert.deepEqual(article.categories, ['AI']);
  assert.equal(article.versions.length, 1);
  assert.equal(article.versions[0]!.provenance, 'original');
  assert.deepEqual(payload.sql, []);
});

test('非 JSON body 抛 SyncPayloadError', () => {
  assertPayloadError(() => parseSyncPayload('not json'), /not valid JSON/);
});

test('非对象 payload 抛错', () => {
  assertPayloadError(() => parseSyncPayload('[1,2]'), /must be a JSON object/);
  assertPayloadError(() => parseSyncPayload('"str"'), /must be a JSON object/);
});

test('articles / sources 非数组抛错', () => {
  assertPayloadError(() => parseSyncPayload(JSON.stringify({ articles: {} })), /articles must be an array/);
  assertPayloadError(() => parseSyncPayload(JSON.stringify({ sources: 'x' })), /sources must be an array/);
});

test('空载荷抛错', () => {
  assertPayloadError(() => parseSyncPayload('{}'), /must contain articles, sources or sql/);
});

test('仅 sources 的载荷合法', () => {
  const payload = parseSyncPayload(JSON.stringify({ sources: [makeSource()] }));
  assert.equal(payload.articles.length, 0);
  assert.equal(payload.sql.length, 0);
});

test('articles 超上限抛错', () => {
  const articles = Array.from({ length: MAX_ARTICLES + 1 }, (_, i) =>
    makeArticle({ id: `sync-blog/post-${i}`, originalUrl: `https://sync.example/blog/post-${i}/` }),
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify({ articles })),
    new RegExp(`too many articles.*max ${MAX_ARTICLES}`),
  );
});

test('sources 超上限抛错', () => {
  const sources = Array.from({ length: MAX_SOURCES + 1 }, (_, i) =>
    makeSource({ id: `src-${i}`, domain: `src-${i}.example` }),
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify({ sources })),
    new RegExp(`too many sources.*max ${MAX_SOURCES}`),
  );
});

test('文章必填字段缺失/非法抛错', () => {
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ id: '' })] }))),
    /missing or invalid id/,
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ originalUrl: 'not-a-url' })] }))),
    /invalid originalUrl.*absolute http\(s\) URL/,
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ publishedAt: '' })] }))),
    /missing or invalid publishedAt/,
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ sourceDomain: 1 })] }))),
    /missing or invalid sourceDomain/,
  );
});

test('versions 为空或非法抛错', () => {
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ versions: [] })] }))),
    /non-empty versions array/,
  );
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ versions: 'x' })] }))),
    /non-empty versions array/,
  );
  assertPayloadError(
    () =>
      parseSyncPayload(
        JSON.stringify(
          makePayload({
            articles: [makeArticle({ versions: [{ language: 'en', contentMarkdown: '# x', provenance: 'original' }] })],
          }),
        ),
      ),
    /missing or invalid title/,
  );
});

test('非法 provenance 抛错', () => {
  const versions = [{ language: 'en', title: 'T', contentMarkdown: '# x', provenance: 'ai-translated' }];
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ versions })] }))),
    /invalid provenance/,
  );
});

test('非法 source type 抛错', () => {
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ sources: [makeSource({ type: 'org' })] }))),
    /invalid type/,
  );
});

test('categories 非数组抛错', () => {
  assertPayloadError(
    () => parseSyncPayload(JSON.stringify(makePayload({ articles: [makeArticle({ categories: 'AI' })] }))),
    /invalid categories.*expected array/,
  );
});

test('载荷内重复 id / (sourceId, originalUrl) 抛错', () => {
  const dupId = {
    sources: [makeSource()],
    articles: [makeArticle(), makeArticle({ originalUrl: 'https://sync.example/blog/other/' })],
  };
  assertPayloadError(() => parseSyncPayload(JSON.stringify(dupId)), /duplicate article id/);

  const dupUrl = {
    sources: [makeSource()],
    articles: [makeArticle(), makeArticle({ id: 'sync-blog/other' })],
  };
  assertPayloadError(() => parseSyncPayload(JSON.stringify(dupUrl)), /duplicate \(sourceId, originalUrl\)/);
});

// ── SQL DML 白名单 ───────────────────────────────────

test('SQL 白名单：允许 DML 单语句', () => {
  assert.equal(isAllowedSqlStatement('INSERT INTO t (a) VALUES (1)'), true);
  assert.equal(isAllowedSqlStatement('REPLACE INTO t (a) VALUES (1)'), true);
  assert.equal(isAllowedSqlStatement('UPDATE t SET a = 1 WHERE id = 2'), true);
  assert.equal(isAllowedSqlStatement('DELETE FROM t WHERE id = 1'), true);
  assert.equal(isAllowedSqlStatement('insert into t values (1);'), true); // 尾部分号容忍
});

test('SQL 白名单：拒绝 DDL/DQL/事务控制/内嵌分号', () => {
  for (const bad of [
    'CREATE TABLE t (id INTEGER)',
    'DROP TABLE t',
    'ALTER TABLE t ADD COLUMN x',
    'SELECT * FROM articles',
    'PRAGMA journal_mode=WAL',
    'ATTACH DATABASE x AS y',
    'BEGIN TRANSACTION',
    'COMMIT',
    'REINDEX t',
    'VACUUM',
    "INSERT INTO t VALUES (1); DROP TABLE t",
  ]) {
    assert.equal(isAllowedSqlStatement(bad), false, `should reject: ${bad}`);
  }
});

test('normalizeSqlStatements：string 按分号拆分、去空、去尾分号', () => {
  const statements = normalizeSqlStatements('INSERT INTO a VALUES (1); UPDATE b SET x=1; ;');
  assert.deepEqual(statements, ['INSERT INTO a VALUES (1)', 'UPDATE b SET x=1']);
});

test('normalizeSqlStatements：数组模式与非法项', () => {
  assert.deepEqual(
    normalizeSqlStatements(['DELETE FROM t WHERE id = 1', '  ']),
    ['DELETE FROM t WHERE id = 1'],
  );
  assertPayloadError(() => normalizeSqlStatements(42), /sql must be a string or an array/);
  assertPayloadError(() => normalizeSqlStatements(['INSERT INTO t VALUES (1)', 7]), /sql\[1\] must be a string/);
  assertPayloadError(() => normalizeSqlStatements(['DROP TABLE t']), /sql\[0\] rejected/);
  assertPayloadError(
    () => normalizeSqlStatements(Array.from({ length: MAX_SQL_STATEMENTS + 1 }, () => 'INSERT INTO t VALUES (1)')),
    new RegExp(`too many sql statements.*max ${MAX_SQL_STATEMENTS}`),
  );
});

test('payload 同时含 articles 与 sql 时两者都被解析', () => {
  const payload: SyncPayload = parseSyncPayload(
    JSON.stringify(
      makePayload({ sql: ["INSERT INTO categories (name) VALUES ('X') ON CONFLICT(name) DO NOTHING"] }),
    ),
  );
  assert.equal(payload.articles.length, 1);
  assert.equal(payload.sql.length, 1);
  assert.match(payload.sql[0]!, /^INSERT/);
});

// ── items 上报载荷（门禁拒绝负缓存） ──────────────────

function makeItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceId: 'sync-blog',
    url: 'https://sync.example/blog/junk-page/',
    code: 'content-too-short',
    ...overrides,
  };
}

test('parseItemsPayload 解析合法载荷', () => {
  const payload = parseItemsPayload(
    JSON.stringify({ items: [makeItem(), makeItem({ code: 'missing-published-date' })] }),
  );
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0]!.code, 'content-too-short');
});

test('parseItemsPayload：缺 items / 非数组 / 条目非法 / url 非 http(s) / 超上限', () => {
  assertPayloadError(() => parseItemsPayload('{}'), /payload.items must be an array/);
  assertPayloadError(() => parseItemsPayload('{"items":"nope"}'), /payload.items must be an array/);
  assertPayloadError(() => parseItemsPayload('{"items":[{}]}'), /missing or invalid sourceId/);
  assertPayloadError(() => parseItemsPayload('{"items":[{"sourceId":"s"}]}'), /missing or invalid url/);
  assertPayloadError(() => parseItemsPayload('{"items":[{"sourceId":"s","url":"https://a/1"}]}'), /missing or invalid code/);
  assertPayloadError(
    () => parseItemsPayload(JSON.stringify({ items: [makeItem({ url: 'ftp://x.example/a' })] })),
    /must be an http\(s\) URL/,
  );
  const tooMany = Array.from({ length: MAX_ITEMS + 1 }, () => makeItem());
  assertPayloadError(
    () => parseItemsPayload(JSON.stringify({ items: tooMany })),
    new RegExp(`too many items.*max ${MAX_ITEMS}`),
  );
});
