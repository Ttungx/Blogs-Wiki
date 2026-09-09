/**
 * 从 D1 补翻：取「有原文、缺中译」的文章，翻译后直接写回 D1。
 *
 * 为什么需要它（2026-09-09 事故）：
 *   translate:batch 只扫容器本地磁盘（src/content/articles 下 is_original
 *   且非 zh 的文件）。生产跑在 Render 免费实例上，每 1-2 轮就换一个
 *   instance，本地文件系统随之重置；而仓库里并不保存历史原文（git 内
 *   src/content/blogs/<source>/ 是空的）。于是「入库那一刻翻译失败」的文章
 *   永久卡在英文状态——补翻扫描永远看不到它们。
 *
 *   本脚本改为向 D1 要清单（/api/content-sync/pending-translations），
 *   翻译后经 /api/content-sync 写回 zh-cn 版本，与容器本地状态解耦。
 *
 * CLI:
 *   npm run translate:backlog -- --source <id> [--limit n] [--concurrency n]
 *
 * 环境变量：
 *   CONTENT_SYNC_URL / CONTENT_SYNC_TOKEN      写回 D1
 *   BACKLOG_SYNC_URL（可选）                   取清单端点，缺省由
 *     CONTENT_SYNC_URL 推导为 .../pending-translations/
 *   TRANSLATE_BACKLOG_LIMIT                    默认每轮 2 篇（翻译配额考虑）
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslateClient, routeTranslator } from './translate';
import { createTranslateV2Client } from './translate-v2';
import { resolveAiProviderChain } from './ai-provider';
import { runWithConcurrency } from './concurrency';
import { createFetchImpl } from './network';
import type { ExtractedArticle } from './types';
import { CATEGORIES } from '../../src/config/categories';

interface PendingTranslation {
  id: string;
  sourceId: string;
  originalUrl: string;
  originalLanguage: string;
  publishedAt: string;
  publishedAtSource?: 'published' | 'ingested';
  imageUrl?: string;
  author?: string;
  sourceDomain: string;
  title: string;
  contentMarkdown: string;
}

export interface BacklogOptions {
  sourceId: string;
  limit: number;
  concurrency: number;
  dryRun: boolean;
}

interface BacklogSummary {
  sourceId: string;
  pending: number;
  translated: number;
  failed: number;
  errors: string[];
}

function requireEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is not set; cannot reach D1`);
  return value;
}

function pendingEndpoint(): string {
  const custom = (process.env.BACKLOG_SYNC_URL ?? '').trim();
  if (custom) return custom;
  return `${requireEnv('CONTENT_SYNC_URL').replace(/\/+$/, '')}/pending-translations/`;
}

async function fetchPending(
  sourceId: string,
  limit: number,
  fetchImpl: typeof fetch,
): Promise<PendingTranslation[]> {
  const token = requireEnv('CONTENT_SYNC_TOKEN');
  const response = await fetchImpl(pendingEndpoint(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sourceId, limit }),
  });
  if (!response.ok) {
    throw new Error(`pending-translations failed: HTTP ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { articles?: PendingTranslation[] };
  return Array.isArray(data.articles) ? data.articles : [];
}

/** 把译文作为 zh-cn 版本推回 D1（只带 versions，身份字段原样回传）。 */
async function pushTranslation(
  article: PendingTranslation,
  title: string,
  contentMarkdown: string,
  model: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const endpoint = requireEnv('CONTENT_SYNC_URL');
  const token = requireEnv('CONTENT_SYNC_TOKEN');
  const body = JSON.stringify({
    sources: [],
    sql: [],
    articles: [
      {
        id: article.id,
        sourceId: article.sourceId,
        originalUrl: article.originalUrl,
        originalLanguage: article.originalLanguage,
        publishedAt: article.publishedAt,
        ...(article.publishedAtSource ? { publishedAtSource: article.publishedAtSource } : {}),
        ...(article.imageUrl ? { imageUrl: article.imageUrl } : {}),
        ...(article.author ? { author: article.author } : {}),
        sourceDomain: article.sourceDomain,
        versions: [
          {
            language: 'zh-cn',
            title,
            contentMarkdown,
            provenance: 'model',
            translationModel: model,
            translatedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  });

  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        },
        body,
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
      } else {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`content-sync write-back failed: ${lastError}`);
}

export async function runTranslateBacklog(options: BacklogOptions): Promise<BacklogSummary> {
  const fetchImpl = createFetchImpl(console);
  const summary: BacklogSummary = {
    sourceId: options.sourceId,
    pending: 0,
    translated: 0,
    failed: 0,
    errors: [],
  };

  const pending = await fetchPending(options.sourceId, options.limit, fetchImpl);
  summary.pending = pending.length;
  if (pending.length === 0) {
    console.log(`translate-backlog: ${options.sourceId} has no untranslated articles`);
    return summary;
  }
  console.log(`translate-backlog: ${pending.length} article(s) missing Chinese (${options.sourceId})`);

  if (options.dryRun) {
    for (const item of pending) console.log(`  would translate: ${item.id} — ${item.title}`);
    return summary;
  }

  const providers = resolveAiProviderChain(process.env);
  if (providers.length === 0) throw new Error('no translation provider configured');
  // WARN 前缀使其进入 render-runner 的 chain warning summary，远程审计
  // MODEL_PROVIDER_YAML 是否真的生效（MCP/Dashboard 写值曾多次未落地）。
  console.warn(
    `WARN provider chain audit: ${providers.map((p) => p.model).join(' -> ')}` +
      ` (inline=${Boolean((process.env.MODEL_PROVIDER_YAML ?? '').trim())},` +
      ` file=${(process.env.MODEL_PROVIDER_FILE ?? '').trim() || '-'})`,
  );
  const forceV2 = (process.env.TRANSLATION_PIPELINE ?? 'v1').trim().toLowerCase() === 'v2';
  const translates = providers.map((p) => {
    const common = {
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      model: p.model,
      reasoningEffort: p.reasoningEffort,
      rateLimit: p.rateLimit,
      fetchImpl,
    } as const;
    return routeTranslator(createTranslateClient(common), createTranslateV2Client(common), forceV2);
  });

  await runWithConcurrency(pending, options.concurrency, async (item) => {
    let lastError: unknown;
    const article: ExtractedArticle = {
      url: item.originalUrl,
      title: item.title,
      contentMarkdown: item.contentMarkdown,
      originalLanguage: item.originalLanguage,
      publishedAt: item.publishedAt,
      ...(item.publishedAtSource ? { publishedAtSource: item.publishedAtSource } : {}),
      ...(item.author ? { author: item.author } : {}),
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    };
    for (let i = 0; i < translates.length; i += 1) {
      try {
        const translation = await translates[i]!(article, CATEGORIES);
        await pushTranslation(
          item,
          translation.translatedTitle,
          translation.contentMarkdown,
          translation.model,
          fetchImpl,
        );
        summary.translated += 1;
        console.log(`  + ${item.id} (${translation.translatedTitle})`);
        return;
      } catch (error) {
        lastError = error;
        if (i < translates.length - 1) {
          console.warn(
            `  ! ${item.id}: ${providers[i]!.model} 失败，回退 ${providers[i + 1]!.model}` +
              `（${error instanceof Error ? error.message.slice(0, 80) : error}）`,
          );
        }
      }
    }
    summary.failed += 1;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    summary.errors.push(`${item.id} | ${item.originalUrl}: ${message}`);
    console.error(`  - ${item.id}: ${message}`);
  });

  console.log(`translate-backlog: translated=${summary.translated} failed=${summary.failed}`);
  return summary;
}

function parseArgs(argv: string[]) {
  let sourceId = '';
  let limit = Number(process.env.TRANSLATE_BACKLOG_LIMIT ?? '2');
  let concurrency = 1;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source' || arg.startsWith('--source=')) {
      sourceId = arg.startsWith('--source=') ? arg.slice('--source='.length) : argv[++i] ?? '';
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      limit = Number(arg.startsWith('--limit=') ? arg.slice('--limit='.length) : argv[++i]);
    } else if (arg === '--concurrency' || arg.startsWith('--concurrency=')) {
      concurrency = Number(arg.startsWith('--concurrency=') ? arg.slice('--concurrency='.length) : argv[++i]);
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }
  if (!sourceId) throw new Error('--source <id> is required');
  if (!Number.isFinite(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 1;
  return { sourceId, limit: Math.floor(limit), concurrency: Math.floor(concurrency), dryRun };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runTranslateBacklog(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`translate-backlog: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
