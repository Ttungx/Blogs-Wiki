/**
 * 搜索页清单缓存（读路径消融）。
 *
 * listAllArticlesForSearch 每次请求做 2 次全表扫描（文章清单 + 分类），
 * 约等于 2×馆藏行数/次；而内容只由 /api/content-sync 每 15 分钟写入，
 * 10 分钟 TTL 的最终一致窗口远小于内容变化频率。同一 isolate 内 TTL 复用，
 * 并用 Promise 去重并发放大（并发首查只打一次 D1）。
 *
 * 失败语义：D1 查询失败不缓存（fail-open），下次请求重查。
 */
import type { D1Database } from '@cloudflare/workers-types';

import { listAllArticlesForSearch } from './content';
import type { ArticleSearchItem } from './content';

const TTL_MS = 10 * 60_000;

interface CacheEntry {
  at: number;
  promise: Promise<ArticleSearchItem[]>;
}

const cache = new Map<string, CacheEntry>();
let clock: () => number = () => Date.now();

/** 测试隔离用：清空缓存并替换时钟（缺省恢复真实时钟）。 */
export function resetSearchCacheForTest(now?: () => number): void {
  cache.clear();
  clock = now ?? (() => Date.now());
}

export function getSearchListCached(
  db: D1Database,
  lang = 'zh-cn',
): Promise<ArticleSearchItem[]> {
  const entry = cache.get(lang);
  const now = clock();
  if (entry && now - entry.at < TTL_MS) return entry.promise;
  const promise = listAllArticlesForSearch(db, lang).catch((error: unknown) => {
    cache.delete(lang);
    throw error;
  });
  cache.set(lang, { at: now, promise });
  return promise;
}
