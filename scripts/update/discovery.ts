import type { DiscoveredArticle, FetchLike, SourceConfig } from './types';
import { canonicalizeUrl, isLikelyArticleUrl, uniqueCanonicalUrls } from './urls';

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

function isCandidateArticle(url: string, source: SourceConfig): boolean {
  if (!isLikelyArticleUrl(url, source.domain)) return false;
  if (!source.article_paths?.length) return true;
  const pathname = new URL(url).pathname.replace(/\/+$/, '');
  return source.article_paths.some((prefix) => {
    const normalized = prefix.replace(/\/+$/, '');
    // The article must live under the prefix; the bare prefix itself (e.g.
    // the /news listing page) is not an article.
    return pathname.startsWith(`${normalized}/`);
  });
}

async function fetchText(fetchImpl: FetchLike, url: string, context: string): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8',
      'user-agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) throw new Error(`${context}: HTTP ${response.status} ${response.statusText}`);
  return response.text();
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

async function fromSitemap(source: SourceConfig, fetchImpl: FetchLike): Promise<DiscoveredArticle[]> {
  if (!source.sitemap_url) return [];
  const rootXml = await fetchText(fetchImpl, source.sitemap_url, `${source.id} sitemap`);
  const rootEntries = parseSitemap(rootXml, source.sitemap_url);
  const childSitemaps = rootEntries.filter((item) => item.childSitemap).slice(0, 10);

  if (!childSitemaps.length) {
    return rootEntries.filter((item) => isLikelyArticleUrl(item.url, source.domain));
  }

  const childResults = await Promise.allSettled(childSitemaps.map(async ({ url }) => {
    const xml = await fetchText(fetchImpl, url, `${source.id} child sitemap`);
    return parseSitemap(xml, url);
  }));

  return uniqueCanonicalUrls(childResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )).filter((item) => isLikelyArticleUrl(item.url, source.domain));
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
