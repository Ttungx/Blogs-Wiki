/**
 * 批量翻译：对本地已抓取的原文（is_original 且非 zh）批量生成中文翻译。
 *
 * 复用生产翻译管线（createTranslateClient + FileArticleRepository.saveVersion），
 * 不重新发现/抓取——只处理 `src/content/articles/` 下已有的原文文件。
 *
 * 行为：
 * - 只处理缺少 zh / zh-cn 翻译版本的原文；已有翻译则跳过（断点续传）。
 * - 并发受控（默认 4，远低于 stepfun step_plan 的 100 并发上限；RPM/TPM
 *   由客户端 429 退避兜底）。
 * - 每篇失败记录进错误台账（追加），不中断整批。
 * - 写 zh-cn 版本带 translatedAt（首次写入后不被重译覆盖）。
 *
 * CLI:
 *   npm run translate:batch [-- --source <id>] [--limit <n>] [--concurrency <n>]
 *                           [--report <dir>] [--errors <file>]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslateClient, routeTranslator } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { resolveAiProviderPair, type AiProviderConfig } from './ai-provider';
import { appendErrorLedger, runWithConcurrency } from './concurrency';
import { createFetchImpl } from './network';
import { createUpdateRepositories } from './repository-factory';
import { parseVersionFile } from '../../worker/domain/article';
import { CATEGORIES } from '../../src/config/categories';
import type { ExtractedArticle, Logger } from './types';

const DEFAULT_CONCURRENCY = 2; // 每服务商默认并发 2（用户决策）
const DEFAULT_ERROR_LOG = path.join('docs', 'batch-translate-errors.md');

interface CliOptions {
  sourceId?: string;
  limit?: number;
  concurrency: number;
  reportDir?: string;
  errorLog: string;
  dryRun: boolean;
}

function parseCount(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return Number(value);
}

export function parseTranslateArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    concurrency: DEFAULT_CONCURRENCY,
    errorLog: DEFAULT_ERROR_LOG,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source' || arg === '-s' || arg.startsWith('--source=')) {
      options.sourceId = arg.startsWith('--source=') ? arg.slice('--source='.length) : argv[++index];
      if (!options.sourceId || options.sourceId.startsWith('-')) throw new Error('--source requires a source id');
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      options.limit = parseCount(arg.startsWith('--limit=') ? arg.slice('--limit='.length) : argv[++index], '--limit');
    } else if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      const value = parseCount(arg.startsWith('--concurrency=') ? arg.slice('--concurrency='.length) : argv[++index], '--concurrency');
      if (value === undefined || value < 1 || value > 50) throw new Error('--concurrency requires 1-50');
      options.concurrency = value;
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      const value = arg.startsWith('--report=') ? arg.slice('--report='.length) : argv[++index];
      if (!value || value.startsWith('-')) throw new Error('--report requires a directory path');
      options.reportDir = path.resolve(value);
    } else if (arg === '--errors' || arg.startsWith('--errors=')) {
      const value = arg.startsWith('--errors=') ? arg.slice('--errors='.length) : argv[++index];
      if (!value) throw new Error('--errors requires a file path');
      options.errorLog = value;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run translate:batch -- [options]

Options:
  --source <id>       Only translate articles from this source.
  --limit <n>         Max articles to translate in this run (default: all missing).
  --concurrency <n>   Parallel translation requests (default: ${DEFAULT_CONCURRENCY}, max 50).
  --report <dir>      Write a run report (JSON + Markdown).
  --errors <file>     Error ledger path (default: ${DEFAULT_ERROR_LOG}).
  --dry-run           List what would be translated; do not call the model.
  -h, --help          Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

const consoleLogger: Logger = {
  info(message) { console.log(message); },
  warn(message) { console.warn(`warning: ${message}`); },
  error(message) { console.error(`error: ${message}`); },
};

interface PendingArticle {
  blogId: string;
  articleId: string;
  file: string;
  article: ExtractedArticle;
}

/** 扫描本地原文，找出缺 zh/zh-cn 翻译版本且原文非中文的。 */
async function scanMissingZh(rootDir: string, sourceId?: string): Promise<PendingArticle[]> {
  const articlesDir = path.join(rootDir, 'src', 'content', 'articles');
  const pending: PendingArticle[] = [];
  let blogEntries;
  try {
    blogEntries = await fs.readdir(articlesDir, { withFileTypes: true });
  } catch (error) {
    // 本地无 corpus（如 Render 冷启动 fresh clone、dry-run 环境）＝无事可做，
    // 不能让整条更新链在 set -e 下因此中断。
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return pending;
    throw error;
  }

  for (const blog of blogEntries) {
    if (!blog.isDirectory()) continue;
    if (sourceId && blog.name !== sourceId) continue;
    const blogDir = path.join(articlesDir, blog.name);
    const langEntries = await fs.readdir(blogDir, { withFileTypes: true });
    const langFiles = new Map<string, string[]>();
    for (const lang of langEntries) {
      if (!lang.isDirectory()) continue;
      const files = (await fs.readdir(path.join(blogDir, lang.name))).filter((f) => f.endsWith('.md'));
      langFiles.set(lang.name, files);
    }

    for (const [lang, files] of langFiles) {
      if (lang === 'zh' || lang === 'zh-cn') continue;
      for (const file of files) {
        const filePath = path.join(blogDir, lang, file);
        const content = await fs.readFile(filePath, 'utf8');
        if (!/^is_original:\s*true\s*$/m.test(content)) continue;
        const origLang = content.match(/^original_language: "(.+)"$/m)?.[1] ?? lang;
        if (origLang === 'zh') continue;
        // 已有 zh/zh-cn 翻译则跳过
        const hasZh = ['zh', 'zh-cn'].some((zh) => langFiles.get(zh)?.includes(file));
        if (hasZh) continue;

        const parsed = parseVersionFile(`${blog.name}/${lang}/${file.replace(/\.md$/, '')}`, content);
        if (!parsed) continue;
        const title = parsed.version.title;
        const url = parsed.article.originalUrl;
        const author = parsed.article.author;
        pending.push({
          blogId: blog.name,
          articleId: parsed.article.id,
          file: filePath,
          article: {
            url,
            title,
            ...(author ? { author } : {}),
            ...(parsed.article.imageUrl ? { imageUrl: parsed.article.imageUrl } : {}),
            publishedAt: parsed.article.publishedAt,
            originalLanguage: origLang,
            contentMarkdown: parsed.version.contentMarkdown,
          },
        });
      }
    }
  }
  return pending;
}

