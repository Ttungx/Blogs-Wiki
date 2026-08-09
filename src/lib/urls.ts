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
