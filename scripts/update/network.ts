import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { FetchLike, Logger } from './types';

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

export function loadProxySettings(env: NetworkEnvironment = process.env): ProxySettings {
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

export function createFetchImpl(
  logger: Logger,
  env: NetworkEnvironment = process.env,
): FetchLike {
  const settings = loadProxySettings(env);

  if (!settings.enabled) {
    logger.info('proxy: disabled (set USE_PROXY=true to enable)');
    return fetch;
  }

  const dispatcher = new ProxyAgent(settings.url);
  const proxiedFetch = undiciFetch as unknown as (
    input: string | URL | Request,
    init?: RequestInit & { dispatcher?: ProxyAgent },
  ) => Promise<Response>;
  logger.info(`proxy: enabled (${settings.url})${settings.noProxy.length ? `, bypass: ${settings.noProxy.join(', ')}` : ''}`);

  return (input, init) => {
    return proxyUrlFor(input, settings)
      ? proxiedFetch(input, { ...(init ?? {}), dispatcher })
      : fetch(input, init);
  };
}
