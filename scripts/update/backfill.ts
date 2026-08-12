/**
 * 首轮原文批量回填（Original Backfill）。
 *
 * 依据 docs/ 交接文档（BLOGS_WIKI_BACKFILL_SCOPE_HANDOFF）执行：
 * 对每个目标源按 backfill policy 发现候选 → 过滤 → newest first → 有界并发
 * 抓取原文（Defuddle worker backend，不翻译）→ 完整性门禁 → 持久化原文版本。
 *
 * 行为约定：
 * - 默认删除该源本地 `src/content/articles/<id>/` 后整源重抓（用户要求
 *   "本地已经有的文章删掉，重新获取原文"）；--keep-existing 可跳过删除。
 * - 单篇失败（网络 / 提取 / 完整性 error）记录进错误文档（默认
 *   docs/backfill-errors.md），跳过该篇，不终止整源。
 * - 本轮不调用翻译模型（handoff §8）。
 * - processed-urls.json 在每源成功后更新，供后续增量更新去重。
 *
 * CLI:
 *   npm run backfill [-- --source <id> | --wave <n>] [--limit <n>]
 *                    [--dry-run] [--keep-existing] [--report <dir>]
 *                    [--errors <file>] [--concurrency <n>]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from './config';
import { diagnoseSourceDiscovery } from './discovery';
import { createFetchBackend, type FetchBackend } from './fetch-backend';
import { createFetchImpl } from './network';
import {
  createUpdateRepositories,
  toDomainArticle,
  toDomainSource,
} from './repository-factory';
import { policyFor, policyPasses, type BackfillPolicy } from './backfill-policy';
import { checkArticleIntegrity, type ContentStats } from './backfill-integrity';
import { urlDateFromPattern } from './url-date';
import {
  loadProcessedState,
  markProcessed,
  saveProcessedState,
} from './persist';
import type {
  DiscoveredArticle,
  ExtractedArticle,
  FetchLike,
  Logger,
  SourceConfig,
} from './types';

const WAVES: Record<number, string[]> = {
  0: ['lilian-weng', 'qwen', 'cursor', 'eleuther-ai', 'andrej-karpathy', 'keli-wen', 'moonshot'],
  1: ['anthropic', 'mistral-ai', 'sebastian-raschka', 'hamel-husain', 'jay-alammar', 'github-engineering', 'dan-koe', 'langchain'],
  2: ['openai', 'hugging-face', 'google-deepmind', 'cloudflare'],
  3: ['simon-willison', 'microsoft-research', 'google-research', 'meta-ai', 'meta-engineering', 'google-security'],
};

const DEFAULT_ERROR_LOG = path.join('docs', 'backfill-errors.md');
const DEFAULT_CONCURRENCY = 3;

interface CliOptions {
  sourceId?: string;
  wave?: number;
  dryRun: boolean;
  limit?: number;
  reportDir?: string;
  errorLog: string;
  keepExisting: boolean;
  concurrency: number;
  /** 并行 subagent 各自使用独立 processed 状态文件，避免并发覆盖；主 agent 最后合并。 */
  stateFile?: string;
}

function parseCount(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return Number(value);
}

