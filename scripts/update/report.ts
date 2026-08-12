import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UpdateSummary } from './types';

const REPORT_VERSION = 1 as const;

export interface UpdateReportMeta {
  dryRun: boolean;
  sourceId?: string;
  limit?: number;
}

export interface UpdateReportEnvironment {
  node: string;
  platform: string;
  trigger: string;
  runId: string | null;
  translationPipeline: string;
  fetchBackend: string;
  storageBackend: string;
  useProxy: boolean;
}

export interface UpdateReport {
  version: typeof REPORT_VERSION;
  createdAt: string;
  dryRun: boolean;
  sourceId: string | null;
  limitPerSource: number | null;
  git: { sha: string | null; ref: string | null };
  environment: UpdateReportEnvironment;
  summary: UpdateSummary;
}

/** 致命错误（无 summary 可写）时的降级报告，保证 artifact 仍可审计失败原因。 */
export interface UpdateFailureReport {
  version: typeof REPORT_VERSION;
  createdAt: string;
  fatalError: { message: string; stack?: string };
  git: { sha: string | null; ref: string | null };
  environment: UpdateReportEnvironment;
}

function runGit(args: string[]): string | null {
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function gitInfo(): UpdateReport['git'] {
  return {
    sha: process.env.GITHUB_SHA ?? runGit(['rev-parse', '--short', 'HEAD']),
    ref: process.env.GITHUB_REF ?? runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
  };
}

function environmentInfo(): UpdateReportEnvironment {
  return {
    node: process.version,
    platform: process.platform,
    trigger: process.env.GITHUB_EVENT_NAME ?? 'local',
    runId: process.env.GITHUB_RUN_ID ?? null,
    translationPipeline: (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase(),
    fetchBackend: (process.env.FETCH_BACKEND ?? 'node').trim().toLowerCase(),
    storageBackend: (process.env.STORAGE_BACKEND ?? 'file').trim().toLowerCase(),
    useProxy: process.env.USE_PROXY === 'true',
  };
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(report: UpdateReport | UpdateFailureReport): string {
  const env = report.environment;
  const lines: string[] = [
    '# Blogs Wiki 内容更新报告',
    '',
    `- 生成时间：${report.createdAt}`,
    `- 触发方式：${env.trigger}`,
    `- 运行 ID：${env.runId ?? '（本地运行）'}`,
    `- Git：${report.git.ref ?? 'unknown'} @ ${report.git.sha ?? 'unknown'}`,
    `- Node：${env.node} / ${env.platform}`,
    `- 翻译管线：${env.translationPipeline}`,
    `- 抓取引擎：${env.fetchBackend}`,
    `- 存储后端：${env.storageBackend}`,
    `- 代理：${env.useProxy ? '开启' : '关闭'}`,
    '',
  ];

  if ('fatalError' in report) {
    lines.push('## 结果：致命错误', '');
    lines.push('```', report.fatalError.message, ...(report.fatalError.stack ? ['', report.fatalError.stack] : []), '```', '');
    return lines.join('\n');
  }

  const { summary } = report;
  lines.push('## 运行参数', '');
  lines.push(
    `- 模式：${report.dryRun ? '**dry-run**（只发现 + 抓取，不调用翻译模型、不写文章文件；仍生成本报告）' : '完整更新（发现 + 抓取 + 翻译 + 本地产物持久化）'}`,
    `- 来源：${report.sourceId ?? '全部 active 来源'}`,
    `- 每源上限：${report.limitPerSource ?? '默认 3'}（0 = 不限）`,
    '',
    '## 结果', '',
    '| 来源 | 发现 | 新增 | 处理 | 失败 |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  for (const source of summary.sources) {
    lines.push(
      `| ${escapeCell(source.sourceId)} | ${source.discovered} | ${source.pending} | ${source.processed} | ${source.failed} |`,
    );
  }
  lines.push(
    `| **总计** | **${summary.discovered}** | **${summary.pending}** | **${summary.processed}** | **${summary.failed}** |`,
    '',
  );

  const errors = summary.sources.flatMap((source) =>
    source.errors.map((err) => `- [${escapeCell(source.sourceId)}] ${escapeCell(err.url)}: ${escapeCell(err.message)}${err.code ? ` (${escapeCell(err.code)})` : ''}`),
  );
  if (errors.length > 0) {
    lines.push('## 失败明细', '', ...errors, '');
  }

  lines.push(
    '---',
    '审计说明：文章正文与处理状态仅写入工作区（`src/content/articles/`、`src/data/processed-urls.json`，均被 .gitignore 覆盖），',
    '不会进入 git 或报告 artifact；本报告只含元数据（来源/URL/标题/计数），可直接归档。',
    '',
  );
  return lines.join('\n');
}

async function ensureDir(reportDir: string): Promise<void> {
  await mkdir(reportDir, { recursive: true });
}

export async function writeUpdateReport(
  reportDir: string,
  meta: UpdateReportMeta,
  summary: UpdateSummary,
): Promise<{ jsonPath: string; mdPath: string }> {
  const report: UpdateReport = {
    version: REPORT_VERSION,
    createdAt: new Date().toISOString(),
    dryRun: meta.dryRun,
    sourceId: meta.sourceId ?? null,
    limitPerSource: meta.limit ?? null,
    git: gitInfo(),
    environment: environmentInfo(),
    summary,
  };
  const jsonPath = path.join(reportDir, 'report.json');
  const mdPath = path.join(reportDir, 'report.md');
  await ensureDir(reportDir);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, renderMarkdown(report), 'utf8');
  return { jsonPath, mdPath };
}

export async function writeFailureReport(
  reportDir: string,
  error: Error,
): Promise<{ jsonPath: string; mdPath: string }> {
  const report: UpdateFailureReport = {
    version: REPORT_VERSION,
    createdAt: new Date().toISOString(),
    fatalError: { message: error.message, stack: error.stack },
    git: gitInfo(),
    environment: environmentInfo(),
  };
  const jsonPath = path.join(reportDir, 'report.json');
  const mdPath = path.join(reportDir, 'report.md');
  await ensureDir(reportDir);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, renderMarkdown(report), 'utf8');
  return { jsonPath, mdPath };
}
