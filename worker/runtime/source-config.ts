/**
 * Worker 来源配置加载器。
 *
 * Worker 无文件系统，通过 JSON import 在构建期打包 `src/data/sources.json`。
 * 管线开发阶段已由 Node CLI（`npm run update:dry` / `audit:source`）验证配置
 * 合法性，Worker 运行时只做最小校验 + 来源过滤。
 *
 * 返回 snake_case `SourceConfig`（与 `scripts/update/types.ts` 一致），
 * 编排器在 save 时用 `toDomainSource()` 映射到领域类型。这保持了与 Node
 * 管线相同的调用形态（discovery / translate 直接消费 snake_case 类型）。
 */

import sourcesJson from '../../src/data/sources.json';
import type { SourceConfig } from '../../scripts/update/types';

const sources = sourcesJson as SourceConfig[];

/**
 * 返回所有 `update_mode === 'active'` 的来源。
 * 可选按 id 过滤（用于单来源手动触发）。
 */
export function loadActiveSources(sourceId?: string): SourceConfig[] {
  const active = sources.filter((s) => s.update_mode === 'active');
  if (!sourceId) return active;
  return active.filter((s) => s.id === sourceId);
}
