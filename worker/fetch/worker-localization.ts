import { parseHTML } from 'linkedom';

export interface LocalizedAlternate {
  language: string;
  url: string;
}

const DEFAULT_CHINESE_PREFERENCE = ['zh-hans-cn', 'zh-cn', 'zh-hans', 'zh-sg', 'zh'] as const;

function normalizeLanguage(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase();
}

export function findOfficialChineseUrl(html: string, pageUrl: string): string | undefined {
  const { document } = parseHTML(html);
  const alternates: LocalizedAlternate[] = [];
  const seen = new Set<string>();

  for (const element of document.querySelectorAll('link[rel~="alternate"], a[rel~="alternate"]')) {
    const language = normalizeLanguage(
      element.getAttribute('hreflang') ?? element.getAttribute('hrefLang') ?? '',
    );
    const href = element.getAttribute('href');
    if (!language || !href) continue;
    try {
      const url = new URL(href, pageUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      const key = `${language}\0${url.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alternates.push({ language, url: url.toString() });
    } catch {
      // Ignore malformed alternates; original article remains usable.
    }
  }

  const normalized = alternates.map((entry) => ({
    ...entry,
    language: normalizeLanguage(entry.language),
  }));
  for (const preferred of DEFAULT_CHINESE_PREFERENCE) {
    const exact = normalized.find((entry) => entry.language === preferred);
    if (exact) return exact.url;
  }
  return normalized.find(
    (entry) => entry.language === 'zh-hans' || entry.language.startsWith('zh-hans-'),
  )?.url;
}

/**
 * 某些站点（cursor / qwen）在固定路径前缀下提供官方简体中文版
 * （如 `/blog/<slug>` → `/zh/blog/<slug>`）但不声明 hreflang alternate。
 * 探测映射后的 URL；调用方必须验证响应确实是中文再使用。
 */
export function mapToOfficialZhPath(
  pageUrl: string,
  pathMap: Record<string, string> | undefined,
): string | undefined {
  if (!pathMap) return undefined;
  try {
    const url = new URL(pageUrl);
    const pathname = url.pathname.replace(/\/+$/, '');
    for (const [from, to] of Object.entries(pathMap)) {
      const fromPath = from.replace(/\/+$/, '');
      if (pathname === fromPath || pathname.startsWith(`${fromPath}/`)) {
        const suffix = pathname.slice(fromPath.length);
        url.pathname = `${to.replace(/\/+$/, '')}${suffix}/`;
        return url.toString();
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}
