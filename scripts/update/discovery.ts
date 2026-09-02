import type { DiscoveredArticle, FetchLike, SourceConfig } from './types';
import { canonicalizeUrl, isLikelyArticleUrl, uniqueCanonicalUrls } from './urls';
import { DEFAULT_MAX_CHILD_SITEMAPS } from './constants';
import { proxyUrlFor } from './proxy';
import { getCurlRunner } from '../../worker/fetch/curl-runner';

export interface DiscoveryPathDiagnostic {
  name: 'rss' | 'sitemap' | 'listing' | 'api';
  configured: boolean;
  ok: boolean;
  rawCount: number;
  candidateCount: number;
  durationMs: number;
  error?: string;
}

export interface DiscoveryDiagnostic {
  sourceId: string;
  paths: DiscoveryPathDiagnostic[];
  candidates: DiscoveredArticle[];
}

const USER_AGENT = 'BlogsWikiBot/0.1 (+https://github.com; article discovery only)';

function decodeEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ''), /^x/i.test(code) ? 16 : 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match)
    .trim();
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

export function isCandidateArticle(url: string, source: SourceConfig): boolean {
  if (!isLikelyArticleUrl(url, source.domain, {
    allowNonArticlePaths: source.allow_non_article_paths,
    extraDomains: source.extra_domains,
  })) return false;
  const pathname = new URL(url).pathname.replace(/\/+$/, '');
  const excluded = source.exclude_paths?.some((prefix) => {
    if (prefix.startsWith('^')) {
      try {
        return new RegExp(prefix).test(pathname);
      } catch {
        return false;
      }
    }
    const normalized = prefix.replace(/\/+$/, '');
    return pathname === normalized || pathname.startsWith(`${normalized}/`);
  });
  if (excluded) return false;
  if (!source.article_paths?.length) return true;
  return source.article_paths.some((prefix) => {
    if (prefix.startsWith('^')) {
      try {
        return new RegExp(prefix).test(pathname);
      } catch {
        return false;
      }
    }
    const normalized = prefix.replace(/\/+$/, '');
    // The article must live under the prefix; the bare prefix itself (e.g.
    // the /news listing page) is not an article.
    return pathname.startsWith(`${normalized}/`);
  });
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/** 将抓取字节解码为文本；`.gz` sitemap 或 gzip 魔数时先解压。 */
export async function decodeFetchedBytes(url: string, bytes: Uint8Array): Promise<string> {
  const gzipMagic = bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
  const urlLooksGzip = /\.gz(?:\?|$)/i.test(url);
  if (!gzipMagic && !urlLooksGzip) {
    return new TextDecoder().decode(bytes);
  }
  try {
    const payload = new Uint8Array(bytes.byteLength);
    payload.set(bytes);
    const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    if (!gzipMagic) return new TextDecoder().decode(bytes);
    throw new Error(`gzip decode failed for ${url}`);
  }
}

async function fetchText(fetchImpl: FetchLike, url: string, context: string): Promise<string> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8',
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`${context}: HTTP ${response.status} ${response.statusText}`);
    return decodeFetchedBytes(url, new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    // 部分 CDN（openai.com 等）按 Node TLS 指纹拦截 403，但接受 curl 的
    // TLS 栈；回退系统 curl 一次（与 fetch 层行为一致）。
    // 仅 Node 侧可用（curl-runner 注册）；Worker 运行时跳过回退。
    if (error instanceof Error && /HTTP 403/.test(error.message)) {
      const runner = getCurlRunner();
      if (runner) {
        const proxyUrl = proxyUrlFor(url);
        const args = [
          '-sS', '-L', '--max-time', '25',
          '-A', USER_AGENT,
          '-H', 'Accept: application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8',
        ];
        if (proxyUrl) args.push('-x', proxyUrl);
        args.push(url);
        const { stdout } = await runner(args, {
          maxBuffer: 20 * 1024 * 1024,
          timeout: 25_000,
        });
        const bytes = new Uint8Array(stdout.length);
        for (let i = 0; i < stdout.length; i += 1) bytes[i] = stdout.charCodeAt(i) & 0xff;
        return decodeFetchedBytes(url, bytes);
      }
    }
    throw error;
  }
}

function firstTag(block: string, names: string[]): string | undefined {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return undefined;
}

export function parseFeed(xml: string, feedUrl: string): DiscoveredArticle[] {
  const entries = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ];

  return uniqueCanonicalUrls(entries.flatMap((entry) => {
    const atomHref = entry.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
    const link = atomHref ?? firstTag(entry, ['link', 'guid']);
    const url = link ? canonicalizeUrl(decodeEntities(link), feedUrl) : null;
    if (!url) return [];

    return [{
      url,
      title: stripTags(firstTag(entry, ['title']) ?? ''),
      publishedAt: firstTag(entry, ['published', 'pubDate', 'updated', 'dc:date']),
    }];
  }), feedUrl);
}

