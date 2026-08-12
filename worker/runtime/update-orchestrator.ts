/**
 * Worker 更新编排器 —— Phase 7 核心业务逻辑。
 *
 * 这是 `scripts/update/runner.ts` 的 Worker-native 版本。不能直接 import
 * runner.ts（它通过 fetch-backend.ts → fetch.ts 拉入 node:child_process +
 * jsdom），所以这里复用纯业务函数（discovery、translate），用已就绪的 Worker
 * 组件（worker-article、D1 repositories）重新编排同一个循环。
 *
 * 设计要点（手册 §8）：
 * - 编排器是可独立测试的纯业务函数，Workflow 只负责 step.do() 包装。
 * - 单文章失败 try/catch 隔离，不拖垮同来源其他文章（手册 §19）。
 * - 幂等：UNIQUE(source_id, original_url) + sourceState.hasSeen 双保险（§18）。
 * - source_items 记录每篇文章的状态转换，source_runs 记录运行级统计。
 */

import { discoverSource } from '../../scripts/update/discovery';
import { createTranslateClient } from '../../scripts/update/translate';
import { createTranslateV2Client } from '../../scripts/update/translate-v2';
import { CATEGORIES } from '../../src/config/categories';
import {
  fetchWorkerArticle,
  fetchWorkerArticleWithLocalization,
} from '../fetch/worker-article';
import {
  toDomainArticle,
  toDomainSource,
} from '../domain/mappers';
import type { WorkerEnv, WorkerRepositories } from './repositories';
import type { TranslateArticle, FetchLike, SourceConfig } from '../../scripts/update/types';

/** 默认每来源处理上限（与 Node 管线 DEFAULT_LIMIT_PER_SOURCE 一致）。 */
const DEFAULT_LIMIT_PER_SOURCE = 3;

/** Workflow 运行所需的环境变量。 */
export interface OrchestratorEnv extends WorkerEnv {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  TRANSLATION_MODEL: string;
  TRANSLATION_PIPELINE?: string;
}

/** 更新选项（Workflow payload）。 */
export interface UpdateOptions {
  sourceId?: string;
  limit?: number;
  dryRun?: boolean;
}

/** 单来源处理结果。 */
export interface SourceUpdateResult {
  sourceId: string;
  discovered: number;
  pending: number;
  processed: number;
  failed: number;
  errors: string[];
}

/** 全量更新汇总。 */
export interface UpdateSummary {
  sources: SourceUpdateResult[];
  discovered: number;
  pending: number;
  processed: number;
  failed: number;
}

/** 抓取单篇文章的函数签名（与 fetchWorkerArticle 兼容）。 */
export type FetchArticleFn = (
  source: { id: string; homepageUrl: string; preferOfficialZh?: boolean },
  discovered: { url: string; title?: string; publishedAt?: string },
  fetchImpl: FetchLike,
) => Promise<{
  url: string;
  title: string;
  author: string;
  imageUrl: string;
  publishedAt: string;
  originalLanguage: string;
  contentMarkdown: string;
  officialZhUrl?: string;
  contentSource?: 'official-zh' | 'native-zh';
}>;

/** processSource 的依赖选项。 */
export interface ProcessSourceOptions {
  limit?: number;
  translate?: TranslateArticle;
  fetchImpl?: FetchLike;
  /** 发现函数注入点（测试用）；默认用 discovery.ts 的 discoverSource。 */
  discover?: typeof discoverSource;
  /** 文章抓取函数注入点（测试用）；默认按 prefer_official_zh 选择对应函数。 */
  fetchArticle?: FetchArticleFn;
}

/**
 * 从环境变量构造翻译器。
 *
 * 与 runner.ts buildTranslator 同逻辑，但读 env 而非 process.env。
 * dryRun 时返回 undefined（跳过翻译+持久化）。
 */
export function createTranslator(
  env: Pick<OrchestratorEnv, 'OPENAI_API_KEY' | 'OPENAI_BASE_URL' | 'TRANSLATION_MODEL' | 'TRANSLATION_PIPELINE'>,
  dryRun: boolean,
): TranslateArticle | undefined {
  if (dryRun) return undefined;

  const apiKey = env.OPENAI_API_KEY;
  const baseUrl = env.OPENAI_BASE_URL;
  const model = env.TRANSLATION_MODEL;
  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      'OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required unless dryRun is used.',
    );
  }

  const pipeline = (env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase();
  const fetchImpl: FetchLike = fetch;
  return pipeline === 'v2'
    ? createTranslateV2Client({ apiKey, baseUrl, model, fetchImpl })
    : createTranslateClient({ apiKey, baseUrl, model, fetchImpl });
}

