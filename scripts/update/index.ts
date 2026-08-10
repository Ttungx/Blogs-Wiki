import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSource } from './discovery';
import { fetchArticle, fetchArticleWithLocalization } from './fetch';
import { createTranslateClient } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { selectSourcesForRun } from './source-policy';
import { loadSources } from './config';
import { createFetchImpl } from './network';
import { CATEGORIES } from '../../src/config/categories';
import {
  isProcessed,
  frontmatterValue,
  loadProcessedState,
  markProcessed,
  saveProcessedState,
  writeArticle,
} from './persist';
import type {
  ExtractedArticle,
  Logger,
  ProcessedUrlState,
  SourceConfig,
  UpdateSummary,
} from './types';

const DEFAULT_LIMIT_PER_SOURCE = 3;

interface CliOptions {
  dryRun: boolean;
  sourceId?: string;
  limit?: number;
}

function parseLimit(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('--limit requires a non-negative integer (0 = unlimited)');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('--limit is outside the supported integer range');
  }
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--source' || arg === '-s' || arg.startsWith('--source=')) {
      if (arg.startsWith('--source=')) {
        options.sourceId = arg.slice('--source='.length);
      } else {
        i += 1;
        options.sourceId = argv[i];
      }
      if (!options.sourceId || options.sourceId.startsWith('-')) {
        throw new Error('--source requires a source id');
      }
    } else if (arg === '--limit' || arg === '-l' || arg.startsWith('--limit=')) {
      if (arg.startsWith('--limit=')) {
        options.limit = parseLimit(arg.slice('--limit='.length));
      } else {
        i += 1;
        options.limit = parseLimit(argv[i]);
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run update -- [options]

Options:
  --dry-run             Discover and fetch only; do not call the translation
                        model and do not write any files.
  --source <id>         Update a single source by id (default: all sources).
  --limit <n>           Max new articles per source (default: ${DEFAULT_LIMIT_PER_SOURCE}; 0 = unlimited).
  -h, --help            Show this help.

Environment:
  OPENAI_API_KEY        API key for the OpenAI-compatible endpoint.
  OPENAI_BASE_URL       Base URL, e.g. https://api.openai.com/v1.
  TRANSLATION_MODEL     Model identifier, recorded on each article.`);
    console.log(`  USE_PROXY             Set to "true" to route requests through PROXY_URL.
  PROXY_URL             HTTP proxy, e.g. http://127.0.0.1:7897.`);
      process.exit(0);
    }
  }

  return options;
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

async function reconcileProcessed(
  rootDir: string,
  sources: SourceConfig[],
  state: ProcessedUrlState,
  logger: Logger,
): Promise<number> {
  const articlesDir = path.join(rootDir, 'src', 'content', 'articles');
  let files: string[];
  try {
    files = await fs.readdir(articlesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }

  const knownIds = new Set(sources.map((source) => source.id));
  let reconciled = 0;
  for (const file of files.filter((name) => name.endsWith('.md'))) {
    const content = await fs.readFile(path.join(articlesDir, file), 'utf8');
    const blogId = frontmatterValue(content, 'blog_id');
    const url = frontmatterValue(content, 'original_url');
    if (!blogId || !url || !knownIds.has(blogId)) continue;
    if (!isProcessed(state, blogId, url)) {
      markProcessed(state, blogId, url);
      reconciled += 1;
    }
  }
  if (reconciled > 0) logger.info(`reconciled ${reconciled} processed URL(s) from existing article files`);
  return reconciled;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const logger = consoleLogger;

  const sources = await loadSources(rootDir);
  if (options.sourceId) {
    const matched = sources.filter((source) => source.id === options.sourceId);
    if (!matched.length) {
      logger.error(`Unknown source id "${options.sourceId}". Available: ${sources.map((s) => s.id).join(', ')}`);
      process.exit(1);
    }
    sources.splice(0, sources.length, ...matched);
  }

  const selection = selectSourcesForRun(sources, options.dryRun);
  if (!options.dryRun && options.sourceId && selection.skipped.length > 0) {
    logger.error(
      `Source "${options.sourceId}" is dry-run-only; use npm run update:dry -- --source ${options.sourceId}.`,
    );
    process.exit(1);
  }
  sources.splice(0, sources.length, ...selection.runnable);
  if (selection.skipped.length > 0) {
    logger.info(
      `Skipping ${selection.skipped.length} dry-run-only source(s): ${selection.skipped.map((source) => source.id).join(', ')}`,
    );
  }
  if (sources.length === 0) {
    logger.info('No active sources selected; nothing to update.');
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = process.env.OPENAI_BASE_URL ?? '';
  const model = process.env.TRANSLATION_MODEL ?? '';

  if (!options.dryRun && (!apiKey || !baseUrl || !model)) {
    logger.error(
      'OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required unless --dry-run is used.',
    );
    process.exit(1);
  }

  const state = await loadProcessedState(rootDir);
  const reconciled = await reconcileProcessed(rootDir, sources, state, logger);
  let stateChanged = reconciled > 0;
  const limit = options.limit === undefined ? DEFAULT_LIMIT_PER_SOURCE : options.limit;
  const fetchImpl = createFetchImpl(logger);
  const pipeline = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase();
  const translate = options.dryRun
    ? undefined
    : pipeline === 'v2'
      ? createTranslateV2Client({ apiKey, baseUrl, model, fetchImpl })
      : createTranslateClient({ apiKey, baseUrl, model, fetchImpl });

  logger.info(`Blogs Wiki update: ${options.dryRun ? 'dry run (discover + fetch only)' : 'full run'}`);
  logger.info(`Sources: ${sources.map((s) => s.id).join(', ') || '(none)'} | limit per source: ${limit === 0 ? 'unlimited' : limit}`);
  if (!options.dryRun) logger.info(`Translation pipeline: ${pipeline}`);
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
      const discovered = await discoverSource(source, fetchImpl);
      result.discovered = discovered.length;

      const pending = discovered
        .filter((item) => !isProcessed(state, source.id, item.url))
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
            ? await fetchArticleWithLocalization(source, item, fetchImpl)
            : await fetchArticle(source, item, fetchImpl);
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
          const written = await writeArticle(rootDir, source, article, translation);
          if (written.created) {
            markProcessed(state, source.id, article.url);
            stateChanged = true;
            result.processed += 1;
            summary.processed += 1;
            logger.info(`  + ${written.slug} (${translation.translatedTitle})`);
          } else {
            markProcessed(state, source.id, article.url);
            stateChanged = true;
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

  if (stateChanged && !options.dryRun) {
    state.updated_at = new Date().toISOString();
    await saveProcessedState(rootDir, state);
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
