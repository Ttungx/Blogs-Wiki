import { extractArticle } from './extractor';
import { findOfficialChineseUrl, mapToOfficialZhPath } from './worker-localization';
import { getCurlRunner } from './curl-runner';
import { proxyUrlFor } from '../../scripts/update/proxy';
import { resolveGitDate } from '../../scripts/update/git-date';
import { urlDateFromPattern } from '../../scripts/update/url-date';
import type { SourceConfig } from '../../scripts/update/types';
import { DEFAULT_MIN_CONTENT_CHARS as MIN_CONTENT_CHARS } from '../../scripts/update/constants';
import { extractMetaRefreshUrl } from '../../scripts/update/meta-refresh';

export interface WorkerArticleSource {
  id: string;
  homepageUrl: string;
  preferOfficialZh?: boolean;
  /** 从 URL 路径推断发布日期的正则（simonwillison.net 等）。 */
  urlDatePattern?: string;
  /** en URL 前缀 → 官方简体中文前缀映射（cursor / qwen，无 hreflang 时探测）。 */
  zhPathMap?: Record<string, string>;
  /** GitHub 提交历史日期兜底（无机器可读日期的 GitHub Pages 博客）。 */
  gitDate?: SourceConfig['git_date'];
  /** JSON-API 来源配置（腾讯混元等 React SPA）。 */
  api?: SourceConfig['api'];
  /** 正文最小纯文本字符数；未设则用 DEFAULT_MIN_CONTENT_CHARS。 */
  minContentChars?: number;
}

export interface WorkerDiscoveredArticle {
  url: string;
  title?: string;
  publishedAt?: string;
  apiId?: string;
  apiLang?: string;
}

export interface WorkerArticleResult {
  url: string;
  title: string;
  author: string;
  imageUrl: string;
  publishedAt: string;
  originalLanguage: string;
  contentMarkdown: string;
  officialZhUrl?: string;
  contentSource?: 'official-zh' | 'native-zh';
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const FETCH_TIMEOUT_MS = 30_000;
const RETRY_STATUSES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 2_000;

function dotPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

class HttpStatusError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HttpStatusError';
  }
}

/**
 * 部分 CDN（如 openai.com）按 Node TLS 指纹返回 403，但接受 curl 的 TLS
 * 栈。回退到系统 curl 一次（与 scripts/update/fetch.ts 行为对齐）。
 * 仅 Node 侧可用（curl-runner 注册）；Worker 运行时 runner 为 null，
 * 直接抛出原错误（Cloudflare fetch 栈不受指纹拦截影响）。
 */
async function fetchWithCurl(url: string, proxyUrl?: string): Promise<string> {
  const runner = getCurlRunner();
  if (!runner) {
    throw new Error('HTTP 403: TLS fingerprint blocked, but no curl fallback available');
  }
  const args = [
    '-sS',
    '-L',
    '--max-time',
    String(FETCH_TIMEOUT_MS / 1000),
    '-A',
    'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
    '-H',
    'Accept: text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
  ];
  if (proxyUrl) args.push('-x', proxyUrl);
  args.push(url);
  const { stdout } = await runner(args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: FETCH_TIMEOUT_MS,
  });
  return stdout;
}

async function fetchWithRetry(fetchImpl: FetchLike, url: string, sourceId: string): Promise<string> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
        'user-agent': 'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new HttpStatusError(response.status, response.statusText);
    return await response.text();
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 403) {
      // 指纹拦截无法通过进程内重试解决，回退 curl。
      return fetchWithCurl(url, proxyUrlFor(url));
    }
    if (error instanceof HttpStatusError && RETRY_STATUSES.has(error.status)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchWithRetry(fetchImpl, url, sourceId);
    }
    throw error;
  }
}

/**
 * 某些站点（ai.meta.com、keli-wen.github.io）仅把发布日期写在可见正文里。
 * 在 Defuddle 提取结果无日期时，从正文文本与标题附近文本解析回退日期。
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
      const month = monthNames.findIndex((name) => match[1].toLowerCase().startsWith(name.slice(0, 3)));
      const day = Number(match[2]);
      const year = Number(match[3]);
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

async function fetchHtml(fetchImpl: FetchLike, url: string, sourceId: string): Promise<string> {
  try {
    return await fetchWithRetry(fetchImpl, url, sourceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${sourceId} ${url}: ${message}`);
  }
}

/**
 * JSON-API 来源（腾讯混元等 React SPA）：正文与元数据直接由详情接口返回
 * Markdown，无需 HTML 解析。`lang` 参数由本地化层指定。
 */