export function parseBackfillArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    errorLog: DEFAULT_ERROR_LOG,
    keepExisting: false,
    concurrency: DEFAULT_CONCURRENCY,
    stateFile: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source' || arg === '-s' || arg.startsWith('--source=')) {
      options.sourceId = arg.startsWith('--source=') ? arg.slice('--source='.length) : argv[++index];
      if (!options.sourceId || options.sourceId.startsWith('-')) throw new Error('--source requires a source id');
    } else if (arg === '--wave' || arg.startsWith('--wave=')) {
      const raw = arg.startsWith('--wave=') ? arg.slice('--wave='.length) : argv[++index];
      const wave = Number(raw);
      if (!Number.isInteger(wave) || !(wave in WAVES)) {
        throw new Error(`--wave requires 0-${Object.keys(WAVES).length - 1}`);
      }
      options.wave = wave;
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      options.limit = parseCount(arg.startsWith('--limit=') ? arg.slice('--limit='.length) : argv[++index], '--limit');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--keep-existing') {
      options.keepExisting = true;
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      const value = arg.startsWith('--report=') ? arg.slice('--report='.length) : argv[++index];
      if (!value || value.startsWith('-')) throw new Error('--report requires a directory path');
      options.reportDir = path.resolve(value);
    } else if (arg === '--errors' || arg.startsWith('--errors=')) {
      const value = arg.startsWith('--errors=') ? arg.slice('--errors='.length) : argv[++index];
      if (!value) throw new Error('--errors requires a file path');
      options.errorLog = value;
    } else if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      const value = parseCount(arg.startsWith('--concurrency=') ? arg.slice('--concurrency='.length) : argv[++index], '--concurrency');
      if (value === undefined || value < 1 || value > 10) throw new Error('--concurrency requires 1-10');
      options.concurrency = value;
    } else if (arg === '--state-file' || arg.startsWith('--state-file=')) {
      const value = arg.startsWith('--state-file=') ? arg.slice('--state-file='.length) : argv[++index];
      if (!value || value.startsWith('-')) throw new Error('--state-file requires a file path');
      options.stateFile = value;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run backfill -- [options]

Options:
  --source <id>       Backfill a single source by id.
  --wave <n>          Backfill a predefined wave (0-${Object.keys(WAVES).length - 1}).
  --limit <n>         Per-source cap override (0 = unlimited; default from policy).
  --dry-run           Discover + fetch + integrity check only; delete nothing, write nothing.
  --keep-existing     Keep existing local article files (do not delete before refetch).
  --report <dir>      Write per-source manifest/report JSON + aggregate Markdown.
  --errors <file>     Error ledger path (default: ${DEFAULT_ERROR_LOG}).
  --concurrency <n>   Bounded fetch concurrency per source (default: ${DEFAULT_CONCURRENCY}, max 10).
  --state-file <path> Use an isolated processed-state file (parallel subagents).
  -h, --help          Show this help.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.sourceId && options.wave !== undefined) {
    throw new Error('--source and --wave are mutually exclusive');
  }
  if (!options.sourceId && options.wave === undefined) {
    throw new Error('--source or --wave is required');
  }
  return options;
}

const consoleLogger: Logger = {
  info(message) { console.log(message); },
  warn(message) { console.warn(`warning: ${message}`); },
  error(message) { console.error(`error: ${message}`); },
};

interface SourceBackfillResult {
  sourceId: string;
  policy: BackfillPolicy | undefined;
  discovered: number;
  eligibleByPolicy: number;
  skippedByDate: number;
  truncatedByMax: number;
  duplicates: number;
  fetchedSuccess: number;
  fetchedFailed: number;
  earliestSaved: string | null;
  latestSaved: string | null;
  mathArticles: number;
  tableArticles: number;
  imageArticles: number;
  errors: BackfillError[];
  manifest: DiscoveredArticle[];
  /** 本次成功持久化的原文 URL（写入 processed 状态）。 */
  processedUrls: string[];
}

/** 结构化错误记录：单篇失败或源级失败。 */
export interface BackfillError {
  url: string;
  kind: 'fetch' | 'integrity' | 'fatal';
  /** 完整性门禁错误码（integrity 类）。 */
  code?: string;
  message: string;
  /** 完整性门禁的严重度（error / warn）。 */
  severity?: 'error' | 'warn';
}

interface BackfillErrorEntry {
  sourceId: string;
  error: BackfillError;
}

