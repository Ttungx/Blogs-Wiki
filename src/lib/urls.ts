const configuredBase = import.meta.env.BASE_URL || '/';

export const basePath = configuredBase.endsWith('/')
  ? configuredBase
  : `${configuredBase}/`;

export function sitePath(path = ''): string {
  const relativePath = path.replace(/^\/+/, '');
  return relativePath ? `${basePath}${relativePath}` : basePath;
}

export function assetPath(path?: string): string | undefined {
  if (!path || /^(https?:)?\/\//.test(path) || path.startsWith('data:')) {
    return path;
  }

  return sitePath(path);
}

/**
 * 远程图片统一经代理加载，本地相对路径与 data: URI 原样返回：
 * - `astro dev` 时走本地 Vite 中间件（`__image_proxy`，见 scripts/dev/image-proxy.mjs）
 * - 生产走 images.weserv.nl CDN 代理：去掉 Referer（绕过防盗链）、服务端缓存、可按宽度缩放
 */
export function imagePath(path?: string, width?: number): string | undefined {
  const source = assetPath(path);
  if (!source || !/^https?:\/\//i.test(source)) return source;

  if (import.meta.env.DEV) {
    return `${sitePath('__image_proxy')}?url=${encodeURIComponent(source)}`;
  }

  const params = new URLSearchParams({ url: source.replace(/^https?:\/\//, '') });
  if (width && width > 0) {
    params.set('w', String(width));
  }
  return `https://images.weserv.nl/?${params.toString()}`;
}
