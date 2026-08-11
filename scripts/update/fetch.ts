import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { proxyUrlFor } from './network';
import { findOfficialChineseUrl, mapToOfficialZhPath } from './localization';
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
  const proxyUrl = proxyUrlFor(url);
  if (proxyUrl) args.push('-x', proxyUrl);
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

function absoluteHttpUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Page URLs sometimes omit the trailing slash (e.g. Jekyll permalinks like
 * `/posts/2026-07-04-harness`). URL resolution against such a base treats the
 * last path segment as a file name, so relative image/link paths lose the
 * article directory. Normalize the base to a directory form when the last
 * segment has no file extension.
 */
export function directoryBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname;
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!pathname.endsWith('/') && !/\.[a-z0-9]{1,8}$/i.test(lastSegment)) {
    url.pathname = `${pathname}/`;
  }
  return url.toString();
}

function resolveHeadImage(document: Document, articleUrl: string): string | undefined {
  const value =
    metaContent(document, [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]) ?? document.querySelector('link[rel="image_src"]')?.getAttribute('href')?.trim();
  return absoluteHttpUrl(value, articleUrl);
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

/**
 * Some sites (ai.meta.com, keli-wen.github.io) expose the publish date only
 * as visible body text: "July 9, 2026" or "2025/01/10". Readability's
 * `parsed.textContent` is the cleanest post-extraction text, so this runs
 * after extraction and only accepts well-formed calendar dates that appear
 * near the start of the article (first 1600 chars), which keeps footer
 * copyrights and reference dates out of the running.
 */
const VISIBLE_DATE_HEAD_LIMIT = 1600;

const VISIBLE_DATE_PATTERNS: Array<{ pattern: RegExp; normalize: (match: RegExpMatchArray) => string | null }> = [
  {
    // "July 9, 2026" / "Jul 9, 2026"
    pattern: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})\b/i,
    normalize: (match) => {
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
      ];
      const [, monthText, dayText, yearText] = match;
      const month = monthNames.findIndex((name) => monthText.toLowerCase().startsWith(name.slice(0, 3)));
      const day = Number(dayText);
      const year = Number(yearText);
      if (month < 0 || day < 1 || day > 31) return null;
      const date = new Date(Date.UTC(year, month, day));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    },
  },
  {
    // "2025/01/10" / "2026-1-5"
    pattern: /\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/,
    normalize: (match) => {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const date = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    },
  },
  {
    // "2025年1月10日"
    pattern: /(20\d{2})年(\d{1,2})月(\d{1,2})日/,
    normalize: (match) => {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const date = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    },
  },
];

export function resolveVisibleDate(text: string): string {
  const head = text.replace(/\s+/g, ' ').slice(0, VISIBLE_DATE_HEAD_LIMIT);
  for (const entry of VISIBLE_DATE_PATTERNS) {
    const match = head.match(entry.pattern);
    if (!match) continue;
    const normalized = entry.normalize(match);
    if (normalized) return normalized;
  }
  return '';
}

/**
 * Date near the article heading that Readability strips as a header (e.g.
 * ai.meta.com renders `<span class="_amum">July 9, 2026</span>` under the
 * <h1>). Scan the heading's siblings and the page head text before
 * extraction, so the date survives even when it never reaches
 * `parsed.textContent`.
 */
