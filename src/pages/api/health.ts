import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  const db = env.DB;
  try {
    const count = await db
      .prepare('SELECT COUNT(*) as count FROM articles')
      .first<{ count: number }>();
    const sources = await db
      .prepare('SELECT COUNT(*) as count FROM source_items WHERE status = ?')
      .bind('published')
      .first<{ count: number }>();
    return json({
      status: 'ok',
      backend: 'd1',
      articleCount: count?.count ?? 0,
      processedItemCount: sources?.count ?? 0,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