interface SitemapEntry extends DiscoveredArticle {
  childSitemap?: boolean;
}

export function parseSitemap(xml: string, sitemapUrl: string): SitemapEntry[] {
  const isIndex = /<sitemapindex\b/i.test(xml);
  const blocks = xml.match(isIndex ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi) ?? [];
  return blocks.flatMap((block) => {
    const loc = firstTag(block, ['loc']);
    const url = loc ? canonicalizeUrl(loc, sitemapUrl) : null;
    return url ? [{ url, publishedAt: firstTag(block, ['lastmod']), childSitemap: isIndex }] : [];
  });
}

export function parseListing(html: string, listingUrl: string, source: SourceConfig): DiscoveredArticle[] {
  const anchors = [...html.matchAll(/<a\b([^>]*?)\bhref=["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];
  return uniqueCanonicalUrls(anchors.flatMap((match) => {
    const url = canonicalizeUrl(match[2], listingUrl);
    if (!url || !isLikelyArticleUrl(url, source.domain, {
      allowNonArticlePaths: source.allow_non_article_paths,
      extraDomains: source.extra_domains,
    })) return [];
    return [{ url, title: stripTags(match[4]) }];
  }), listingUrl);
}

async function fromFeed(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  if (!source.rss_url) return [];
  return parseFeed(await fetchText(fetchImpl, source.rss_url, `${source.id} RSS`), source.rss_url)
    .filter((item) => isLikelyArticleUrl(item.url, source.domain, {
      allowNonArticlePaths: source.allow_non_article_paths,
      extraDomains: source.extra_domains,
    }));
}

interface SitemapCollectResult {
  entries: SitemapEntry[];
  rawCount: number;
}

async function collectSitemapEntries(source: SourceConfig, fetchImpl: FetchLike): Promise<SitemapCollectResult> {
  const sitemapUrl = source.sitemap_url as string;
  const rootXml = await fetchText(fetchImpl, sitemapUrl, `${source.id} sitemap`);
  const rootEntries = parseSitemap(rootXml, sitemapUrl);
  const includePaths = source.sitemap_include_paths?.map((prefix) => prefix.replace(/\/+$/, '')) ?? null;
  const childSitemaps = rootEntries
    .filter((item) => item.childSitemap)
    .filter((item) => {
      if (!includePaths) return true;
      try {
        const pathname = new URL(item.url).pathname.replace(/\/+$/, '');
        return includePaths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
      } catch {
        return false;
      }
    })
    .slice(0, source.max_child_sitemaps ?? DEFAULT_MAX_CHILD_SITEMAPS);

  if (!childSitemaps.length) {
    return { entries: rootEntries, rawCount: rootEntries.length };
  }

  const childResults = await Promise.allSettled(childSitemaps.map(async ({ url }) => {
    const xml = await fetchText(fetchImpl, url, `${source.id} child sitemap`);
    return parseSitemap(xml, url);
  }));
  const childEntries = childResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
  return { entries: uniqueCanonicalUrls(childEntries), rawCount: childEntries.length };
}

async function fromSitemap(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  if (!source.sitemap_url) return [];
  const { entries } = await collectSitemapEntries(source, fetchImpl);
  return entries.filter((item) => isLikelyArticleUrl(item.url, source.domain, {
    allowNonArticlePaths: source.allow_non_article_paths,
    extraDomains: source.extra_domains,
  }));
}

async function fromListing(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  const html = await fetchText(fetchImpl, source.blog_url, `${source.id} listing`);
  return parseListing(html, source.blog_url, source);
}

function dotPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function apiPublishedAt(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    // Unix seconds（混元接口）；毫秒级时间戳已超 4 亿，不会误判为秒。
    return new Date(value * 1000).toISOString();
  }
  const text = String(value).trim();
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function fromApi(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  const api = source.api;
  if (!api?.list_url) return [];

  const body = JSON.stringify(api.list_body ?? {});
  const response = await fetchImpl(api.list_url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      origin: new URL(api.list_url).origin,
      referer: source.blog_url,
    },
    body,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`api list: HTTP ${response.status} ${response.statusText}`);
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new Error('api list: response is not valid JSON');
  }

  const list = api.list_path ? dotPath(payload, api.list_path) : payload;
  if (!Array.isArray(list)) throw new Error(`api list: no array at "${api.list_path ?? 'root'}"`);

  const template = api.article_url_template;
  return list.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? '');
    if (!id) return [];
    const customSlug = String(record.customUrl ?? record.slug ?? '').trim();
    const slug = customSlug || id;

    let url: string | null = null;
    if (template) {
      url = template.replace(/\{id\}/g, encodeURIComponent(id)).replace(/\{slug\}/g, encodeURIComponent(slug));
    } else if (typeof record.url === 'string') {
      url = record.url;
    }
    if (!url) return [];

    return [{
      url,
      title: typeof record.title === 'string' ? record.title : undefined,
      publishedAt: apiPublishedAt(record.publishedAt ?? record.publishTime ?? record.date),
      apiId: id,
      ...(typeof record.lang === 'string' ? { apiLang: record.lang } : {}),
    }];
  });
}