/**
 * 处理单个来源：discover → 去重 → 每篇 fetch/translate/persist。
 *
 * 单文章失败不中断同来源其他文章；来源级失败（如 discovery 崩溃）
 * 记为该来源的 failed + errors，调用方（Workflow）决定是否重试。
 */
export async function processSource(
  repos: WorkerRepositories,
  source: SourceConfig,
  options: ProcessSourceOptions,
): Promise<SourceUpdateResult> {
  const result: SourceUpdateResult = {
    sourceId: source.id,
    discovered: 0,
    pending: 0,
    processed: 0,
    failed: 0,
    errors: [],
  };

  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? DEFAULT_LIMIT_PER_SOURCE;

  try {
    // 1. 发现阶段（RSS → Sitemap → 列表页三级）
    const discover = options.discover ?? discoverSource;
    const discovered = await discover(source, fetchImpl);
    result.discovered = discovered.length;

    // 2. 去重：排除已处理过的 URL
    const seen = new Set(await repos.sourceState.listProcessed(source.id));
    const pending = discovered
      .filter((item) => !seen.has(item.url))
      .sort((a, b) => {
        const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bTime - aTime;
      });
    result.pending = pending.length;

    const candidates = limit > 0 ? pending.slice(0, limit) : pending;

    // 3. 逐篇处理
    for (const item of candidates) {
      let sourceItemId: number | undefined;
      try {
        // 记录发现到状态机（幂等）
        const sourceItem = await repos.sourceItems.discover({
          sourceId: source.id,
          originalUrl: item.url,
          title: item.title,
          publishedAt: item.publishedAt,
        });
        sourceItemId = sourceItem.id;

        // 已终态的文章跳过
        if (sourceItem.status === 'published' || sourceItem.status === 'skipped') {
          continue;
        }

        // 抓取 + 提取（Defuddle）
        const workerSource = {
          id: source.id,
          homepageUrl: source.homepage_url,
          ...(source.prefer_official_zh !== undefined
            ? { preferOfficialZh: source.prefer_official_zh }
            : {}),
        };
        const fetchArticle = options.fetchArticle
          ?? (source.prefer_official_zh ? fetchWorkerArticleWithLocalization : fetchWorkerArticle);
        const article = await fetchArticle(workerSource, { url: item.url, title: item.title, publishedAt: item.publishedAt }, fetchImpl);

        // dry-run：只验证抓取，不持久化
        if (!options.translate) {
          continue;
        }

        // 1. 保存原文版本（立即持久化——翻译失败也不丢失原文）
        const saved = await repos.articles.save({
          source: toDomainSource(source),
          article: toDomainArticle(source, article),
        });

        // 2. 翻译 + 分类
        const translation = await options.translate(article, CATEGORIES);

        // 3. 保存翻译版本（原文已在 D1/文件系统中）
        await repos.articles.saveVersion({
          articleId: saved.id,
          language: 'zh-cn',
          title: translation.translatedTitle,
          contentMarkdown: translation.contentMarkdown,
          provenance: translation.translationStatus ?? 'model',
          translationModel: translation.model,
          translatedAt: new Date().toISOString(),
          ...(translation.originalZhUrl ? { originalAltUrl: translation.originalZhUrl } : {}),
          categories: translation.categories,
        });

        // 标记已处理（去重快照——原文+翻译都到位才标记）
        await repos.sourceState.markProcessed(source.id, article.url);

        // 状态机 → published
        await repos.sourceItems.transition(sourceItemId, 'published', {
          articleId: saved.id,
        });

        result.processed += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${item.url}: ${message}`);
        // 记录失败到状态机（best-effort）
        if (sourceItemId !== undefined) {
          try {
            await repos.sourceItems.recordFailure(sourceItemId, message);
          } catch {
            // 失败记录本身失败不影响主循环
          }
        }
      }
    }
  } catch (error) {
    // 来源级失败（通常是 discovery 阶段崩溃）
    result.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
  }

  return result;
}

/** 汇总各来源结果为 UpdateSummary。 */
export function aggregateResults(results: SourceUpdateResult[]): UpdateSummary {
  return results.reduce<UpdateSummary>(
    (acc, r) => {
      acc.sources.push(r);
      acc.discovered += r.discovered;
      acc.pending += r.pending;
      acc.processed += r.processed;
      acc.failed += r.failed;
      return acc;
    },
    { sources: [], discovered: 0, pending: 0, processed: 0, failed: 0 },
  );
}