function sortNewestFirst(items: DiscoveredArticle[]): DiscoveredArticle[] {
  return [...items].sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) || 0 : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) || 0 : 0;
    return rightTime - leftTime;
  });
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function backfillSource(
  source: SourceConfig,
  options: CliOptions,
  rootDir: string,
  fetchImpl: FetchLike,
  fetchBackend: FetchBackend,
  logger: Logger,
): Promise<SourceBackfillResult> {
  const policy = policyFor(source);
  const result: SourceBackfillResult = {
    sourceId: source.id,
    policy,
    discovered: 0,
    eligibleByPolicy: 0,
    skippedByDate: 0,
    truncatedByMax: 0,
    duplicates: 0,
    fetchedSuccess: 0,
    fetchedFailed: 0,
    earliestSaved: null,
    latestSaved: null,
    mathArticles: 0,
    tableArticles: 0,
    imageArticles: 0,
    errors: [],
    manifest: [],
    processedUrls: [],
  };

  // Backfill 使用「合并发现」：RSS + sitemap + listing + api 全部入口取并集
  // 去重，而不是单入口第一个非空即停（后者在 RSS 只有 20 条时会漏掉
  // sitemap 里的历史文章，例如 cloudflare）。
  const diagnostic = await diagnoseSourceDiscovery(source, fetchImpl);
  const discovered = diagnostic.candidates;
  result.discovered = discovered.length;

  // Policy 过滤（since / max / quality）。
  const eligible: DiscoveredArticle[] = [];
  for (const item of discovered) {
    if (!policy) {
      eligible.push(item);
      continue;
    }
    if (!policyPasses(policy, item.publishedAt, item.url)) {
      result.skippedByDate += 1;
      continue;
    }
    eligible.push(item);
  }
  result.eligibleByPolicy = eligible.length;

  const sorted = sortNewestFirst(eligible);
  const cap = options.limit !== undefined
    ? options.limit
    : (policy?.maxArticles && policy.maxArticles > 0 ? policy.maxArticles : 0);
  const candidates = cap > 0 ? sorted.slice(0, cap) : sorted;
  result.truncatedByMax = cap > 0 && sorted.length > cap ? sorted.length - cap : 0;
  result.manifest = candidates;

  logger.info(`[${source.id}] discovered=${result.discovered} eligible=${result.eligibleByPolicy} ` +
    `skipped_by_date=${result.skippedByDate} truncated_by_max=${result.truncatedByMax} candidates=${candidates.length}`);

  const repositories = options.dryRun ? null : createUpdateRepositories({ rootDir, backend: 'file' });

  if (!options.dryRun && !options.keepExisting) {
    await removeSourceOriginalFiles(rootDir, source.id);
    logger.info(`[${source.id}] deleted existing local articles (refetch)`);
  }

  // 有界并发抓取原文（不翻译）。
  await runWithConcurrency(candidates, options.concurrency, async (candidate) => {
    const key = candidate.url;
    try {
      const article: ExtractedArticle = source.prefer_official_zh
        ? await fetchBackend.fetchArticleWithLocalization(source, candidate, fetchImpl)
        : await fetchBackend.fetchArticle(source, candidate, fetchImpl);

      // 二次日期校验：policy 基于 discovery 日期（可能是 sitemap lastmod /
      // 最近修改时间）过滤，但页面解析出的真实发布日期可能更早（如
      // meta-engineering 的 sitemap lastmod 2020+、页面真实 2012）。若真实
      // 日期早于 policy.since，视为超出回填范围，跳过并记录。
      if (policy?.mode === 'since' && policy.since && article.publishedAt) {
        // 配置了 url_date_pattern 的源（如 simonwillison.net），URL 路径里的
        // 日期比页面解析日期可靠（页面正文常引用更早年份/经典内容）；此时
        // 优先用 URL 日期校验，避免误杀。
        const effectiveDate =
          urlDateFromPattern(policy.urlDatePattern, key) ?? article.publishedAt;
        const sinceTime = Date.parse(policy.since);
        const articleTime = Date.parse(effectiveDate);
        if (!Number.isNaN(sinceTime) && !Number.isNaN(articleTime) && articleTime < sinceTime) {
          result.fetchedFailed += 1;
          result.errors.push({
            url: key,
            kind: 'integrity',
            code: 'outside-backfill-window',
            message: `有效日期 ${effectiveDate.slice(0, 10)} 早于 policy.since ${policy.since}，跳过`,
          });
          logger.warn(`  - ${key}: outside backfill window (${effectiveDate.slice(0, 10)} < ${policy.since})`);
          return;
        }
      }

      const { issues, stats } = checkArticleIntegrity(article, source, {
        promoFilter: policy?.qualityFilter === true,
      });
      const blocking = issues.filter((issue) => issue.severity === 'error');
      // warn 级问题记录但不阻塞（如正文里的 prompt 模板示例、TODO 标记）。
      for (const issue of issues.filter((item) => item.severity === 'warn')) {
        result.errors.push({
          url: key,
          kind: 'integrity',
          code: issue.code,
          severity: issue.severity,
          message: `warn: ${issue.message}`,
        });
      }
      if (blocking.length > 0) {
        // 每一条完整性门禁失败单独记录，保留 code + message 细节。
        for (const issue of blocking) {
          result.errors.push({
            url: key,
            kind: 'integrity',
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          });
        }
        throw new Error(`integrity blocked: ${blocking.length} issue(s)`);
      }

      if (repositories) {
        await repositories.articles.save({
          source: toDomainSource(source),
          article: toDomainArticle(source, article),
        });
        result.processedUrls.push(key);
        if (stats.mathCount > 0) result.mathArticles += 1;
        if (stats.tableCount > 0) result.tableArticles += 1;
        if (stats.imageCount > 0) result.imageArticles += 1;
        if (article.publishedAt) {
          // RFC 822 日期（如 "Tue, 18 Nov 2025 16:06:32 +0000"）直接 slice
          // 会截出乱码；统一解析成 YYYY-MM-DD 再比较。
          const parsed = Date.parse(article.publishedAt);
          const stamp = Number.isNaN(parsed)
            ? article.publishedAt.slice(0, 10)
            : new Date(parsed).toISOString().slice(0, 10);
          if (!result.earliestSaved || stamp < result.earliestSaved) result.earliestSaved = stamp;
          if (!result.latestSaved || stamp > result.latestSaved) result.latestSaved = stamp;
        }
      } else {
        if (stats.mathCount > 0) result.mathArticles += 1;
        if (stats.tableCount > 0) result.tableArticles += 1;
        if (stats.imageCount > 0) result.imageArticles += 1;
      }

      result.fetchedSuccess += 1;
      logger.info(`  + ${article.title} (${article.originalLanguage}) ${article.contentMarkdown.length} chars`);
    } catch (error) {
      result.fetchedFailed += 1;
      const message = error instanceof Error ? error.message : String(error);
      // 若上面已按条记录 integrity 错误，这里只补一条 fetch 摘要。
      const integrityRecorded = result.errors.some(
        (entry) => entry.url === key && entry.kind === 'integrity',
      );
      if (!integrityRecorded) {
        result.errors.push({ url: key, kind: 'fetch', message });
      }
      logger.error(`  - ${key}: ${message}`);
    }
  });

  // 合并式保存 processed 状态：load 现有 → 合并本源 URL → 写回。
  // 并发 subagent 各自跑不同源时不会互相覆盖对方的键；runner 完整模式
  // 还会 reconcile 已有文章记录，processed 状态缺失也能自动恢复。
  if (repositories && result.processedUrls.length > 0) {
    const state = await loadProcessedState(rootDir, options.stateFile);
    for (const url of result.processedUrls) markProcessed(state, source.id, url);
    state.updated_at = new Date().toISOString();
    await saveProcessedState(rootDir, state, options.stateFile);
  }

  logger.info(`[${source.id}] saved=${result.fetchedSuccess} failed=${result.fetchedFailed} ` +
    `duplicates=${result.duplicates} earliest=${result.earliestSaved ?? '-'} latest=${result.latestSaved ?? '-'}`);
  return result;
}

