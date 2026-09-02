/**
 * Worker 诊断入口 —— 仅供本地 wrangler dev / vitest D1 测试挂载。
 *
 * 生产入口是 wrangler.deploy.jsonc 的 main=dist/server/_entry.mjs
 * （Astro SSR + scheduled ping，由 scripts/inject-worker-entry.js 生成），
 * 本文件不参与生产部署。
 *
 * 端点：
 *   GET  /                → 健康检查
 *   GET  /storage/health  → D1 连通性 + 文章计数
 *   GET  /sources         → 列出 active 来源（调试用）
 *
 * 历史：Phase 7 的 UpdateWorkflow（/trigger、/extract POC）已随 Render
 * runner + /api/content-sync 管线退役并删除（见 docs/migration-to-cloudflare.md）。
 */

import { createWorkerRepositories } from './runtime/repositories.ts';
import type { WorkerEnv } from './runtime/repositories.ts';
import { loadActiveSources } from './runtime/source-config.ts';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return jsonResponse({ status: 'ok', worker: 'blogs-wiki' });
    }

    if (url.pathname === '/storage/health') {
      try {
        const repositories = createWorkerRepositories(env);
        const [articles, state] = await Promise.all([
          repositories.articles.listAll(),
          repositories.sourceState.loadAll(),
        ]);
        return jsonResponse({
          status: 'ok',
          backend: 'd1',
          articleCount: articles.length,
          processedSourceCount: Object.keys(state.blogs).length,
        });
      } catch (error) {
        return jsonResponse(
          { error: error instanceof Error ? error.message : String(error) },
          500,
        );
      }
    }

    if (url.pathname === '/sources') {
      const sources = loadActiveSources().map((s) => ({
        id: s.id,
        name: s.name,
        update_mode: s.update_mode,
      }));
      return jsonResponse({ count: sources.length, sources });
    }

    return jsonResponse({ error: 'not found' }, 404);
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
