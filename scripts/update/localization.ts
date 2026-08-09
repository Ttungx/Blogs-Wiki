import { JSDOM } from 'jsdom';

export interface LocalizedAlternate {
  language: string;
  url: string;
}

const DEFAULT_CHINESE_PREFERENCE = ['zh-hans-cn', 'zh-cn', 'zh-hans', 'zh-sg', 'zh'] as const;

function normalizeLanguage(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase();
}

export function extractLocalizedAlternates(html: string, pageUrl: string): LocalizedAlternate[] {
  const document = new JSDOM(html, { url: pageUrl }).window.document;
  const seen = new Set<string>();
  const alternates: LocalizedAlternate[] = [];

  for (const element of document.querySelectorAll('link[rel~="alternate"][hreflang][href], a[rel~="alternate"][hreflang][href]')) {
    const language = normalizeLanguage(element.getAttribute('hreflang') ?? '');
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
      // Invalid alternates are ignored; the original article remains usable.
    }
  }
  return alternates;
}

export function selectOfficialChineseAlternate(
  alternates: readonly LocalizedAlternate[],
  preference: readonly string[] = DEFAULT_CHINESE_PREFERENCE,
): LocalizedAlternate | undefined {
  const normalized = alternates.map((entry) => ({ ...entry, language: normalizeLanguage(entry.language) }));
  for (const preferred of preference.map(normalizeLanguage)) {
    const exact = normalized.find((entry) => entry.language === preferred);
    if (exact) return exact;
  }
  return normalized.find((entry) => entry.language === 'zh-hans' || entry.language.startsWith('zh-hans-'));
}

export function findOfficialChineseUrl(html: string, pageUrl: string): string | undefined {
  return selectOfficialChineseAlternate(extractLocalizedAlternates(html, pageUrl))?.url;
}
