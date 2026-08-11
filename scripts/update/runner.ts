import { createFetchBackend, type FetchBackend } from './fetch-backend';
import { discoverSource } from './discovery';
import { createTranslateClient } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { selectSourcesForRun } from './source-policy';
import { loadSources } from './config';
import { createFetchImpl } from './network';
import {
  createUpdateRepositories,
  toDomainArticle,
  toDomainSource,
  toDomainTranslation,
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

const DEFAULT_LIMIT_PER_SOURCE = 3;

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

  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = process.env.OPENAI_BASE_URL ?? '';
  const model = process.env.TRANSLATION_MODEL ?? '';
  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      'OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required unless --dry-run is used.',
    );
  }

  const pipeline = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase();
  return pipeline === 'v2'
    ? createTranslateV2Client({ apiKey, baseUrl, model, fetchImpl })
    : createTranslateClient({ apiKey, baseUrl, model, fetchImpl });
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
  const pipeline = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase();

  logger.info(`Blogs Wiki update: ${options.dryRun ? 'dry run (discover + fetch only)' : 'full run'}`);
  logger.info(`Sources: ${sources.map((s) => s.id).join(', ') || '(none)'} | limit per source: ${limit === 0 ? 'unlimited' : limit}`);
  if (!options.dryRun) logger.info(`Translation pipeline: ${pipeline}`);
  if (!options.dryRun) {
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

      const candidates = limit > 0 ? pending.slice(0, limit) : pending;
      logger.info(`[${source.id}] discovered ${discovered.length}, new ${pending.length}, processing ${candidates.length}`);

      for (const item of candidates) {
        try {
          const article: ExtractedArticle = source.prefer_official_zh
            ? await fetchBackend.fetchArticleWithLocalization(source, item, fetchImpl)
            : await fetchBackend.fetchArticle(source, item, fetchImpl);
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
          const translation = await translate(article, CATEGORIES);
          const saved = await repositories.articles.save({
            source: toDomainSource(source),
            article: toDomainArticle(source, article),
            translation: toDomainTranslation(translation),
          });
          await repositories.sourceState.markProcessed(source.id, article.url);
          seenBySource.get(source.id)?.add(article.url);
          if (saved.created) {
            result.processed += 1;
            summary.processed += 1;
            logger.info(`  + ${saved.id} (${translation.translatedTitle})`);
          } else {
            logger.info(`  = already present: ${item.url}`);
          }
        } catch (error) {
          result.failed += 1;
          summary.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`${item.url}: ${message}`);
          logger.error(`  ${item.url}: ${message}`);
        }
      }
    } catch (error) {
      result.failed += 1;
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(message);
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
