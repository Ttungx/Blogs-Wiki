/**
 * 代理设置纯函数 —— 与网络实现（undici ProxyAgent）解耦。
 *
 * 从 network.ts 提取：proxyUrlFor / loadProxySettings / hostnameOf 不依赖
 * undici，Node 与 Worker 共用。network.ts 保留 createFetchImpl（undici 专属），
 * 并 re-export 本模块保持调用方不破坏。
 *
 * 零 Node-only 导入，Worker 打包安全。
 */

export interface NetworkEnvironment {
  USE_PROXY?: string;
  PROXY_URL?: string;
  NO_PROXY?: string;
}

export interface ProxySettings {
  enabled: boolean;
  url: string;
  noProxy: string[];
}

function hostnameOf(input: string | URL | Request): string {
  try {
    const value = typeof input === 'string' || input instanceof URL ? input : input.url;
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function loadProxySettings(env: NetworkEnvironment = {}): ProxySettings {
  const rawEnabled = (env.USE_PROXY ?? 'false').trim();
  if (rawEnabled !== 'true' && rawEnabled !== 'false') {
    throw new Error('USE_PROXY must be exactly "true" or "false"');
  }
  const url = (env.PROXY_URL ?? 'http://127.0.0.1:7897').trim();
  const noProxy = (env.NO_PROXY ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
  if (rawEnabled === 'true' && !/^https?:\/\//i.test(url)) {
    throw new Error(`PROXY_URL "${url}" must be a valid http(s) URL when USE_PROXY=true`);
  }
  return { enabled: rawEnabled === 'true', url, noProxy };
}

export function proxyUrlFor(
  input: string | URL | Request,
  settings: ProxySettings = loadProxySettings(),
): string | undefined {
  if (!settings.enabled) return undefined;
  const hostname = hostnameOf(input);
  const bypass = settings.noProxy.includes('*') || settings.noProxy.some(
    (entry) => hostname === entry || hostname.endsWith(`.${entry}`),
  );
  return bypass ? undefined : settings.url;
}