async function fetchWorkerApiArticle(
  source: WorkerArticleSource,
  discovered: WorkerDiscoveredArticle,
  articleUrl: string,
  fetchImpl: FetchLike,
  language?: string,
): Promise<WorkerArticleResult> {
  const api = source.api;
  if (!api?.detail_url) {
    throw new Error(`${source.id}: api source missing detail_url`);
  }
  const lang = language ?? discovered.apiLang ?? 'en';
  const body = JSON.stringify(api.detail_body
    ? Object.fromEntries(Object.entries(api.detail_body).map(([key, value]) => [
        key,
        typeof value === 'string' && value === '{id}' && discovered.apiId !== undefined
          ? /^\d+$/.test(discovered.apiId)
            ? Number(discovered.apiId)
            : discovered.apiId
          : typeof value === 'string'
            ? value.replace(/\{id\}/g, discovered.apiId ?? '').replace(/\{lang\}/g, lang)
            : value,
      ]))
    : { id: discovered.apiId, lang });

  let payload: unknown;
  try {
    let requestOrigin: string;
    try {
      requestOrigin = new URL(source.homepageUrl).origin;
    } catch {
      requestOrigin = new URL(api.detail_url).origin;
    }
    const response = await fetchImpl(api.detail_url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'user-agent': 'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
        origin: requestOrigin,
        referer: source.homepageUrl,
        ...(api.detail_headers
          ? Object.fromEntries(Object.entries(api.detail_headers).map(([key, value]) => [
              key,
              value.replace(/\{lang\}/g, lang).replace(/\{id\}/g, discovered.apiId ?? ''),
            ]))
          : {}),
      },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`api detail: HTTP ${response.status} ${response.statusText}`);
    }
    payload = JSON.parse(await response.text());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source.id} ${articleUrl}: ${message}`);
  }

  const detailContainer =
    api.content_path?.split('.').slice(0, -1).join('.') || '';
  const detail = detailContainer ? dotPath(payload, detailContainer) : payload;
  const content =
    (api.content_path ? dotPath(payload, api.content_path) : undefined) ??
    (typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>).content
      : undefined);
  const title =
    (api.title_path ? dotPath(payload, api.title_path) : undefined) ??
    (typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>).title
      : undefined);
  const author =
    (api.author_path ? dotPath(payload, api.author_path) : undefined) ??
    (typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>).author
      : undefined);
  const imageUrl =
    (api.image_path ? dotPath(payload, api.image_path) : undefined) ??
    (typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>).coverImage
      : undefined);
  const publishedAtRaw =
    (api.published_at_path ? dotPath(payload, api.published_at_path) : undefined) ??
    discovered.publishedAt;
  const responseLang =
    (api.language_path ? dotPath(payload, api.language_path) : undefined) ??
    (typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>).lang
      : undefined);

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${source.id} ${articleUrl}: api detail returned no content`);
  }
  const contentMarkdown = content.trim();
  if (contentMarkdown.replace(/\s+/g, ' ').length < MIN_CONTENT_CHARS) {
    throw new Error(`${source.id} ${articleUrl}: api content too short (minimum ${MIN_CONTENT_CHARS} chars)`);
  }
  const resolvedTitle = typeof title === 'string' && title.trim()
    ? title.trim()
    : discovered.title?.trim() ?? '';
  if (!resolvedTitle) {
    throw new Error(`${source.id} ${articleUrl}: no title found in api detail`);
  }
  const publishedAt =
    (typeof publishedAtRaw === 'number' ? new Date(publishedAtRaw * 1000).toISOString() : undefined) ??
    (typeof publishedAtRaw === 'string' && publishedAtRaw.trim() ? publishedAtRaw : '') ??
    '';
  const originalLanguage =
    typeof responseLang === 'string' && /^[a-z]{2}$/i.test(responseLang.trim())
      ? responseLang.trim().toLowerCase()
      : lang.split(/[_-]/)[0]?.toLowerCase() || 'en';

  return {
    url: articleUrl,
    title: resolvedTitle,
    author: typeof author === 'string' ? author.trim() : '',
    imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
    publishedAt,
    originalLanguage,
    contentMarkdown,
  };
}

