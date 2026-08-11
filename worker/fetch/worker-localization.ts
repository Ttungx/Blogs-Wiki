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
