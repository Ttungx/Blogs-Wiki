/**
 * POST /api/content-sync/check —— 管线翻译前的远端去重预检。
 *
 * 薄壳同 /api/content-sync：认证、body 限制与 D1 查询全部委托
 * `worker/runtime/content-sync.ts` 的 handleContentCheck（便于 D1 测试
 * 直接覆盖完整 HTTP 契约）。
 *
 * 请求：{items:[{sourceId,url}]}　响应：{existing:[{sourceId,url}]}
 * 认证同 content-sync（Bearer CONTENT_SYNC_TOKEN）。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleContentCheck } from '../../../../worker/runtime/content-sync';
import type { ContentSyncEnv } from '../../../../worker/runtime/content-sync';

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleContentCheck(request, env as unknown as ContentSyncEnv);
