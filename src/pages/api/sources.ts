import type { APIRoute } from 'astro';
import { loadActiveSources } from '../../../worker/runtime/source-config';

export const prerender = false;

export const GET: APIRoute = async () => {
  const sources = loadActiveSources().map((s) => ({
    id: s.id,
    name: s.name,
    update_mode: s.update_mode,
  }));
  return json({ count: sources.length, sources });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
