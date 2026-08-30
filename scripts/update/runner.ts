import { createFetchBackend, type FetchBackend } from './fetch-backend';
import { fetchKnownRemoteUrls, reportRejectedUrls, type RejectedItem } from './dedupe';
import { discoverSource } from './discovery';
import { createTranslateClient, routeTranslator } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { resolveAiProvider } from './ai-provider';
import { selectSourcesForRun } from './source-policy';
import { loadSources } from './config';
import { createFetchImpl } from './network';
import {
  createUpdateRepositories,
  toDomainArticle,
  toDomainSource,
} from './repository-factory';
import type { UpdateRepositories } from './repository-factory';
import type {
  DiscoveredArticle,
  ExtractedArticle,
  FetchLike,
  Logger,
  SourceConfig,
  TranslateArticle,
  UpdateSummary,
} from './types';
import { CATEGORIES } from '../../src/config/categories';
import { DEFAULT_LIMIT_PER_SOURCE } from './constants';
import { checkArticleIntegrity } from './backfill-integrity';
import { appendShadowRecord, evaluateQualityGate, resolveQualityGateMode, type QualityVerdict } from './quality-model';

/** 质量门禁失败（永久）：内容不合格，标记处理避免下轮重抓。 */
class IntegrityGateError extends Error {
  constructor(readonly codes: string[]) {
    super(`integrity gate failed: ${codes.join(', ')}`);
    this.name = 'IntegrityGateError';
  }
}

/** 质量模型自动拒绝（plan §30 可恢复：不写 processed 终态，仅进 90 天负缓存）。 */
class QualityGateError extends Error {
  constructor(readonly verdict: QualityVerdict) {
    super(`quality gate rejected: score=${verdict.score.toFixed(4)} (model ${verdict.modelVersion})`);
    this.name = 'QualityGateError';
  }
}

const consoleLogger: Logger = {
  info(message) {
    console.log(message);
  },
  warn(message) {
    console.warn(`warning: ${message}`);
  },
  error(message) {
    console.error(`error: ${message}`);
  },
};

export interface UpdateRunnerOptions {
  rootDir: string;
  dryRun: boolean;
  sourceId?: string;
  limit?: number;
  /** Tests and future Worker/Workflow callers can provide already-loaded sources. */
  sources?: SourceConfig[];
  logger?: Logger;
  repositories?: UpdateRepositories;
  fetchImpl?: FetchLike;
  fetchBackend?: FetchBackend;
  discover?: UpdateDiscovery;
  translate?: TranslateArticle;
}

async function initializeSeenUrls(
  repositories: UpdateRepositories,
  sources: SourceConfig[],
  logger: Logger,
  persistReconciliation: boolean,
): Promise<Map<string, Set<string>>> {
  const knownIds = new Set(sources.map((source) => source.id));
  const seenBySource = new Map<string, Set<string>>();
  for (const source of sources) {
    seenBySource.set(source.id, new Set(await repositories.sourceState.listProcessed(source.id)));
  }

  const entries = (await repositories.articles.listAll())
    .filter((article) => knownIds.has(article.sourceId))
    .map((article) => ({ sourceId: article.sourceId, url: article.originalUrl }));
  const reconciled = persistReconciliation
    ? await repositories.sourceState.reconcile(entries)
    : entries.reduce((count, entry) => {
        const seen = seenBySource.get(entry.sourceId);
        if (!seen || seen.has(entry.url)) return count;
        seen.add(entry.url);
        return count + 1;
      }, 0);

  if (persistReconciliation) {
    for (const entry of entries) {
      seenBySource.get(entry.sourceId)?.add(entry.url);
    }
  }
  if (reconciled > 0) {
    logger.info(`reconciled ${reconciled} processed URL(s) from existing article records`);
  }
  return seenBySource;
}

