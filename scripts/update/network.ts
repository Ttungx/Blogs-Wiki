import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { FetchLike, Logger } from './types';
import {
  loadProxySettings,
  proxyUrlFor,
  type NetworkEnvironment,
  type ProxySettings,
} from './proxy';

export type { NetworkEnvironment, ProxySettings };
export { loadProxySettings, proxyUrlFor };

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
