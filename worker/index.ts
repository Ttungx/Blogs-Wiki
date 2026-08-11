/**
 * Worker 入口 —— Phase 6 运行时验证。
 *
 * 暴露一个 HTTP 端点，用真实 Workers 运行时验证 extractor 在 CPU 时间限制、
 * 内存限制、linkedom/worker 兼容性下的表现。
 *
 * 端点：
 *   GET /extract?url=<article-url>
 *     → fetch HTML → extractArticle() → 返回 ExtractionResult JSON
 *
 *   GET /          → 健康检查
 *
 * 这不是生产 Worker——它是迁移路线图 Phase 6 的验证脚手架。
 * Phase 7（Workflow 运行时）会替换为正式的 discover → fetch → translate → persist 编排。
 */

import { extractArticle } from './fetch/extractor.ts';
import { createWorkerRepositories } from './runtime/repositories.ts';
import type { WorkerEnv } from './runtime/repositories.ts';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return jsonResponse({ status: 'ok', worker: 'blogs-wiki-extractor-poc' });
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
          {
            error: error instanceof Error ? error.message : String(error),
          },
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
        // Workers 原生 fetch（无 Node undici / ProxyAgent）
        const response = await fetch(targetUrl, {
          headers: {
            accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
            'user-agent': 'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
          },
          // Workers fetch 不支持 AbortSignal.timeout 之外的 Node 特有选项
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

        // 数学公式统计（验证核心卖点）
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
          // 预览前 300 字符
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
