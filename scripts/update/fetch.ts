import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DiscoveredArticle, ExtractedArticle, FetchLike, SourceConfig } from './types';

const execFileAsync = promisify(execFile);

const USER_AGENT = 'BlogsWikiBot/0.1 (+https://github.com; article fetch)';
const FETCH_TIMEOUT_MS = 30_000;
const RETRY_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 2_000;
const MIN_CONTENT_CHARS = 200;

class HttpStatusError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HttpStatusError';
  }
}

/**
 * Some CDNs block the Node TLS fingerprint with HTTP 403 while accepting
 * other TLS stacks (curl, Python). Fall back to the system curl binary once.
 */
async function fetchWithCurl(url: string): Promise<string> {
  const args = [
    '-sS',
    '-L',
    '--max-time',
    String(FETCH_TIMEOUT_MS / 1000),
    '-A',
    USER_AGENT,
    '-H',
    'Accept: text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
  ];
  const proxyEnabled = process.env.USE_PROXY === 'true';
  const proxyUrl = (process.env.PROXY_URL ?? 'http://127.0.0.1:7897').trim();
  if (proxyEnabled && /^https?:\/\//i.test(proxyUrl)) args.push('-x', proxyUrl);
  args.push(url);
  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: FETCH_TIMEOUT_MS,
  });
  return stdout;
}

async function fetchHtml(fetchImpl: FetchLike, url: string, source: SourceConfig): Promise<string> {
  let html: string;
  try {
    const attempt = async (): Promise<string> => {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
          'user-agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new HttpStatusError(response.status, response.statusText);
      return response.text();
    };

    try {
      html = await attempt();
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 403) {
        // Retrying in-process cannot help; the block is fingerprint-based.
        html = await fetchWithCurl(url);
      } else if (error instanceof HttpStatusError && RETRY_STATUSES.has(error.status)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        html = await attempt();
      } else {
        throw error;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source.id} ${url}: ${message}`);
  }
  return html;
}

function metaContent(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return undefined;
}

function resolveAuthor(document: Document): string {
  return (
    metaContent(document, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[property="author"]',
    ]) ?? ''
  );
}

function jsonLdDatePublished(document: Document): string | undefined {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const match = (script.textContent ?? '').match(/"datePublished"\s*:\s*"([^"]+)"/i);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolvePublishedAt(document: Document, discovered: DiscoveredArticle): string {
  const candidates = [
    metaContent(document, ['meta[property="article:published_time"]']),
    metaContent(document, ['meta[name="date"]']),
    metaContent(document, ['meta[itemprop="datePublished"]']),
    jsonLdDatePublished(document),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }
  if (discovered.publishedAt) {
    const normalized = normalizeDate(discovered.publishedAt);
    if (normalized) return normalized;
  }
  return '';
}

function resolveLanguage(document: Document): string {
  for (const value of [
    document.documentElement.getAttribute('lang'),
    metaContent(document, ['meta[property="og:locale"]']),
  ]) {
    const primary = value?.trim().split(/[_-]/)[0]?.toLowerCase();
    if (primary && /^[a-z]{2}$/.test(primary)) return primary;
  }
  return 'en';
}

const NOISE_CLASS_PATTERN =
  /(^|[\s_-])(share|social|sharing|related|recommend(?:ed|ation)?|newsletter|subscribe|comment(?:s)?|author[-_]?(?:bio|box|signature)|signature|footer|sidebar|promo|advert)([\s_-]|$)/i;

function removeNoiseBlocks(content: Element, title: string): void {
  for (const el of content.querySelectorAll(
    'footer, nav, [role="navigation"], [role="complementary"], [role="contentinfo"]',
  )) {
    el.remove();
  }

  const titleKeyword = title.trim().toLowerCase();
  for (const el of content.querySelectorAll('[class], [id]')) {
    const text = (el.textContent ?? '').trim();
    if (text.length > 1000) continue; // likely article content, not a widget
    const token = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`;
    if (NOISE_CLASS_PATTERN.test(token)) {
      el.remove();
    } else if (
      titleKeyword &&
      text.length > 0 &&
      text.length <= 300 &&
      (text.toLowerCase() === titleKeyword || text.toLowerCase().startsWith(titleKeyword))
    ) {
      el.remove(); // duplicated title banner / share headline
    }
  }
}

