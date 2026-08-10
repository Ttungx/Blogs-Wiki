import { createHash } from 'node:crypto';

const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

const NON_ARTICLE_PATHS = [
  /\/(?:feed|rss|atom)(?:\/|$)/i,
  /\/(?:tag|tags|category|categories|author|authors)(?:\/|$)/i,
  /\/(?:page|search)(?:\/|$)/i,
  /\/(?:careers?|jobs|about|about-us|company|team|contact|help|support)(?:\/|$)/i,
  // NOTE: `security` is intentionally excluded — it is a valid technical
  // topic prefix for sources like OpenAI Security / Google Security Blog,
  // not only a legal/contact page. Press/newsroom/media stay excluded.
  /\/(?:legal|privacy|terms|press|newsroom|media|pricing)(?:\/|$)/i,
  /\/(?:index|default)\.html?$/i,
  /\.(?:xml|json|txt|jpg|jpeg|png|gif|webp|svg|pdf|zip)$/i,
];

export function canonicalizeUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.protocol === 'http:') url.protocol = 'https:';
    if ((url.protocol === 'https:' && url.port === '443') || url.port === '80') url.port = '';

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    const sorted = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
      aKey.localeCompare(bKey) || aValue.localeCompare(bValue),
    );
    url.search = '';
    for (const [key, item] of sorted) url.searchParams.append(key, item);

    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function isLikelyArticleUrl(value: string, sourceDomain: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const expectedHost = sourceDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (host !== expectedHost && !host.endsWith(`.${expectedHost}`)) return false;
    if (url.pathname === '/' || url.pathname.length < 4) return false;
    return !NON_ARTICLE_PATHS.some((pattern) => pattern.test(url.pathname));
  } catch {
    return false;
  }
}

export function uniqueCanonicalUrls(
  values: Iterable<{ url: string; title?: string; publishedAt?: string }>,
  base?: string,
): Array<{ url: string; title?: string; publishedAt?: string }> {
  const seen = new Set<string>();
  const result: Array<{ url: string; title?: string; publishedAt?: string }> = [];

  for (const item of values) {
    const url = canonicalizeUrl(item.url, base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ ...item, url });
  }

  return result;
}

function slugPart(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
}

export function articleSlug(blogId: string, originalUrl: string): string {
  const url = new URL(originalUrl);
  const pathPart = slugPart(url.pathname.split('/').filter(Boolean).at(-1) ?? 'article') || 'article';
  const hash = createHash('sha256').update(originalUrl).digest('hex').slice(0, 8);
  return `${slugPart(blogId) || 'source'}-${pathPart}-${hash}`;
}