export async function discoverSource(
  source: SourceConfig,
  fetchImpl: FetchLike = fetch,
): Promise<DiscoveredArticle[]> {
  const attempts: Array<{ name: string; run: () => Promise<DiscoveredArticle[]> }> = [
    { name: 'api', run: () => fromApi(source, fetchImpl) },
    { name: 'RSS/Atom', run: () => fromFeed(source, fetchImpl) },
    { name: 'sitemap', run: () => fromSitemap(source, fetchImpl) },
    { name: 'listing', run: () => fromListing(source, fetchImpl) },
  ];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const articles = (await attempt.run()).filter((item) => isCandidateArticle(item.url, source));
      if (articles.length) return articles;
      errors.push(`${attempt.name}: no article URLs`);
    } catch (error) {
      errors.push(`${attempt.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`${source.id} discovery failed (${errors.join('; ')})`);
}

export async function diagnoseSourceDiscovery(
  source: SourceConfig,
  fetchImpl: FetchLike = fetch,
): Promise<DiscoveryDiagnostic> {
  interface PathRun {
    diagnostic: DiscoveryPathDiagnostic;
    candidates: DiscoveredArticle[];
  }

  const runPath = async (
    name: DiscoveryPathDiagnostic['name'],
    configured: boolean,
    run: () => Promise<{ rawCount: number; candidates: DiscoveredArticle[] }>,
  ): Promise<PathRun> => {
    const startedAt = Date.now();
    if (!configured) {
      return {
        diagnostic: {
          name,
          configured: false,
          ok: false,
          rawCount: 0,
          candidateCount: 0,
          durationMs: Date.now() - startedAt,
        },
        candidates: [],
      };
    }
    try {
      const { rawCount, candidates } = await run();
      return {
        diagnostic: {
          name,
          configured: true,
          ok: true,
          rawCount,
          candidateCount: candidates.length,
          durationMs: Date.now() - startedAt,
        },
        candidates,
      };
    } catch (error) {
      return {
        diagnostic: {
          name,
          configured: true,
          ok: false,
          rawCount: 0,
          candidateCount: 0,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
        candidates: [],
      };
    }
  };

  const [api, rss, sitemap, listing] = await Promise.all([
    runPath('api', Boolean(source.api?.list_url), async () => {
      const entries = await fromApi(source, fetchImpl);
      return {
        rawCount: entries.length,
        candidates: entries.filter((item) => isCandidateArticle(item.url, source)),
      };
    }),
    runPath('rss', Boolean(source.rss_url), async () => {
      const rssUrl = source.rss_url as string;
      const xml = await fetchText(fetchImpl, rssUrl, `${source.id} RSS`);
      const entries = parseFeed(xml, rssUrl);
      return {
        rawCount: entries.length,
        candidates: entries.filter((item) => isCandidateArticle(item.url, source)),
      };
    }),
    runPath('sitemap', Boolean(source.sitemap_url), async () => {
      const { entries, rawCount } = await collectSitemapEntries(source, fetchImpl);
      return {
        rawCount,
        candidates: entries.filter((item) => isCandidateArticle(item.url, source)),
      };
    }),
    runPath('listing', Boolean(source.blog_url), async () => {
      const listingUrl = source.blog_url as string;
      const html = await fetchText(fetchImpl, listingUrl, `${source.id} listing`);
      const entries = parseListing(html, listingUrl, source);
      return {
        rawCount: entries.length,
        candidates: entries.filter((item) => isCandidateArticle(item.url, source)),
      };
    }),
  ]);

  return {
    sourceId: source.id,
    paths: [api.diagnostic, rss.diagnostic, sitemap.diagnostic, listing.diagnostic],
    candidates: uniqueCanonicalUrls([...api.candidates, ...rss.candidates, ...sitemap.candidates, ...listing.candidates]),
  };
}
