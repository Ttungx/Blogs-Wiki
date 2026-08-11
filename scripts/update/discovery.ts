import type { DiscoveredArticle, FetchLike, SourceConfig } from './types';
import { canonicalizeUrl, isLikelyArticleUrl, uniqueCanonicalUrls } from './urls';
import { proxyUrlFor } from './proxy';
import { getCurlRunner } from '../../worker/fetch/curl-runner';

export interface DiscoveryPathDiagnostic {
  name: 'rss' | 'sitemap' | 'listing';
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
  if (!isLikelyArticleUrl(url, source.domain)) return false;
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
    return await response.text();
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
        return stdout;
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

export function parseListing(html: string, listingUrl: string, sourceDomain: string): DiscoveredArticle[] {
  const anchors = [...html.matchAll(/<a\b([^>]*?)\bhref=["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];
  return uniqueCanonicalUrls(anchors.flatMap((match) => {
    const url = canonicalizeUrl(match[2], listingUrl);
    if (!url || !isLikelyArticleUrl(url, sourceDomain)) return [];
    return [{ url, title: stripTags(match[4]) }];
  }), listingUrl);
}

async function fromFeed(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  if (!source.rss_url) return [];
  return parseFeed(await fetchText(fetchImpl, source.rss_url, `${source.id} RSS`), source.rss_url)
    .filter((item) => isLikelyArticleUrl(item.url, source.domain));
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
    .slice(0, 10);

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
  return entries.filter((item) => isLikelyArticleUrl(item.url, source.domain));
}

async function fromListing(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  const html = await fetchText(fetchImpl, source.blog_url, `${source.id} listing`);
  return parseListing(html, source.blog_url, source.domain);
}

export async function discoverSource(
  source: SourceConfig,
  fetchImpl: FetchLike = fetch,
): Promise<DiscoveredArticle[]> {
  const attempts: Array<{ name: string; run: () => Promise<DiscoveredArticle[]> }> = [
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

  const [rss, sitemap, listing] = await Promise.all([
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
      const entries = parseListing(html, listingUrl, source.domain);
      return {
        rawCount: entries.length,
        candidates: entries.filter((item) => isCandidateArticle(item.url, source)),
      };
    }),
  ]);

  return {
    sourceId: source.id,
    paths: [rss.diagnostic, sitemap.diagnostic, listing.diagnostic],
    candidates: uniqueCanonicalUrls([...rss.candidates, ...sitemap.candidates, ...listing.candidates]),
  };
}