function absolutizeUrls(root: Element, baseUrl: string): void {
  const base = new URL(baseUrl);
  for (const el of root.querySelectorAll('img[src], a[href]')) {
    const attr = el.tagName === 'IMG' ? 'src' : 'href';
    const value = el.getAttribute(attr);
    if (!value) continue;
    try {
      el.setAttribute(attr, new URL(value, base).toString());
    } catch {
      // leave invalid values untouched
    }
  }
}

function renderTable(table: Element): string {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return '';
  const cells = (row: Element): string[] =>
    [...row.querySelectorAll('th, td')].map(
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  const width = Math.max(1, ...rows.map((row) => cells(row).length));
  const renderRow = (row: string[]): string => {
    const padded = [...row];
    while (padded.length < width) padded.push('');
    return `| ${padded.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
  };
  const lines = [renderRow(cells(rows[0])), `| ${Array(width).fill('---').join(' | ')} |`];
  for (const row of rows.slice(1)) lines.push(renderRow(cells(row)));
  return `\n\n${lines.join('\n')}\n\n`;
}

function toMarkdown(content: HTMLElement): string {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => renderTable(node),
  });
  return turndown.turndown(content).trim();
}

export async function fetchArticle(
  source: SourceConfig,
  discovered: DiscoveredArticle,
  fetchImpl: FetchLike = fetch,
): Promise<ExtractedArticle> {
  let articleUrl: string;
  try {
    articleUrl = new URL(discovered.url, source.homepage_url).toString();
  } catch {
    throw new Error(`${source.id}: invalid article URL ${discovered.url}`);
  }

  const html = await fetchHtml(fetchImpl, articleUrl, source);
  const dom = new JSDOM(html, { url: articleUrl });
  const { document } = dom.window;

  // Head metadata first: Readability.parse() strips <script> nodes from the
  // live document, which would otherwise kill the JSON-LD fallback below.
  const ogTitle = metaContent(document, ['meta[property="og:title"]', 'meta[name="og:title"]']);
  const documentTitle = document.title.trim() || undefined;
  const author = resolveAuthor(document);
  const publishedAt = resolvePublishedAt(document, discovered);
  const originalLanguage = resolveLanguage(document);

  const parsed = new Readability(document).parse();
  if (!parsed?.content) {
    throw new Error(`${source.id} ${articleUrl}: Readability failed to extract article content`);
  }

  const title = ogTitle ?? documentTitle ?? parsed.title?.trim() ?? discovered.title?.trim() ?? '';
  if (!title) {
    throw new Error(`${source.id} ${articleUrl}: no title found (og:title, <title>, Readability, discovered)`);
  }

  const contentNode = document.createElement('div');
  contentNode.innerHTML = parsed.content;
  removeNoiseBlocks(contentNode, title);
  absolutizeUrls(contentNode, articleUrl);

  const textLength = (parsed.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  if (textLength < MIN_CONTENT_CHARS) {
    throw new Error(
      `${source.id} ${articleUrl}: extracted content too short (${textLength} chars, minimum ${MIN_CONTENT_CHARS})`,
    );
  }

  const contentMarkdown = toMarkdown(contentNode);
  if (!contentMarkdown) {
    throw new Error(`${source.id} ${articleUrl}: extracted content is empty after Markdown conversion`);
  }

  return {
    url: articleUrl,
    title,
    author,
    publishedAt,
    originalLanguage,
    contentMarkdown,
  };
}
