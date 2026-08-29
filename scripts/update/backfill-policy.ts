/**
 * Backfill Policy —— 从 docs/ 交接文档（BLOGS_WIKI_BACKFILL_SCOPE_HANDOFF）
 * 提取的首轮原文回填策略，按 source id 落表。
 *
 * 语义（与 handoff §12 对齐，不等同 sources.json schema）：
 * - mode 'all'：当前 discovery 合格索引全量回填。
 * - mode 'since'：只收 since（YYYY-MM-DD，含）之后的合格文章，newest first。
 * - maxArticles：保护阀，不是目标数量；触发时在报告中明示 truncated_by_max。
 * - qualityFilter：回填前需要内容质量过滤（handoff 标 `require_quality_filter` 的源）。
 *
 * split 源（google-deepmind / jay-alammar / andrej-karpathy）在现有 sources.json
 * 只有一个主 discovery 入口，无法从 URL 区分子 channel；policy 里用保守的 since/max
 * 等价覆盖，子索引语义记入 notes，后续接入分 channel discovery 时再细化。
 */

import { urlDateFromPattern } from './url-date';
import type { SourceConfig } from './types';

export interface BackfillPolicy {
  sourceId: string;
  mode: 'all' | 'since';
  /** YYYY-MM-DD，含该日期。 */
  since?: string;
  /** 保护阀；0 = 不限。 */
  maxArticles?: number;
  qualityFilter?: boolean;
  /**
   * 从 URL 推断发布日期的正则（sitemap 无日期时用），必须包含捕获组
   * 年份，可选捕获组月/日，如 /\\/(\\d{4})\\/([A-Z][a-z]{2})\\/(\\d{1,2})\\//。
   */
  urlDatePattern?: string;
  notes?: string;
}

export const BACKFILL_POLICIES: BackfillPolicy[] = [
  { sourceId: 'openai', mode: 'all', notes: '仅当前白名单分类（research/engineering/safety/security）' },
  { sourceId: 'anthropic', mode: 'all', notes: 'Research + Engineering 全量' },
  { sourceId: 'lilian-weng', mode: 'all' },
  { sourceId: 'langchain', mode: 'all', qualityFilter: true, notes: '白名单过滤后全量' },
  { sourceId: 'cursor', mode: 'all', notes: 'Research 分类全量' },
  { sourceId: 'qwen', mode: 'all' },
  { sourceId: 'google-deepmind', mode: 'since', since: '2020-01-01', qualityFilter: true, notes: 'technical blogs 全量 + broad 2020 起' },
  { sourceId: 'microsoft-research', mode: 'all', maxArticles: 500, notes: 'handoff: since 2021；listing 无日期导致 policy 日期过滤误杀，改 all + 页面日期 integrity 把关' },
  { sourceId: 'meta-ai', mode: 'all', maxArticles: 350, qualityFilter: true, notes: 'handoff: since 2020；listing 无日期导致 policy 日期过滤误杀，改 all + 页面日期 integrity 把关' },
  { sourceId: 'eleuther-ai', mode: 'all' },
  { sourceId: 'mistral-ai', mode: 'all', notes: 'Research + Engineering categories' },
  { sourceId: 'sebastian-raschka', mode: 'all' },
  { sourceId: 'hamel-husain', mode: 'all', notes: '主页 long-form 索引' },
  { sourceId: 'jay-alammar', mode: 'all', notes: 'newsletter all；legacy jalammar.github.io 待独立入口' },
  { sourceId: 'andrej-karpathy', mode: 'all', notes: 'bearblog 主 + karpathy.github.io legacy（extra_domains 双域）' },
  { sourceId: 'lastwhisper', mode: 'all', notes: 'handoff 的 keli-wen；2026-08-12 更名 lastwhisper' },
  { sourceId: 'moonshot', mode: 'all' },
  { sourceId: 'github-engineering', mode: 'all' },
  { sourceId: 'google-security', mode: 'since', since: '2018-01-01', maxArticles: 400 },
  { sourceId: 'dan-koe', mode: 'all', qualityFilter: true, notes: '排除纯促销/活动/直播/订阅通知' },
];

export function policyFor(source: SourceConfig): BackfillPolicy | undefined {
  // 优先读 sources.json 的 backfill 字段（配置驱动，新源回填无需改代码）；
  // 否则回退到下方硬编码表（首轮已适配源，向后兼容）。
  if (source.backfill) {
    return {
      sourceId: source.id,
      mode: source.backfill.mode ?? 'all',
      ...(source.backfill.since ? { since: source.backfill.since } : {}),
      ...(source.backfill.max_articles !== undefined ? { maxArticles: source.backfill.max_articles } : {}),
      ...(source.backfill.quality_filter !== undefined ? { qualityFilter: source.backfill.quality_filter } : {}),
      ...(source.url_date_pattern ? { urlDatePattern: source.url_date_pattern } : {}),
    };
  }
  return BACKFILL_POLICIES.find((policy) => policy.sourceId === source.id);
}

export function policyPasses(
  policy: BackfillPolicy,
  publishedAt: string | undefined,
  url?: string,
): boolean {
  if (policy.mode === 'all') return true;
  if (!policy.since) return true;
  const effectiveDate = publishedAt ?? urlDateFromPattern(policy.urlDatePattern, url);
  if (!effectiveDate) return false;
  const sinceTime = Date.parse(policy.since);
  const articleTime = Date.parse(effectiveDate);
  if (Number.isNaN(sinceTime) || Number.isNaN(articleTime)) return true;
  return articleTime >= sinceTime;
}
