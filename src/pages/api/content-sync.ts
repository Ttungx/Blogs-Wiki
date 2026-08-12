/**
 * POST /api/content-sync —— GitHub Actions 内容同步桥接入口。
 *
 * 薄壳：认证、body 限制、payload 校验与 D1 幂等写入全部委托
 * `worker/runtime/content-sync.ts` 的 handleContentSync（便于 D1 测试
 * 直接覆盖完整 HTTP 契约）。与 /api/trigger（Workflow）互不干扰。
 *
 * 部署前提：`wrangler secret put CONTENT_SYNC_TOKEN`（本地 dev 在
 * wrangler.jsonc vars 里提供）。token 未注入时端点返回 503。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleContentSync } from '../../../worker/runtime/content-sync';
import type { ContentSyncEnv } from '../../../worker/runtime/content-sync';

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleContentSync(request, env as unknown as ContentSyncEnv);
