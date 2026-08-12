import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = () => {
  return json(
    {
      error: 'content update is managed by GitHub Actions',
      replacement: '/api/content-sync',
    },
    410,
  );
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
