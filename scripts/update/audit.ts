import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources } from './config';
import { diagnoseSourceDiscovery } from './discovery';
import { fetchArticle } from './fetch';
import { createFetchImpl } from './network';
import type { DiscoveredArticle, Logger, SourceConfig } from './types';

const DEFAULT_SAMPLES = 3;
const MAX_SAMPLES = 10;

export interface AuditCliOptions {
  sourceId?: string;
  samples: number;
  json: boolean;
  configOnly: boolean;
}

interface SampleAudit {
  url: string;
  ok: boolean;
  title?: string;
  publishedAt?: string;
  language?: string;
  markdownChars?: number;
  imageUrl?: string;
  inlineImageUrls?: string[];
  issues: string[];
  error?: string;
}

interface SourceAuditReport {
  sourceId: string;
  updateMode: SourceConfig['update_mode'];
  generatedAt: string;
  discovery: Awaited<ReturnType<typeof diagnoseSourceDiscovery>>;
  samples: SampleAudit[];
  passed: boolean;
}

function parseCount(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) throw new Error('--samples requires an integer from 1 to 10');
  const parsed = Number(value);
  if (parsed < 1 || parsed > MAX_SAMPLES) throw new Error('--samples requires an integer from 1 to 10');
  return parsed;
}

export function parseAuditArgs(argv: string[]): AuditCliOptions {
  const options: AuditCliOptions = { samples: DEFAULT_SAMPLES, json: false, configOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source' || arg === '-s' || arg.startsWith('--source=')) {
      options.sourceId = arg.startsWith('--source=') ? arg.slice('--source='.length) : argv[++index];
      if (!options.sourceId || options.sourceId.startsWith('-')) throw new Error('--source requires a source id');
    } else if (arg === '--samples' || arg.startsWith('--samples=')) {
      options.samples = parseCount(arg.startsWith('--samples=') ? arg.slice('--samples='.length) : argv[++index]);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--config-only') {
      options.configOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run audit:source -- [options]

Options:
  --source <id>     Source to audit (required unless --config-only).
  --samples <n>     Fetch 1-${MAX_SAMPLES} sample articles (default: ${DEFAULT_SAMPLES}).
  --json            Emit one JSON report without log prefixes.
  --config-only     Validate all source configuration without network access.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.configOnly && !options.sourceId) {
    throw new Error('--source is required unless --config-only is used');
  }
  return options;
}

function inlineImageUrls(markdown: string): string[] {
  const values = [...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1]);
  return [...new Set(values)];
}

function newestFirst(items: DiscoveredArticle[]): DiscoveredArticle[] {
  return [...items].sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) || 0 : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) || 0 : 0;
    return rightTime - leftTime;
  });
}

async function auditSample(
  source: SourceConfig,
  discovered: DiscoveredArticle,
  fetchImpl: ReturnType<typeof createFetchImpl>,
): Promise<SampleAudit> {
  try {
    const article = await fetchArticle(source, discovered, fetchImpl);
    const images = inlineImageUrls(article.contentMarkdown);
    const issues: string[] = [];
    if (!article.publishedAt) issues.push('missing-published-date');
    return {
      url: article.url,
      ok: issues.length === 0,
      title: article.title,
      publishedAt: article.publishedAt,
      language: article.originalLanguage,
      markdownChars: article.contentMarkdown.length,
      ...(article.imageUrl ? { imageUrl: article.imageUrl } : {}),
      inlineImageUrls: images,
      issues,
    };
  } catch (error) {
    return {
      url: discovered.url,
      ok: false,
      issues: ['fetch-or-extraction-failed'],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printHumanReport(report: SourceAuditReport): void {
  console.log(`Source audit: ${report.sourceId} (${report.updateMode})`);
  for (const item of report.discovery.paths) {
    const state = !item.configured ? 'not configured' : item.ok ? 'ok' : 'failed';
    console.log(
      `  ${item.name}: ${state}; raw=${item.rawCount} candidates=${item.candidateCount} ${item.durationMs}ms${item.error ? `; ${item.error}` : ''}`,
    );
  }
  console.log(`  merged candidates: ${report.discovery.candidates.length}`);
  for (const sample of report.samples) {
    console.log(`  ${sample.ok ? 'PASS' : 'FAIL'} ${sample.url}`);
    if (sample.title) {
      console.log(
        `    title=${sample.title} date=${sample.publishedAt || 'missing'} lang=${sample.language || 'missing'} markdown=${sample.markdownChars} images=${sample.inlineImageUrls?.length ?? 0}`,
      );
    }
    if (sample.error) console.log(`    error=${sample.error}`);
    if (sample.issues.length) console.log(`    issues=${sample.issues.join(',')}`);
  }
  console.log(`Audit result: ${report.passed ? 'PASS' : 'FAIL'} (read-only; no translation or files written)`);
}

export async function runAudit(options: AuditCliOptions): Promise<SourceAuditReport | undefined> {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const sources = await loadSources(rootDir);
  if (options.configOnly) {
    const result = { valid: true, sourceCount: sources.length };
    console.log(options.json ? JSON.stringify(result, null, 2) : `Source config valid: ${sources.length} sources`);
    return undefined;
  }

  const source = sources.find((entry) => entry.id === options.sourceId);
  if (!source) throw new Error(`Unknown source id "${options.sourceId}"`);
  const quietLogger: Logger = { info() {}, warn() {}, error() {} };
  const logger: Logger = options.json ? quietLogger : {
    info(message) { console.log(message); },
    warn(message) { console.warn(`warning: ${message}`); },
    error(message) { console.error(`error: ${message}`); },
  };
  const fetchImpl = createFetchImpl(logger);
  const discovery = await diagnoseSourceDiscovery(source, fetchImpl);
  const candidates = newestFirst(discovery.candidates).slice(0, options.samples);
  const samples: SampleAudit[] = [];
  for (const candidate of candidates) samples.push(await auditSample(source, candidate, fetchImpl));

  const report: SourceAuditReport = {
    sourceId: source.id,
    updateMode: source.update_mode,
    generatedAt: new Date().toISOString(),
    discovery,
    samples,
    passed: candidates.length > 0 && samples.length === candidates.length && samples.every((sample) => sample.ok),
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHumanReport(report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAudit(parseAuditArgs(process.argv.slice(2)))
    .then((report) => {
      if (report && !report.passed) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(`audit: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
