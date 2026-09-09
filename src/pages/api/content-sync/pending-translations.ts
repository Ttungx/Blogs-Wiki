/**
 * POST /api/content-sync/pending-translations —— 取某源「有原文、缺中译」的文章。
 *
 * 薄壳同 /api/content-sync：认证与 D1 查询全部委托
 * `worker/runtime/content-sync.ts` 的 handlePendingTranslations。
 *
 * 请求：{sourceId, limit?}　响应：{articles:[PendingTranslation]}
 * 认证同 content-sync（Bearer CONTENT_SYNC_TOKEN）。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handlePendingTranslations } from '../../../../worker/runtime/content-sync';
import type { ContentSyncEnv } from '../../../../worker/runtime/content-sync';

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handlePendingTranslations(request, env as unknown as ContentSyncEnv);
