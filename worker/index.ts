/**
 * Worker 入口 —— Phase 7 Workflow 运行时。
 *
 * 端点：
 *   GET  /                → 健康检查
 *   GET  /storage/health  → D1 连通性 + 文章计数
 *   GET  /extract?url=... → Defuddle 提取器（Phase 6 POC，保留）
 *   POST /trigger         → 手动触发 UpdateWorkflow
 *     body: { sourceId?: string, limit?: number, dryRun?: boolean }
 *     返回: { instanceId: string }
 *   GET  /sources         → 列出 active 来源（调试用）
 *
 * Workflow 类从 ./workflows/update-workflow 导出，由 wrangler binding 连接。
 * Cron 定时触发待手动验证后加到 wrangler.jsonc 的 schedules。
 */

export { UpdateWorkflow } from './workflows/update-workflow.ts';

import { extractArticle } from './fetch/extractor.ts';
import { createWorkerRepositories } from './runtime/repositories.ts';
import type { WorkerEnv } from './runtime/repositories.ts';
import { loadActiveSources } from './runtime/source-config.ts';
import type { UpdateOptions } from './runtime/update-orchestrator.ts';

/** Workflow binding 类型（@cloudflare/workers-types 的 Workflow 接口的子集）。 */
interface WorkflowBinding {
  create(options?: { params?: UpdateOptions; id?: string }): Promise<{ id: string }>;
}

/**
 * Handler env：WorkerEnv + 可选 Workflow binding。
 *
 * UPDATE_WORKFLOW 在生产运行时由 wrangler 始终注入；测试环境（Miniflare）
 * 可能不提供，所以标记可选，/trigger 路由在运行时检查。
 */
interface HandlerEnv extends WorkerEnv {
  UPDATE_WORKFLOW?: WorkflowBinding;
}

export default {
  async fetch(request: Request, env: HandlerEnv): Promise<Response> {
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

    if (url.pathname === '/trigger' && request.method === 'POST') {
      if (!env.UPDATE_WORKFLOW) {
        return jsonResponse({ error: 'UPDATE_WORKFLOW binding not available' }, 500);
      }
      try {
        const body = await request.json().catch(() => ({})) as Partial<UpdateOptions>;
        const params: UpdateOptions = {
          sourceId: body.sourceId,
          limit: body.limit,
          dryRun: body.dryRun,
        };
        const instance = await env.UPDATE_WORKFLOW.create({ params });
        return jsonResponse({ status: 'created', instanceId: instance.id });
      } catch (error) {
        return jsonResponse(
          { error: error instanceof Error ? error.message : String(error) },
          500,
        );
      }
    }

    if (url.pathname === '/extract') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return jsonResponse({ error: 'missing url param' }, 400);
      }

      const startTime = Date.now();
      try {
        const response = await fetch(targetUrl, {
          headers: {
            accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
            'user-agent': 'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
          },
        });

        if (!response.ok) {
          return jsonResponse(
            { error: `fetch failed: HTTP ${response.status} ${response.statusText}` },
            502,
          );
        }

        const html = await response.text();
        const htmlSize = html.length;

        const extractStart = Date.now();
        const result = await extractArticle({ html, url: targetUrl });
        const extractMs = Date.now() - extractStart;
        const totalMs = Date.now() - startTime;

        const inlineMath = (result.contentMarkdown.match(/\$[^\$\n]+?\$/g) ?? []).length;
        const displayMath = (result.contentMarkdown.match(/\$\$[\s\S]+?\$\$/g) ?? []).length;

        return jsonResponse({
          url: targetUrl,
          htmlSizeKb: Math.round(htmlSize / 1024),
          extractMs,
          totalMs,
          title: result.title,
          author: result.author,
          publishedAt: result.publishedAt,
          language: result.originalLanguage,
          wordCount: result.wordCount,
          markdownLength: result.contentMarkdown.length,
          inlineMath,
          displayMath,
          preview: result.contentMarkdown.slice(0, 300),
        });
      } catch (error) {
        const totalMs = Date.now() - startTime;
        return jsonResponse(
          {
            error: error instanceof Error ? error.message : String(error),
            url: targetUrl,
            totalMs,
          },
          500,
        );
      }
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
