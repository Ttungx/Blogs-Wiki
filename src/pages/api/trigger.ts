import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!env.UPDATE_WORKFLOW) {
    return json({ error: 'UPDATE_WORKFLOW binding not available' }, 500);
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      sourceId?: string;
      limit?: number;
      dryRun?: boolean;
    };
    const instance = await env.UPDATE_WORKFLOW.create({
      params: {
        sourceId: body.sourceId,
        limit: body.limit,
        dryRun: body.dryRun,
      },
    });
    return json({ status: 'created', instanceId: instance.id });
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