function resolveHeadingDate(document: Document): string {
  const heading = document.querySelector('article h1, main h1, [role="main"] h1, h1');
  if (!heading) return '';
  const siblings = heading.parentElement
    ? Array.from(heading.parentElement.children).filter((child) => child !== heading)
    : [];
  const nearby = [heading.parentElement, ...siblings]
    .map((node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim())
    .join(' | ');
  return resolveVisibleDate(nearby);
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

export function removeNoiseBlocks(content: Element, title: string): void {
  for (const el of content.querySelectorAll(
    'footer, nav, [role="navigation"], [role="complementary"], [role="contentinfo"]',
  )) {
    // A <footer> inside a <blockquote> is testimonial attribution (speaker
    // name/title), not page chrome — keep it.
    if (el.tagName === 'FOOTER' && el.closest('blockquote')) continue;
    el.remove();
  }

  const titleKeyword = title.trim().toLowerCase();
  for (const el of content.querySelectorAll('[class], [id]')) {
    // Never strip quote/testimonial internals: class tokens like "footer"
    // (e.g. .quote-footer) would otherwise delete speaker attribution.
    if (el.closest('blockquote')) continue;
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

/**
 * Readability unconditionally strips every <footer> from the extracted article
 * content (`_clean(articleContent, "footer")`), and its unlikely-candidate
 * scan removes elements whose class/id contains noise tokens such as "footer"
 * (e.g. `.quote-footer`). Both would destroy testimonial attribution
 * (`footer > cite` inside a <blockquote>). Rename blockquote-internal footers
 * to a neutral, attribute-free <span> before extraction so speaker names
 * survive; page-level footers are still dropped as noise afterwards.
 */
function preserveBlockquoteFooters(document: Document): void {
  for (const footer of document.querySelectorAll('blockquote footer')) {
    const span = document.createElement('span');
    while (footer.firstChild) span.appendChild(footer.firstChild);
    footer.replaceWith(span);
  }
}

/**
 * Some CMSs (e.g. research.google) wrap every body image in a textless
 * container (`dynamic_media` / `glue-grid` divs) that Readability scores as
 * non-content and removes, dropping the picture entirely. Before extraction,
 * lift such image-only containers into a semantic `<figure>` with a
 * `<figcaption>` when a caption is present, so Readability keeps them and
 * Turndown renders the original remote URL.
 *
 * Only containers that are dominated by a single `<picture>` and carry little
 * or no prose are touched; text blocks and multi-image galleries are left
 * alone. The `<picture>` is unwrapped to its inner `<img>` with the highest-
 * resolution srcset candidate so the final Markdown keeps one canonical image.
 */
// Captions on research.google can run a few hundred characters, so the host
// walk must tolerate that much prose without stopping early (stopping too
// early leaves the figure nested in a `dynamic_media` div that Readability
// still scores as non-content and removes).
const PICTURE_HOST_MAX_TEXT = 1200;
const PICTURE_HOST_MAX_PARAGRAPHS = 1;

function unwrapPictureToImage(picture: Element): HTMLImageElement | null {
  const img = picture.querySelector('img');
  if (!img) return null;
  const srcset = picture.querySelector('source[srcset]')?.getAttribute('srcset') ?? '';
  const largest = srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/))
    .filter((parts) => parts[0] && parts[0].startsWith('http'))
    .sort((a, b) => Number.parseFloat(b[1] ?? '0') - Number.parseFloat(a[1] ?? '0'))[0]?.[0];
  if (largest) img.setAttribute('src', largest);
  return img;
}

export function protectPictureFigures(root: Element): number {
  let protectedCount = 0;
  for (const picture of [...root.querySelectorAll('picture')]) {
    if (picture.closest('figure')) continue;
    const img = picture.querySelector('img');
    if (!img || img.hasAttribute('data-nosnippet')) continue;

    // Walk up while the host stays image-dominated: almost no prose and at
    // most one paragraph (a caption). Stop at a text block or another picture
    // (multi-image gallery), and never cross into a <figure>.
    let host = picture;
    for (let depth = 0; depth < 6 && host.parentElement && host.parentElement !== root; depth += 1) {
      const parent = host.parentElement;
      if (parent.closest('figure')) break;
      const text = (parent.textContent ?? '').replace(/\s+/g, ' ').trim();
      const paragraphs = parent.querySelectorAll('p').length;
      const pictures = parent.querySelectorAll('picture').length;
      if (text.length > PICTURE_HOST_MAX_TEXT || paragraphs > PICTURE_HOST_MAX_PARAGRAPHS || pictures > 1) break;
      host = parent;
    }

    const figure = root.ownerDocument.createElement('figure');
    const image = unwrapPictureToImage(picture);
    if (!image) continue;
    figure.appendChild(image);

    // Preserve an adjacent caption (`.caption`, `.wp-caption-text`, or a
    // standalone <p> inside the host) as <figcaption>.
    // Extract any caption living inside the host (`.caption`,
    // `.wp-caption-text`, `figcaption`, or the first short <p>) so it is not
    // lost when the whole host is replaced by the figure.
    const caption = host.querySelector('.caption, .wp-caption-text, figcaption') ?? Array.from(
      host.querySelectorAll('p'),
    ).find((paragraph) => (paragraph.textContent ?? '').trim().length <= 300);
    if (caption && (caption.textContent ?? '').trim()) {
      const figcaption = root.ownerDocument.createElement('figcaption');
      figcaption.textContent = (caption.textContent ?? '').trim();
      figure.appendChild(figcaption);
    }

    host.replaceWith(figure);
    protectedCount += 1;
  }
  return protectedCount;
}

const CAROUSEL_CONTAINER_PATTERN = /(^|[\s_-])carousel([\s_-]|$)/i;
const CAROUSEL_ITEM_PATTERN = /(^|[\s_-])carousel[-_]?item([\s_-]|$)/i;
const CAROUSEL_UI_PATTERN =
  /(^|[\s_-])(pagination|dots?|indicators?|arrows?|prev|next|controls?|navigation|nav|counter|progress)([\s_-]|$)/i;
const LOGO_ALT_PATTERN = /logo/i;
const MAX_CAROUSEL_ITEMS = 3;

function isCarouselItem(element: Element): boolean {
  const token = `${element.getAttribute('class') ?? ''} ${element.getAttribute('id') ?? ''}`;
  if (CAROUSEL_ITEM_PATTERN.test(token)) return true;
  const image = element.querySelector('img');
  return Boolean(
    image && LOGO_ALT_PATTERN.test(image.getAttribute('alt') ?? '') && element.querySelector('blockquote'),
  );
}

function findCarouselContainers(root: Element): Element[] {
  const candidates: Element[] = [];
  const scan = [root, ...root.querySelectorAll('*')];

  // Heuristic: an element whose class/id mentions "carousel" ...
  for (const element of scan) {
    const token = `${element.getAttribute('class') ?? ''} ${element.getAttribute('id') ?? ''}`;
    if (CAROUSEL_CONTAINER_PATTERN.test(token)) candidates.push(element);
  }
  // ... or a wrapper that directly carries at least 2 items shaped like
  // "logo image + blockquote" (this is what survives Readability, which
  // strips class names before Turndown ever runs).
  for (const element of scan) {
    let itemChildren = 0;
    for (const child of element.children) {
      if (isCarouselItem(child)) itemChildren += 1;
    }
    if (itemChildren >= 2) candidates.push(element);
  }

  const unique = [...new Set(candidates)];
  // Only the outermost container of a nesting chain is collapsed, otherwise
  // inner wrappers (e.g. a track) would be processed repeatedly.
  return unique.filter(
    (candidate) => !unique.some((other) => other !== candidate && other.contains(candidate)),
  );
}

function findCarouselItems(container: Element): Element[] {
  const matches = [...container.querySelectorAll('*')].filter((element) => isCarouselItem(element));
  // A wrapper (e.g. the track) also matches the "logo + quote" shape, so keep
  // only the deepest matches — an element that contains another match is a
  // wrapper, not a slide.
  return matches.filter((item) => !matches.some((other) => other !== item && item.contains(other)));
}

/**
 * Collapse testimonial carousels before noise removal and Markdown conversion.
 * Readability flattens the whole carousel DOM (e.g. 16 slides), which Turndown
 * then renders as 16 standalone logo images plus un-attributed quotes. Keep
 * only the first MAX_CAROUSEL_ITEMS slides (logo + quote + attribution), drop
 * UI chrome (page counters, arrows, dots, navigation) and append a pointer to
 * the original article. Non-carousel content is left untouched.
 */
export function collapseCarousels(root: Element, articleUrl: string): void {
  const containers = findCarouselContainers(root);
  if (!containers.length) return;

  for (const container of containers) {
    const items = findCarouselItems(container);
    if (!items.length) continue;

    const kept = items.slice(0, MAX_CAROUSEL_ITEMS);
    const keptSet = new Set(kept);
    for (const item of items.slice(MAX_CAROUSEL_ITEMS)) item.remove();

    // Remove carousel chrome (counter, arrows, dots, nav) while preserving
    // wrappers that contain kept items (e.g. the track element).
    for (const ui of container.querySelectorAll('[class], [id]')) {
      if (keptSet.has(ui)) continue;
      if (kept.some((item) => item.contains(ui) || ui.contains(item))) continue;
      const token = `${ui.getAttribute('class') ?? ''} ${ui.getAttribute('id') ?? ''}`;
      if (CAROUSEL_UI_PATTERN.test(token)) ui.remove();
    }

    const note = container.ownerDocument.createElement('p');
    const link = container.ownerDocument.createElement('a');
    link.href = articleUrl;
    link.textContent = '原文';
    note.append('更多客户证言请见');
    note.appendChild(link);
    note.append('。');
    container.appendChild(note);
  }
}

function srcsetCandidates(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((candidate, index) => {
      const [url = '', descriptor = ''] = candidate.trim().split(/\s+/);
      const amount = Number.parseFloat(descriptor);
      const score = Number.isFinite(amount) ? amount : 0;
      return { url, score, index };
    })
    .filter((candidate) => candidate.url)
    .sort((left, right) => right.score - left.score || right.index - left.index)
    .map((candidate) => candidate.url);
}

export function resolveImageUrl(image: Element, baseUrl: string): string | undefined {
  const pictureSrcset = image.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset') ?? null;
  const candidates = [
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
    image.getAttribute('data-src'),
    ...srcsetCandidates(image.getAttribute('srcset')),
    ...srcsetCandidates(pictureSrcset),
    image.getAttribute('src'),
  ];

  for (const value of candidates) {
    if (!value || /^(?:data|blob):/i.test(value)) continue;
    try {
      const url = new URL(value, baseUrl);
      if (/^https?:$/.test(url.protocol)) return url.toString();
    } catch {
      // Try the next lazy-loading or srcset candidate.
    }
  }
  return undefined;
}

function absolutizeUrls(root: Element, baseUrl: string): void {
  const base = directoryBaseUrl(baseUrl);
  for (const image of root.querySelectorAll('img')) {
    const url = resolveImageUrl(image, base);
    if (url) image.setAttribute('src', url);
  }
  for (const anchor of root.querySelectorAll('a[href]')) {
    const value = anchor.getAttribute('href');
    if (!value) continue;
    try {
      anchor.setAttribute('href', new URL(value, base).toString());
    } catch {
      // Leave invalid values untouched.
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

const RELATED_SECTION_HEADING =
  /^#{1,6}\s+(?:\*{1,2})?(?:related(?:\s+(?:content|articles?|posts?))?|you may also like|相关阅读|相关内容|推荐阅读)(?:\*{1,2})?\s*$/i;

/**
 * Remove presentation-only fragments that Readability can flatten into the
 * article body. These fragments have no editorial meaning once detached from
 * their source carousel or recommendation widget.
 */
export function normalizeArticleMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const relatedIndex = lines.findIndex((line) => RELATED_SECTION_HEADING.test(line.trim()));
  const body = (relatedIndex >= 0 ? lines.slice(0, relatedIndex) : lines).join('\n');

  return body
    .replace(/(?:^|\n)\s*\d{1,2}\s*\/\s*(?:\n\s*)?\d{1,2}\s*(?=\n|$)/g, '\n')
    .replace(/!\[\s*logo\s*\]/gi, '![logo]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const headImageUrl = resolveHeadImage(document, articleUrl);
  const originalLanguage = resolveLanguage(document);
  // Capture the heading-adjacent visible date before Readability rewrites the
  // DOM (it strips h1/header siblings, which would otherwise hide the date).
  const headingDate = resolveHeadingDate(document);

  // Readability strips every <footer> (including testimonial attribution
  // inside <blockquote>s) and deletes elements whose class/id matches noise
  // tokens, so protect quote attribution before extraction.
  preserveBlockquoteFooters(document);
  // Readability drops textless image-only containers (e.g. research.google's
  // `dynamic_media` wrappers); lift them into semantic figures first.
  protectPictureFigures(document.body);

  const parsed = new Readability(document).parse();
  if (!parsed?.content) {
    throw new Error(`${source.id} ${articleUrl}: Readability failed to extract article content`);
  }
  // Fall back to a visible publish date when the page exposes none in
  // meta/JSON-LD (ai.meta.com, keli-wen.github.io). Runs on the extracted
  // body text so footer copyrights and nav dates are out of scope.
  const publishedAt =
    resolvePublishedAt(document, discovered) ||
    headingDate ||
    resolveVisibleDate(parsed.textContent ?? '');

  const title = ogTitle ?? documentTitle ?? parsed.title?.trim() ?? discovered.title?.trim() ?? '';
  if (!title) {
    throw new Error(`${source.id} ${articleUrl}: no title found (og:title, <title>, Readability, discovered)`);
  }

  const contentNode = document.createElement('div');
  contentNode.innerHTML = parsed.content;
  collapseCarousels(contentNode, articleUrl);
  removeNoiseBlocks(contentNode, title);
  absolutizeUrls(contentNode, articleUrl);
  const imageUrl =
    headImageUrl ?? absoluteHttpUrl(contentNode.querySelector('img[src]')?.getAttribute('src') ?? undefined, articleUrl);

  const textLength = (parsed.textContent ?? '').replace(/\s+/g, ' ').trim().length;
  if (textLength < MIN_CONTENT_CHARS) {
    throw new Error(
      `${source.id} ${articleUrl}: extracted content too short (${textLength} chars, minimum ${MIN_CONTENT_CHARS})`,
    );
  }

  const contentMarkdown = normalizeArticleMarkdown(toMarkdown(contentNode));
  if (!contentMarkdown) {
    throw new Error(`${source.id} ${articleUrl}: extracted content is empty after Markdown conversion`);
  }

  return {
    url: articleUrl,
    title,
    author,
    ...(imageUrl ? { imageUrl } : {}),
    publishedAt,
    originalLanguage,
    contentMarkdown,
  };
}

/**
 * Fetch an article preferring the official Simplified Chinese alternate when
 * one is advertised via `rel=alternate` + `hreflang` (or a matching zh link).
 * When a Chinese page is found and extracted successfully, it is returned
 * with `officialZhUrl` pointing at the original URL and `contentSource:
 * 'official-zh'`; otherwise the original page is returned untouched.
 */
export async function fetchArticleWithLocalization(
  source: SourceConfig,
  discovered: DiscoveredArticle,
  fetchImpl: FetchLike = fetch,
): Promise<ExtractedArticle> {
  const original = await fetchArticle(source, discovered, fetchImpl);
  if (original.originalLanguage === 'zh') {
    return { ...original, contentSource: 'native-zh' };
  }
  if (!source.prefer_official_zh) return original;

  let officialZhUrl: string | undefined;
  try {
    const html = await fetchHtml(fetchImpl, original.url, source);
    officialZhUrl = findOfficialChineseUrl(html, original.url);
    officialZhUrl ??= mapToOfficialZhPath(original.url, source.zh_path_map);
  } catch {
    // Localization probing is best-effort; fall back to the path map probe.
    officialZhUrl = mapToOfficialZhPath(original.url, source.zh_path_map);
  }
  if (!officialZhUrl || officialZhUrl === original.url) return original;

  try {
    const zhArticle = await fetchArticle(
      source,
      { url: officialZhUrl, title: original.title, publishedAt: original.publishedAt },
      fetchImpl,
    );
    if (zhArticle.originalLanguage !== 'zh') return original;
    return { ...zhArticle, officialZhUrl: original.url, contentSource: 'official-zh' };
  } catch {
    return original;
  }
}
