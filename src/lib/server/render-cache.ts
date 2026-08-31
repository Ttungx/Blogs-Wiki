/**
 * 文章 HTML 渲染缓存（方案一：免费服务内解决免费版 Worker 10ms CPU 超限）。
 *
 * Shiki 代码高亮是 SSR 的 CPU 大头；同一 (article_id, language, 内容, baseUrl)
 * 的渲染结果永远相同，因此首次渲染后写回 D1（article_versions.rendered_html），
 * 后续请求直接取缓存。失效：内容更新或 RENDERER_VERSION 变更 → 哈希不一致 → 重渲染。
 * 写缓存失败不阻塞页面（降级为每次现渲染，行为与接入前一致）。
 */
import { createHash } from 'node:crypto';
import { renderMarkdown } from './markdown';

/** 渲染逻辑变更时递增，全局失效缓存。 */
export const RENDERER_VERSION = 'v1';

/** 超大 HTML 不入缓存（防御 D1 单值过大），直接返回现渲染结果。 */
const MAX_CACHED_HTML_BYTES = 1_500_000;

function contentHashOf(contentMarkdown: string, baseUrl?: string): string {
  return createHash('sha256')
    .update(`${RENDERER_VERSION}\u0000${baseUrl ?? ''}\u0000${contentMarkdown}`)
    .digest('hex');
}

export async function getCachedOrRenderArticleHtml(
  db: D1Database,
  articleId: string,
  language: string,
  contentMarkdown: string,
  baseUrl?: string,
): Promise<string> {
  const hash = contentHashOf(contentMarkdown, baseUrl);
  try {
    const row = await db
      .prepare('SELECT rendered_html, rendered_hash FROM article_versions WHERE article_id = ? AND language = ?')
      .bind(articleId, language)
      .first<{ rendered_html: string | null; rendered_hash: string | null }>();
    if (row?.rendered_html && row.rendered_hash === hash) return row.rendered_html;
  } catch {
    // 缓存读取失败 → 现渲染，不阻塞页面
  }
  const html = await renderMarkdown(contentMarkdown, { baseUrl });
  if (html.length <= MAX_CACHED_HTML_BYTES) {
    try {
      await db
        .prepare('UPDATE article_versions SET rendered_html = ?, rendered_hash = ? WHERE article_id = ? AND language = ?')
        .bind(html, hash, articleId, language)
        .run();
    } catch {
      // 写缓存失败不影响本次响应
    }
  }
  return html;
}
