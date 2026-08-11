import { extractArticle } from './extractor';
import { findOfficialChineseUrl } from './worker-localization';

export interface WorkerArticleSource {
  id: string;
  homepageUrl: string;
  preferOfficialZh?: boolean;
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

async function fetchHtml(fetchImpl: FetchLike, url: string, sourceId: string): Promise<string> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
        'user-agent': 'BlogsWikiBot/0.1 (+https://github.com; article fetch)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
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

  return {
    url: articleUrl,
    title,
    author: extracted.author,
    imageUrl: extracted.imageUrl,
    publishedAt: extracted.publishedAt || discovered.publishedAt?.trim() || '',
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
  } catch {
    // Localization probing is best-effort; keep original article.
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
