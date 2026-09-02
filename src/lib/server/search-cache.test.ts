/**
 * 搜索清单缓存测试：TTL 复用、并发去重、失败 fail-open、时钟推进后重查。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resetSearchCacheForTest, getSearchListCached } from './search-cache';

type QueryCounter = { count: number };

function fakeDb(counter: QueryCounter, fail = false) {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async all() {
              counter.count += 1;
              if (fail) throw new Error('d1 down');
              return { results: [] }; // 分类查询：空
            },
          };
        },
        async all() {
          counter.count += 1;
          if (fail) throw new Error('d1 down');
          // 清单查询：返回 1 行，避免提前 return 跳过分类查询
          return {
            results: [
              {
                id: 's/a',
                source_id: 's',
                source_domain: 'example.com',
                published_at: '2026-08-10 00:00:00',
                original_language: 'en',
                title: 't',
                original_title: null,
              },
            ],
          };
        },
      };
    },
  } as never;
}

test('TTL 内复用：第二次调用不再查 D1', async () => {
  let now = 1_000;
  resetSearchCacheForTest(() => now);
  const counter = { count: 0 };
  const db = fakeDb(counter);

  await getSearchListCached(db, 'zh-cn');
  await getSearchListCached(db, 'zh-cn');

  assert.equal(counter.count, 2); // 首查 2 条 SQL（清单 + 分类）
  // 不同语言各自缓存
  await getSearchListCached(db, 'en');
  assert.equal(counter.count, 4);
});

test('TTL 过期后重新查询', async () => {
  let now = 1_000;
  resetSearchCacheForTest(() => now);
  const counter = { count: 0 };
  const db = fakeDb(counter);

  await getSearchListCached(db, 'zh-cn');
  now += 10 * 60_000 - 1;
  await getSearchListCached(db, 'zh-cn');
  assert.equal(counter.count, 2); // 边界内仍复用
  now += 1;
  await getSearchListCached(db, 'zh-cn');
  assert.equal(counter.count, 4); // 过期重查
});

test('并发去重：同 tick 并发首查只打一次 D1', async () => {
  resetSearchCacheForTest();
  const counter = { count: 0 };
  const db = fakeDb(counter);

  await Promise.all([
    getSearchListCached(db, 'zh-cn'),
    getSearchListCached(db, 'zh-cn'),
    getSearchListCached(db, 'zh-cn'),
  ]);
  assert.equal(counter.count, 2);
});

test('失败不缓存（fail-open）：恢复后下次重查成功', async () => {
  resetSearchCacheForTest();
  const counter = { count: 0 };
  const bad = fakeDb(counter, true);
  const good = fakeDb(counter);

  await assert.rejects(getSearchListCached(bad, 'zh-cn'));
  const items = await getSearchListCached(good, 'zh-cn');
  assert.equal(items.length, 1); // 成功返回清单行
  assert.equal(counter.count, 3); // 失败首查 1 次 + 成功 2 次
});