async function run() {
  const options = parseTranslateArgs(process.argv.slice(2));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const logger = consoleLogger;

  const provider = resolveAiProviderPair(process.env)[0]; // 兼容旧引用（报错口径由 resolveAiProviderPair 保持）
  if (!options.dryRun) {
    if (!provider.apiKey || !provider.baseUrl || !provider.model) {
      throw new Error('OPENAI_API_KEY, OPENAI_BASE_URL and TRANSLATION_MODEL are required (loaded from .env)');
    }
  }

  const pending = await scanMissingZh(rootDir, options.sourceId);
  const targets = options.limit !== undefined && options.limit > 0
    ? pending.slice(0, options.limit)
    : pending;
  logger.info(`Batch translate: ${targets.length} article(s) need zh (${options.sourceId ?? 'all sources'}) | ` +
    `concurrency=${options.concurrency} dry-run=${options.dryRun}`);

  if (options.dryRun) {
    const bySource = new Map<string, number>();
    for (const item of targets) bySource.set(item.blogId, (bySource.get(item.blogId) ?? 0) + 1);
    logger.info('Would translate (by source):');
    for (const [source, count] of bySource) logger.info(`  ${source}: ${count}`);
    return;
  }

  const fetchImpl = createFetchImpl(logger);
  const forceV2 = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase() === 'v2';
  // 双服务商（用户决策 2026-08-31）：AI_PROVIDER 为主、AI_PROVIDER_FALLBACK 为回退，
  // 池并发 = --concurrency × 服务商数（默认每服务商 2）。
  const providers = resolveAiProviderPair(process.env);
  const makeTranslate = (p: AiProviderConfig) => {
    const common = {
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      model: p.model,
      reasoningEffort: p.reasoningEffort,
      fetchImpl,
    } as const;
    return routeTranslator(createTranslateClient(common), createTranslateV2Client(common), forceV2);
  };
  const translates = providers.map((p) => makeTranslate(p));
  logger.info(`Translation providers: ${providers.map((p) => p.model).join(' → ')}（主→回退）`);
  logger.info(`Translation pipeline: ${forceV2 ? 'v2 (forced)' : 'v1 whole-article (v2 fallback >100k chars)'}`);
  const repositories = createUpdateRepositories({ rootDir, backend: 'file' });

  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const startedAt = new Date().toISOString();

  await runWithConcurrency(targets, options.concurrency * translates.length, async (item) => {
    let lastError: unknown;
    for (let i = 0; i < translates.length; i += 1) {
      try {
        const translation = await translates[i](item.article, CATEGORIES);
        await repositories.articles.saveVersion({
          articleId: item.articleId,
          language: 'zh-cn',
          title: translation.translatedTitle,
          contentMarkdown: translation.contentMarkdown,
          provenance: 'model',
          translationModel: translation.model,
          translatedAt: new Date().toISOString(),
          categories: translation.categories,
        });
        success += 1;
        logger.info(`  + ${item.articleId} (${translation.translatedTitle})`);
        return;
      } catch (error) {
        lastError = error;
        if (i < translates.length - 1) {
          logger.warn(`  ! ${item.articleId}: ${providers[i].model} 失败，回退 ${providers[i + 1].model}（${error instanceof Error ? error.message.slice(0, 80) : error}）`);
        }
      }
    }
    failed += 1;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    errors.push(`${item.articleId} | ${item.article.url}: ${message}`);
    logger.error(`  - ${item.articleId}: ${message}`);
  });

  const finishedAt = new Date().toISOString();
  logger.info('');
  logger.info(`Done: translated=${success} failed=${failed}`);
  logger.info(`Error ledger appended: ${options.errorLog}`);

  if (errors.length > 0) {
    const section = [
      `## ${finishedAt}（${options.sourceId ?? 'all sources'} · concurrency=${options.concurrency}）`,
      '',
      `- 本次翻译：成功 ${success} / 失败 ${failed}`,
      '',
      ...errors.map((error) => `- \`${error}\``),
      '',
    ].join('\n');
    await appendErrorLedger(rootDir, options.errorLog, '# 批量翻译错误记录\n\n', section);
  }

  if (options.reportDir) {
    await fs.mkdir(options.reportDir, { recursive: true });
    const report = {
      startedAt,
      finishedAt,
      sourceId: options.sourceId ?? null,
      concurrency: options.concurrency,
      translated: success,
      failed,
      errors,
    };
    await fs.writeFile(
      path.join(options.reportDir, 'batch-translate-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    logger.info(`Report written: ${options.reportDir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`batch-translate: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