function buildTranslator(
  dryRun: boolean,
  injected: TranslateArticle | undefined,
  fetchImpl: FetchLike,
): TranslateArticle | undefined {
  if (dryRun) return undefined;
  if (injected) return injected;

  // AI_PROVIDER 未设时回落平铺变量，报错口径不变。
  const provider = resolveAiProvider(process.env);
  if (!provider.apiKey || !provider.baseUrl || !provider.model) {
    throw new Error(
      'OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required unless --dry-run is used.',
    );
  }
  const { apiKey, baseUrl, model } = provider;

  const reasoningEffort = provider.reasoningEffort;
  // 默认 V1 整篇一次（吞吐高）；TRANSLATION_PIPELINE=v2 强制 V2；超长（>100K 字符）兜底 V2。
  const forceV2 = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase() === 'v2';
  const v1 = createTranslateClient({ apiKey, baseUrl, model, fetchImpl, reasoningEffort });
  const v2 = createTranslateV2Client({ apiKey, baseUrl, model, fetchImpl, reasoningEffort });
  return routeTranslator(v1, v2, forceV2);
}

/** 门禁拒绝上报端点：由 CONTENT_SYNC_URL 派生（…/api/content-sync/items/）。 */
function rejectionEndpoint(): string {
  const base = (process.env.CONTENT_SYNC_URL ?? '').trim();
  if (!base) return '';
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  try {
    return new URL('items/', withSlash).toString();
  } catch {
    return '';
  }
}

function selectSources(
  input: SourceConfig[],
  sourceId: string | undefined,
  dryRun: boolean,
  logger: Logger,
): SourceConfig[] {
  let sources = [...input];
  if (sourceId) {
    const matched = sources.filter((source) => source.id === sourceId);
    if (!matched.length) {
      throw new Error(`Unknown source id "${sourceId}". Available: ${sources.map((s) => s.id).join(', ')}`);
    }
    sources = matched;
  }

  const selection = selectSourcesForRun(sources, dryRun);
  if (!dryRun && sourceId && selection.skipped.length > 0) {
    throw new Error(
      `Source "${sourceId}" is dry-run-only; use npm run update:dry -- --source ${sourceId}.`,
    );
  }
  if (selection.skipped.length > 0) {
    logger.info(
      `Skipping ${selection.skipped.length} dry-run-only source(s): ${selection.skipped.map((source) => source.id).join(', ')}`,
    );
  }
  return selection.runnable;
}

