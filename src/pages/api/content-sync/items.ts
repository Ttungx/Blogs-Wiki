/**
 * POST /api/content-sync/items —— 管线质量门禁拒绝的负缓存写入。
 *
 * 薄壳同 /api/content-sync/check：认证、body 限制与 D1 upsert 全部委托
 * `worker/runtime/content-sync.ts` 的 handleContentItems（便于 D1 测试
 * 直接覆盖完整 HTTP 契约）。
 *
 * 请求：{items:[{sourceId,url,code}]}　响应：{ok,items:{received},batches}
 * 认证同 content-sync（Bearer CONTENT_SYNC_TOKEN）。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleContentItems } from '../../../../worker/runtime/content-sync';
import type { ContentSyncEnv } from '../../../../worker/runtime/content-sync';

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleContentItems(request, env as unknown as ContentSyncEnv);