export async function fetchWorkerArticle(
  source: WorkerArticleSource,
  discovered: WorkerDiscoveredArticle,
  fetchImpl: FetchLike = fetch,
): Promise<WorkerArticleResult> {
  let articleUrl: string;
  try {
    articleUrl = new URL(discovered.url, source.homepageUrl).toString();
  } catch {
    throw new Error(`${source.id}: invalid article URL ${discovered.url}`);
  }

  if (source.api) {
    return fetchWorkerApiArticle(source, discovered, articleUrl, fetchImpl);
  }

  let html = await fetchHtml(fetchImpl, articleUrl, source.id);
  // meta-refresh 壳页跟随（与 Node 抓取链一致）。
  const refreshTarget = extractMetaRefreshUrl(html, articleUrl);
  if (refreshTarget) {
    html = await fetchHtml(fetchImpl, refreshTarget, source.id);
  }
  const extracted = await extractArticle({ html, url: articleUrl, minContentChars: source.minContentChars });
  const title = extracted.title || discovered.title?.trim() || '';
  if (!title) {
    throw new Error(`${source.id} ${articleUrl}: no title found`);
  }
  // Defuddle 拿不到机器可读日期时回退到可见正文日期（ai.meta.com、
  // keli-wen.github.io）。正文文本比整页文本干净，页脚版权不在范围内。
  // 配置了 url_date_pattern 的源（simonwillison.net）以 URL 路径日期为准：
  // 页面正文常引用更早年份（如 "Turbo Pascal 1986"），Defuddle 会误取。
  const publishedAt =
    (source.urlDatePattern ? urlDateFromPattern(source.urlDatePattern, articleUrl) : '') ||
    extracted.publishedAt ||
    discovered.publishedAt?.trim() ||
    resolveVisibleDate(extracted.contentMarkdown) ||
    (source.gitDate
      ? await resolveGitDate(
          { id: source.id, homepage_url: source.homepageUrl, git_date: source.gitDate } as SourceConfig,
          articleUrl,
          fetchImpl,
        )
      : '') ||
    '';

  return {
    url: articleUrl,
    title,
    author: extracted.author,
    imageUrl: extracted.imageUrl,
    publishedAt,
    originalLanguage: extracted.originalLanguage,
    contentMarkdown: extracted.contentMarkdown,
  };
}

export async function fetchWorkerArticleWithLocalization(
  source: WorkerArticleSource,
  discovered: WorkerDiscoveredArticle,
  fetchImpl: FetchLike = fetch,
): Promise<WorkerArticleResult> {
  // JSON-API 来源：官方中文由详情接口 lang 参数直通。
  if (source.api) {
    let articleUrl: string;
    try {
      articleUrl = new URL(discovered.url, source.homepageUrl).toString();
    } catch {
      throw new Error(`${source.id}: invalid article URL ${discovered.url}`);
    }
    const zhLang = source.api.zh_lang ?? 'zh';
    if (source.preferOfficialZh) {
      try {
        const zh = await fetchWorkerApiArticle(source, discovered, articleUrl, fetchImpl, zhLang);
        if (zh.originalLanguage === zhLang) {
          return { ...zh, officialZhUrl: articleUrl, contentSource: 'official-zh' };
        }
      } catch {
        // 无官方中文版本时回退原文。
      }
    }
    return fetchWorkerApiArticle(source, discovered, articleUrl, fetchImpl);
  }

  const original = await fetchWorkerArticle(source, discovered, fetchImpl);
  if (original.originalLanguage === 'zh') {
    return { ...original, contentSource: 'native-zh' };
  }
  if (!source.preferOfficialZh) return original;

  let officialZhUrl: string | undefined;
  try {
    const html = await fetchHtml(fetchImpl, original.url, source.id);
    officialZhUrl = findOfficialChineseUrl(html, original.url);
    officialZhUrl ??= mapToOfficialZhPath(original.url, source.zhPathMap);
  } catch {
    // Localization probing is best-effort; keep original article.
    officialZhUrl = mapToOfficialZhPath(original.url, source.zhPathMap);
  }
  if (!officialZhUrl || officialZhUrl === original.url) return original;

  try {
    const zhArticle = await fetchWorkerArticle(
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
