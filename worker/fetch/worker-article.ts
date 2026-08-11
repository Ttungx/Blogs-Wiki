import { extractArticle } from './extractor';
import { findOfficialChineseUrl, mapToOfficialZhPath } from './worker-localization';
import { getCurlRunner } from './curl-runner';
import { proxyUrlFor } from '../../scripts/update/proxy';
import { resolveGitDate } from '../../scripts/update/git-date';
import type { SourceConfig } from '../../scripts/update/types';

export interface WorkerArticleSource {
  id: string;
  homepageUrl: string;
  preferOfficialZh?: boolean;
  /** en URL 前缀 → 官方简体中文前缀映射（cursor / qwen，无 hreflang 时探测）。 */
  zhPathMap?: Record<string, string>;
  /** GitHub 提交历史日期兜底（无机器可读日期的 GitHub Pages 博客）。 */
  gitDate?: SourceConfig['git_date'];
}

export interface WorkerDiscoveredArticle {
  url: string;
  title?: string;
  publishedAt?: string;
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

  const html = await fetchHtml(fetchImpl, articleUrl, source.id);
  const extracted = await extractArticle({ html, url: articleUrl });
  const title = extracted.title || discovered.title?.trim() || '';
  if (!title) {
    throw new Error(`${source.id} ${articleUrl}: no title found`);
  }
  // Defuddle 拿不到机器可读日期时回退到可见正文日期（ai.meta.com、
  // keli-wen.github.io）。正文文本比整页文本干净，页脚版权不在范围内。
  const publishedAt =
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