/**
 * 只删除该源的「原文版本」文件（frontmatter is_original: true），保留翻译
 * 版本。backfill 本轮不翻译，若整目录删除会把已翻译内容一起丢掉；原文
 * 重抓后 articleId 不变，翻译版本仍可独立渲染。
 */
async function removeSourceOriginalFiles(rootDir: string, sourceId: string): Promise<void> {
  const dir = path.join(rootDir, 'src', 'content', 'articles', sourceId);
  let langEntries: import('node:fs').Dirent[];
  try {
    langEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of langEntries) {
    if (!entry.isDirectory()) continue;
    const langDir = path.join(dir, entry.name);
    const files = await fs.readdir(langDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(langDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      if (/^is_original:\s*true\s*$/m.test(content)) {
        await fs.rm(filePath, { force: true });
      }
    }
  }
}

/**
 * 把本次运行追加进错误台账（保留历史），而非整体覆盖。并行 subagent 用
 * 各自 --errors 独立文件，主 agent 最后合并。
 */
async function appendErrorLedger(
  rootDir: string,
  errorLog: string,
  section: string,
): Promise<void> {
  const file = path.resolve(rootDir, errorLog);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let existing = '';
  try {
    existing = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const header = existing ? '' : '# Backfill 原文抓取错误记录\n\n';
  await fs.writeFile(file, `${header}${existing ? `${existing.replace(/\s+$/, '')}\n\n---\n\n` : ''}${section}`, 'utf8');
}

function renderAggregateErrorSection(
  generatedAt: string,
  scope: string,
  dryRun: boolean,
  results: SourceBackfillResult[],
): string {
  const entries: BackfillErrorEntry[] = results.flatMap((result) =>
    result.errors.map((error) => ({ sourceId: result.sourceId, error })),
  );
  const lines = [
    `## ${generatedAt}（${scope}${dryRun ? ' · dry-run' : ''}）`,
    '',
    `- 错误总数：${entries.length}`,
    '',
  ];
  if (entries.length === 0) {
    lines.push('无错误。', '');
    return lines.join('\n');
  }
  const bySource = new Map<string, BackfillErrorEntry[]>();
  for (const entry of entries) {
    const group = bySource.get(entry.sourceId) ?? [];
    group.push(entry);
    bySource.set(entry.sourceId, group);
  }
  for (const [sourceId, group] of bySource) {
    lines.push(`### ${sourceId}（${group.length} 条）`, '');
    for (const { error } of group) {
      const code = error.code ? ` [${error.code}]` : '';
      lines.push(`- **${error.kind}**${code} \`${error.url}\``);
      lines.push(`  - ${error.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderAggregateReport(
  generatedAt: string,
  scope: string,
  dryRun: boolean,
  results: SourceBackfillResult[],
): string {
  const lines = [
    '# Backfill 原文回填报告',
    '',
    `- 生成时间：${generatedAt}`,
    `- 范围：${scope}`,
    `- 模式：${dryRun ? 'dry-run（只发现+抓取+校验，未写盘）' : '正式回填（原文持久化）'}`,
    '',
    '| 源 | discovered | eligible | skipped_date | truncated_max | saved | failed | earliest | latest | math | table | image |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |',
  ];
  let totalDiscovered = 0;
  let totalEligible = 0;
  let totalSaved = 0;
  let totalFailed = 0;
  for (const result of results) {
    totalDiscovered += result.discovered;
    totalEligible += result.eligibleByPolicy;
    totalSaved += result.fetchedSuccess;
    totalFailed += result.fetchedFailed;
    lines.push(
      `| ${result.sourceId} | ${result.discovered} | ${result.eligibleByPolicy} | ${result.skippedByDate} | ` +
      `${result.truncatedByMax} | ${result.fetchedSuccess} | ${result.fetchedFailed} | ` +
      `${result.earliestSaved ?? '-'} | ${result.latestSaved ?? '-'} | ${result.mathArticles} | ${result.tableArticles} | ${result.imageArticles} |`,
    );
  }
  lines.push(
    `| **总计** | **${totalDiscovered}** | **${totalEligible}** | | | **${totalSaved}** | **${totalFailed}** | | | | | |`,
    '',
  );
  const errors = results.filter((result) => result.errors.length > 0);
  if (errors.length > 0) {
    lines.push('## 失败明细', '');
    for (const result of errors) {
      lines.push(`### ${result.sourceId}`, '');
      for (const error of result.errors) {
        const code = error.code ? ` [${error.code}]` : '';
        lines.push(`- **${error.kind}**${code} \`${error.url}\``);
        lines.push(`  - ${error.message}`);
      }
      lines.push('');
    }
  }
  lines.push('---', '本轮只收原文（Defuddle 抓取 + 完整性门禁），未调用翻译模型。', '');
  return lines.join('\n');
}

async function run() {
  const options = parseBackfillArgs(process.argv.slice(2));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const logger = consoleLogger;
  const fetchImpl = createFetchImpl(logger);
  const fetchBackend = createFetchBackend(process.env.FETCH_BACKEND);

  const sources = await loadSources(rootDir);
  const targetIds = options.sourceId
    ? [options.sourceId]
    : WAVES[options.wave as number];
  const targets = targetIds.map((id) => {
    const source = sources.find((entry) => entry.id === id);
    if (!source) throw new Error(`Unknown source id "${id}"`);
    return source;
  });

  logger.info(`Backfill: ${targets.map((source) => source.id).join(', ')} | ` +
    `dry-run=${options.dryRun} concurrency=${options.concurrency} limit=${options.limit ?? 'policy'}`);
  logger.info(`Fetch backend: ${fetchBackend.name}`);
  logger.info('');

  const results: SourceBackfillResult[] = [];
  for (const source of targets) {
    try {
      results.push(await backfillSource(source, options, rootDir, fetchImpl, fetchBackend, logger));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[${source.id}] fatal: ${message}`);
      results.push({
        sourceId: source.id,
        policy: policyFor(source),
        discovered: 0,
        eligibleByPolicy: 0,
        skippedByDate: 0,
        truncatedByMax: 0,
        duplicates: 0,
        fetchedSuccess: 0,
        fetchedFailed: 1,
        earliestSaved: null,
        latestSaved: null,
        mathArticles: 0,
        tableArticles: 0,
        imageArticles: 0,
        errors: [{ url: source.id, kind: 'fatal', message }],
        manifest: [],
        processedUrls: [],
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const scope = options.sourceId ?? `wave ${options.wave}`;

  // 追加历史（保留每次运行记录），并行 subagent 用独立 --errors 文件。
  const section = renderAggregateErrorSection(generatedAt, scope, options.dryRun, results);
  await appendErrorLedger(rootDir, options.errorLog, section);
  logger.info(`Error ledger appended: ${options.errorLog}`);

  if (options.reportDir) {
    await fs.mkdir(options.reportDir, { recursive: true });
    for (const result of results) {
      await fs.writeFile(
        path.join(options.reportDir, `${result.sourceId}-manifest.json`),
        `${JSON.stringify({ sourceId: result.sourceId, generatedAt, manifest: result.manifest }, null, 2)}\n`,
        'utf8',
      );
      const { manifest: _manifest, ...reportBody } = result;
      await fs.writeFile(
        path.join(options.reportDir, `${result.sourceId}-report.json`),
        `${JSON.stringify({ generatedAt, ...reportBody }, null, 2)}\n`,
        'utf8',
      );
    }
    const aggregatePath = path.join(options.reportDir, 'report.md');
    await fs.writeFile(
      aggregatePath,
      renderAggregateReport(generatedAt, scope, options.dryRun, results),
      'utf8',
    );
    logger.info(`Reports written: ${options.reportDir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`backfill: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