export async function runUpdate(options: UpdateRunnerOptions): Promise<UpdateSummary> {
  const logger = options.logger ?? consoleLogger;
  const loadedSources = options.sources ?? await loadSources(options.rootDir);
  const sources = selectSources(loadedSources, options.sourceId, options.dryRun, logger);

  if (sources.length === 0) {
    logger.info('No active sources selected; nothing to update.');
    return { sources: [], discovered: 0, pending: 0, processed: 0, failed: 0 };
  }

  const repositories = options.repositories ?? createUpdateRepositories({
    rootDir: options.rootDir,
    backend: options.dryRun ? 'file' : process.env.STORAGE_BACKEND,
  });
  const seenBySource = await initializeSeenUrls(
    repositories,
    sources,
    logger,
    !options.dryRun,
  );
  const limit = options.limit === undefined ? DEFAULT_LIMIT_PER_SOURCE : options.limit;
  const fetchImpl = options.fetchImpl ?? createFetchImpl(logger);
  const fetchBackend = options.fetchBackend ?? createFetchBackend(process.env.FETCH_BACKEND);
  const translate = buildTranslator(options.dryRun, options.translate, fetchImpl);

  logger.info(`Blogs Wiki update: ${options.dryRun ? 'dry run (discover + fetch only)' : 'full run'}`);
  logger.info(`Sources: ${sources.map((s) => s.id).join(', ') || '(none)'} | limit per source: ${limit === 0 ? 'unlimited' : limit}`);
  if (!options.dryRun) {
    const forceV2 = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase() === 'v2';
    logger.info(`Translation pipeline: ${forceV2 ? 'v2 (forced)' : 'v1 whole-article (v2 fallback >100K chars)'}`);
    logger.info(`Storage backend: ${(process.env.STORAGE_BACKEND ?? 'file').trim().toLowerCase()}`);
  }
  logger.info(`Fetch backend: ${fetchBackend.name}`);
  logger.info('');

  const summary: UpdateSummary = { sources: [], discovered: 0, pending: 0, processed: 0, failed: 0 };

  for (const source of sources) {
    const result: UpdateSummary['sources'][number] = {
      sourceId: source.id,
      discovered: 0,
      pending: 0,
      processed: 0,
      failed: 0,
      errors: [],
    };
    summary.sources.push(result);

    try {
      const discovered = await (options.discover ?? discoverSource)(source, fetchImpl);
      result.discovered = discovered.length;

      // 无状态运行环境（Render 容器等）：本地 processed-urls 为空时，
      // 用 D1 check 预检过滤已存在文章，避免重复抓取+翻译。fail-open：
      // 预检失败只告警不过滤，正确性由 content-sync 幂等写入兜底。
      const checkEndpoint = (process.env.CONTENT_SYNC_CHECK_URL ?? '').trim();
      if (!options.dryRun && checkEndpoint && discovered.length > 0) {
        const knownRemote = await fetchKnownRemoteUrls({
          endpoint: checkEndpoint,
          token: (process.env.CONTENT_SYNC_TOKEN ?? '').trim(),
          sourceId: source.id,
          urls: discovered.map((item) => item.url),
          fetchImpl,
          logger,
        });
        if (knownRemote.size > 0) {
          const seen = seenBySource.get(source.id);
          for (const url of knownRemote) seen?.add(url);
          logger.info(`[${source.id}] remote dedupe: ${knownRemote.size} URL(s) already known (published or rejected), filtered`);
        }
      }

      const pending = discovered
        .filter((item) => !(seenBySource.get(source.id) ?? new Set()).has(item.url))
        .sort((a, b) => {
          const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
          const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
          return bTime - aTime;
        });
      result.pending = pending.length;
      summary.discovered += discovered.length;
      summary.pending += pending.length;

      const perSourceLimit = options.limit ?? source.limit ?? DEFAULT_LIMIT_PER_SOURCE;
      const candidates = perSourceLimit > 0 ? pending.slice(0, perSourceLimit) : pending;
      logger.info(`[${source.id}] discovered ${discovered.length}, new ${pending.length}, processing ${candidates.length}`);

      const integrityRejections: RejectedItem[] = [];
      for (const item of candidates) {
        try {
          const article: ExtractedArticle = source.prefer_official_zh
            ? await fetchBackend.fetchArticleWithLocalization(source, item, fetchImpl)
            : await fetchBackend.fetchArticle(source, item, fetchImpl);

          // 入库前质量门禁（与 backfill 共用 checkArticleIntegrity）：
          // 模板页 / 导航列表 / 促销页 / 无标题 / 无日期 / 图片相对 URL 不入库。
          const { issues } = checkArticleIntegrity(article, source);
          const blocking = issues.filter((issue) => issue.severity === 'error');
          if (blocking.length > 0) {
            throw new IntegrityGateError(blocking.map((issue) => issue.code));
          }

          // 质量模型门禁（plan §28/§29）：QUALITY_GATE_MODE 默认 off——不加载模型、
          // 行为与未接入完全一致；shadow 记录 wouldReject；enforce 才阻塞，
          // 且拒绝可恢复（不写 processed 终态，90 天负缓存过期后随模型升级重新评估）。
          const gateMode = resolveQualityGateMode();
          const gate = evaluateQualityGate(article, gateMode, {
            log: (m) => logger.warn(`  ${item.url}: ${m}`),
            url: item.url,
          });
          if (gateMode === 'shadow') {
            appendShadowRecord({
              sourceId: source.id,
              url: item.url,
              title: article.title,
              score: gate.verdict.score,
              wouldReject: gate.verdict.decision === 'reject',
              modelVersion: gate.verdict.modelVersion,
              threshold: gate.verdict.threshold,
              at: new Date().toISOString(),
            });
          }
          if (gate.blocked) {
            throw new QualityGateError(gate.verdict);
          }

          if (!translate) {
            logger.info(
              source.update_mode === 'dry-run-only'
                ? `  scaffold validated (translation disabled): ${item.url}`
                : `  would translate + persist: ${item.url}`,
            );
            logger.info(
              `    title=${article.title} date=${article.publishedAt || 'unknown'} ` +
              `lang=${article.originalLanguage} markdown=${article.contentMarkdown.length} chars`,
            );
            continue;
          }
          // 1. 保存原文版本（立即持久化——翻译失败也不丢失）
          const saved = await repositories.articles.save({
            source: toDomainSource(source),
            article: toDomainArticle(source, article),
          });
          // 原文已落盘即标记处理：翻译失败靠 batch-translate 定期补，不再因
          // reconcile 把原文 URL 回填 seen 而形成「半成品黑洞」（缺中文版被挡住）。
          await repositories.sourceState.markProcessed(source.id, article.url);
          seenBySource.get(source.id)?.add(article.url);
          // 2. 翻译 + 分类
          const translation = await translate(article, CATEGORIES);
          // 3. 保存翻译版本
          await repositories.articles.saveVersion({
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
          result.processed += 1;
          summary.processed += 1;
          logger.info(`  + ${saved.id} (${translation.translatedTitle})`);
        } catch (error) {
          result.failed += 1;
          summary.failed += 1;
          if (error instanceof IntegrityGateError) {
            // 内容不合格（永久）：非 dry-run 时标记处理避免下轮重抓。
            if (!options.dryRun) {
              await repositories.sourceState.markProcessed(source.id, item.url);
              seenBySource.get(source.id)?.add(item.url);
            }
            integrityRejections.push({ url: item.url, code: error.codes.join(', ') });
            result.errors.push({
              url: item.url,
              kind: 'integrity',
              code: error.codes.join(', '),
              message: error.message,
            });
            logger.warn(`  ${item.url}: ${error.message} (content rejected; will not retry)`);
          } else if (error instanceof QualityGateError) {
            // 质量模型拒绝（plan §30 可恢复）：不 markProcessed，只上报负缓存
            // （90 天 TTL），模型升级后自动重新评估；code 记录模型版本与分数供审计。
            const code = `quality-model:${error.verdict.modelVersion} score=${error.verdict.score.toFixed(4)}`;
            if (!options.dryRun) {
              integrityRejections.push({ url: item.url, code });
              seenBySource.get(source.id)?.add(item.url);
            }
            result.errors.push({ url: item.url, kind: 'quality-model', code, message: error.message });
            logger.warn(`  ${item.url}: ${error.message} (quality rejected; negative-cached 90d)`);
          } else {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push({ url: item.url, kind: 'fatal', message });
            logger.error(`  ${item.url}: ${message}`);
          }
        }
      }

      // 门禁拒绝上报 D1 负缓存（fail-open）：后续轮次的 check 预检会在
      // 抓取前过滤这些 URL，消除容器状态重置后的「重抓 → 再拒」循环。
      if (!options.dryRun && integrityRejections.length > 0) {
        await reportRejectedUrls({
          endpoint: rejectionEndpoint(),
          token: (process.env.CONTENT_SYNC_TOKEN ?? '').trim(),
          sourceId: source.id,
          items: integrityRejections,
          fetchImpl,
          logger,
        });
      }
    } catch (error) {
      result.failed += 1;
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      // 源级失败（发现/整体异常）没有单一 URL；url 留空表示 source 级。
      result.errors.push({ url: '', kind: 'fatal', message });
      logger.error(`[${source.id}] ${message}`);
    }
  }

  logger.info('');
  logger.info('Summary:');
  for (const result of summary.sources) {
    logger.info(
      `  ${result.sourceId}: discovered=${result.discovered} new=${result.pending} processed=${result.processed} failed=${result.failed}`,
    );
  }
  logger.info(
    `Total: discovered=${summary.discovered} new=${summary.pending} processed=${summary.processed} failed=${summary.failed}`,
  );
  if (options.dryRun) logger.info('Dry run: no files written, no translation calls made.');
  if (summary.failed > 0) logger.warn(`${summary.failed} item(s) failed; see errors above.`);
  return summary;
}

export type UpdateDiscovery = (
  source: SourceConfig,
  fetchImpl: FetchLike,
) => Promise<DiscoveredArticle[]>;
