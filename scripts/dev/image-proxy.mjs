import net from 'node:net';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

function normalizedBase(base) {
  const value = base || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function isPrivateTarget(url) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const [first, second] = hostname.split('.').map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (ipVersion === 6) {
    return hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:');
  }
  return false;
}

function shouldBypassProxy(hostname, noProxy) {
  const normalized = hostname.toLowerCase().replace(/^www\./, '');
  return noProxy.includes('*') || noProxy.some(
    (entry) => normalized === entry || normalized.endsWith(`.${entry}`),
  );
}

function sendError(response, status, message) {
  response.statusCode = status;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end(message);
}

/**
 * Proxy for remote images rendered by the local Astro dev server.
 * Registered as an Astro integration; its Vite dev-server middleware handles
 * only `/__image_proxy?url=<encoded absolute http(s) image URL>`.
 */
export function localImageProxy({ base, env }) {
  const rawEnabled = (env.USE_PROXY ?? 'false').trim();
  if (rawEnabled !== 'true' && rawEnabled !== 'false') {
    throw new Error('USE_PROXY must be exactly "true" or "false"');
  }

  const proxyEnabled = rawEnabled === 'true';
  const proxyUrl = (env.PROXY_URL ?? 'http://127.0.0.1:7897').trim();
  const noProxy = (env.NO_PROXY ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
  if (proxyEnabled && !/^https?:\/\//i.test(proxyUrl)) {
    throw new Error('PROXY_URL must be a valid http(s) URL when USE_PROXY=true');
  }

  const endpoint = `${normalizedBase(base)}__image_proxy`;
  const dispatcher = proxyEnabled ? new ProxyAgent(proxyUrl) : undefined;

  return {
    name: 'blogs-wiki-local-image-proxy',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'blogs-wiki-local-image-proxy-vite',
                apply: 'serve',
                configureServer(server) {
                  server.middlewares.use(async (request, response, next) => {
                    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
                    if (requestUrl.pathname !== endpoint) return next();
                    if (request.method !== 'GET' && request.method !== 'HEAD') {
                      return sendError(response, 405, 'Method not allowed');
                    }

                    let target;
                    try {
                      target = new URL(requestUrl.searchParams.get('url') ?? '');
                    } catch {
                      return sendError(response, 400, 'Invalid image URL');
                    }
                    if (!/^https?:$/.test(target.protocol) || isPrivateTarget(target)) {
                      return sendError(response, 403, 'Image target is not allowed');
                    }

                    const useDispatcher = dispatcher && !shouldBypassProxy(target.hostname, noProxy);
                    try {
                      const upstream = await undiciFetch(target, {
                        ...(useDispatcher ? { dispatcher } : {}),
                        headers: {
                          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                          'user-agent': 'BlogsWikiLocalImageProxy/0.1',
                        },
                        redirect: 'follow',
                        signal: AbortSignal.timeout(30_000),
                      });
                      if (!upstream.ok) {
                        return sendError(response, upstream.status, `Upstream image returned ${upstream.status}`);
                      }

                      const contentType = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
                      if (!contentType.startsWith('image/')) {
                        return sendError(response, 415, 'Upstream response is not an image');
                      }
                      const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
                      if (declaredLength > MAX_IMAGE_BYTES) {
                        return sendError(response, 413, 'Image is too large');
                      }

                      response.statusCode = 200;
                      response.setHeader('content-type', contentType);
                      response.setHeader('cache-control', 'public, max-age=3600');
                      response.setHeader('x-content-type-options', 'nosniff');
                      if (request.method === 'HEAD') return response.end();

                      const body = Buffer.from(await upstream.arrayBuffer());
                      if (body.byteLength > MAX_IMAGE_BYTES) {
                        return sendError(response, 413, 'Image is too large');
                      }
                      response.setHeader('content-length', String(body.byteLength));
                      response.end(body);
                    } catch (error) {
                      server.config.logger.warn(
                        `local image proxy failed for ${target.hostname}: ${error instanceof Error ? error.message : String(error)} (useProxy=${useDispatcher}) ${error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : ''}`,
                      );
                      sendError(response, 502, 'Image proxy request failed');
                    }
                  });

                  server.httpServer?.once('close', () => {
                    void dispatcher?.close();
                  });
                },
              },
            ],
          },
        });
      },
    },
  };
}
