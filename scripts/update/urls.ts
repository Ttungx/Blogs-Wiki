
const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  // Tencent Cloud developer articles append `policyId`, `traceId`, and
  // `frompage` marketing/analytics parameters to otherwise identical URLs.
  'policyid',
  'traceid',
  'frompage',
  'amp',
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
    // Listing pages sometimes keep HTML entities (`&amp;`) un-decoded in href
    // attributes; URL parsing then treats `amp;` as the query key.
    const decoded = value.replace(/&amp;/gi, '&');
    const url = new URL(decoded, base);
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

// 未展开的模板占位符（Liquid/Jinja/JS 模板）。部分站点的 listing 页是客户端渲染，
// HTML 里会泄漏 `{%- postPermalink %}` 一类模板锚点，listing 解析会把它当成 href
// 抓下来（canonicalize 后含 `%7B`/`%7D`）。真实文章 URL 不会出现裸花括号，故任何
// 形式的 `{`/`}`（裸或百分号编码）都判定为非文章，最早排除。
const TEMPLATE_PLACEHOLDER = /%7b|%7d|[{}]/i;

/**
 * 归一化主机名/域名字符串：去 scheme、取首个 `/` 前的段、小写、剥离开头 `www.`。
 * 统一 isLikelyArticleUrl（源 domain）与拉黑门禁（source.domain / extra_domains /
 * blocked.domain）共用一套主机判定语义，避免两处规则漂移。
 */
export function normalizeHostname(value: string): string {
  const withoutScheme = value.includes('://') ? value.slice(value.indexOf('://') + 3) : value;
  const host = withoutScheme.split('/')[0].trim().toLowerCase();
  return host.replace(/^www\./, '');
}

/** host 是否等于 domain 或其子域（剥离 www、大小写不敏感）。 */
export function hostInDomain(host: string, domain: string): boolean {
  const h = normalizeHostname(host);
  const d = normalizeHostname(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/** 两个域名是否相交（互为相等 / 祖先 / 后代）。拉黑域 T 与源声明域 D 的
 *  可发现主机集合 {D}∪{*.D} 与 {T}∪{*.T} 相交 ⟺ 双向判定成立。 */
export function domainsIntersect(a: string, b: string): boolean {
  return hostInDomain(a, b) || hostInDomain(b, a);
}

export interface ArticleUrlOptions {
  /** 为 true 时跳过全局 NON_ARTICLE_PATHS 黑名单，让调用方的 article_paths
   *  白名单完全决定收录范围（用于博客路径含 /press /media 等段的源）。 */
  allowNonArticlePaths?: boolean;
  /** 除主 domain 外同样允许通过 hostname 校验的域名（源级 extra_domains，
   *  用于同一博客的第二域名，如 bearblog 主站 + github.io legacy）。 */
  extraDomains?: string[];
}

export function isLikelyArticleUrl(
  value: string,
  sourceDomain: string,
  options?: ArticleUrlOptions,
): boolean {
  if (TEMPLATE_PLACEHOLDER.test(value)) return false;
  try {
    const url = new URL(value);
    const allowedDomains = [sourceDomain, ...(options?.extraDomains ?? [])];
    if (!allowedDomains.some((domain) => hostInDomain(url.hostname, domain))) return false;
    if (url.pathname === '/' || url.pathname.length < 4) return false;
    if (options?.allowNonArticlePaths) return true;
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

export function articleSlug(_blogId: string, originalUrl: string): string {
  const url = new URL(originalUrl);
  const lastSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'article';
  // 剥掉末段的文件扩展名（greatwork.html → greatwork）
  const stem = lastSegment.replace(/\.[a-z0-9]{1,8}$/i, '');
  const pathPart = slugPart(stem) || 'article';
  // 剥掉日期前缀（2026-07-04-harness → harness）
  const withoutDate = pathPart.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return withoutDate || 'article';
}
