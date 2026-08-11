/**
 * 文章仓库接口（ArticleRepository）—— Phase 1 接口防火墙。
 *
 * 手册 §5：Repository 是迁移的第一道防火墙。业务逻辑只依赖此接口，
 * 不感知 FileRepository / D1Repository 的实现差异，Phase 6 换库时
 * 只新增实现，不改调用方。
 *
 * 契约要点：
 * - save 必须幂等：同 (sourceId, originalUrl) 重复保存返回 created:false，
 *   不产生重复文章。
 * - Phase 5 接线时，scripts/update/index.ts 的 writeArticle 调用改走此接口。
 * - Phase 8 Astro SSR 的 getCollection('articles') 改走 listAll / listBySource。
 *
 * 这是 Phase 1 产物：纯类型定义，零运行时依赖，Workers / Node 通用。
 */

import type {
  ArticleRecord,
  SaveArticleInput,
  SaveResult,
} from '../domain/types';

/** 文章仓库接口。 */
export interface ArticleRepository {
  /** 按文章 id（slug）读取；不存在返回 null。 */
  getById(id: string): Promise<ArticleRecord | null>;
  /** 按来源 + 原始 URL 读取；不存在返回 null。 */
  getByOriginalUrl(sourceId: string, originalUrl: string): Promise<ArticleRecord | null>;
  /** 列出某来源的全部文章。 */
  listBySource(sourceId: string): Promise<ArticleRecord[]>;
  /** 列出全部文章。 */
  listAll(): Promise<ArticleRecord[]>;
  /** 保存文章；同 (sourceId, originalUrl) 已存在时幂等返回 created:false。 */
  save(input: SaveArticleInput): Promise<SaveResult>;
  /** 判断 (sourceId, originalUrl) 是否已处理过。 */
  exists(sourceId: string, originalUrl: string): Promise<boolean>;
}
