/**
 * 来源处理状态仓库接口（SourceStateRepository）。
 *
 * 当前职责忠于现状 processed-urls.json：只表达"处理过没有"，
 * 非完整状态机。手册 §6 的状态机语义（discovered / fetching / fetched /
 * translating / published / skipped / failed）留到 Phase 6 D1 source_items
 * 表落地时再扩展，这里不预建。
 *
 * 契约要点：
 * - markProcessed 必须幂等：重复标记同一 (sourceId, url) 无副作用。
 * - reconcile 接收已知的 (sourceId, url) 条目，回填未记录的，返回新增数；
 *   调用方负责扫描文件产生 entries，接口本身不耦合文件系统。
 * - re-export ProcessedStateSnapshot 方便调用方。
 *
 * 这是 Phase 1 产物：纯类型定义，零运行时依赖，Workers / Node 通用。
 */

import type { ProcessedStateSnapshot } from '../domain/types';

/** 来源处理状态仓库接口。 */
export interface SourceStateRepository {
  /** 判断 (sourceId, url) 是否已处理过。 */
  hasSeen(sourceId: string, url: string): Promise<boolean>;
  /** 标记 (sourceId, url) 已处理；幂等。 */
  markProcessed(sourceId: string, url: string): Promise<void>;
  /** 列出某来源已处理的所有 url。 */
  listProcessed(sourceId: string): Promise<string[]>;
  /** 加载 processed-urls.json 的完整快照。 */
  loadAll(): Promise<ProcessedStateSnapshot>;
  /** 回填未记录的 (sourceId, url) 条目，返回新增数。 */
  reconcile(entries: Iterable<{ sourceId: string; url: string }>): Promise<number>;
}

/** re-export 快照类型，调用方无需直接 import domain/types。 */
export type { ProcessedStateSnapshot };
