import {
  fetchArticle as fetchNodeArticle,
  fetchArticleWithLocalization as fetchNodeArticleWithLocalization,
} from './fetch';
import {
  fetchWorkerArticle,
  fetchWorkerArticleWithLocalization,
} from '../../worker/fetch/worker-article';
// Node-only：注册系统 curl 回退（TLS 指纹拦截的 CDN）。Worker 打包不包含此文件。
import '../../worker/fetch/curl';
import type { DiscoveredArticle, ExtractedArticle, FetchLike, SourceConfig } from './types';

export type FetchBackendName = 'node' | 'worker';

export interface FetchBackend {
  name: FetchBackendName;
  fetchArticle(
    source: SourceConfig,
    discovered: DiscoveredArticle,
    fetchImpl: FetchLike,
  ): Promise<ExtractedArticle>;
  fetchArticleWithLocalization(
    source: SourceConfig,
    discovered: DiscoveredArticle,
    fetchImpl: FetchLike,
  ): Promise<ExtractedArticle>;
}

function toWorkerSource(source: SourceConfig) {
  return {
    id: source.id,
    homepageUrl: source.homepage_url,
    ...(source.url_date_pattern ? { urlDatePattern: source.url_date_pattern } : {}),
    ...(source.date_fallback ? { dateFallback: source.date_fallback } : {}),
    ...(source.prefer_official_zh !== undefined
      ? { preferOfficialZh: source.prefer_official_zh }
      : {}),
    ...(source.zh_path_map !== undefined ? { zhPathMap: source.zh_path_map } : {}),
    ...(source.git_date !== undefined ? { gitDate: source.git_date } : {}),
    ...(source.api !== undefined ? { api: source.api } : {}),
    ...(source.min_content_chars !== undefined ? { minContentChars: source.min_content_chars } : {}),
  };
}

function toExtractedArticle(article: Awaited<ReturnType<typeof fetchWorkerArticle>>): ExtractedArticle {
  return {
    url: article.url,
    title: article.title,
    ...(article.author ? { author: article.author } : {}),
    ...(article.imageUrl ? { imageUrl: article.imageUrl } : {}),
    publishedAt: article.publishedAt,
    ...(article.publishedAtSource ? { publishedAtSource: article.publishedAtSource } : {}),
    originalLanguage: article.originalLanguage,
    contentMarkdown: article.contentMarkdown,
    ...(article.officialZhUrl ? { officialZhUrl: article.officialZhUrl } : {}),
    ...(article.contentSource ? { contentSource: article.contentSource } : {}),
    ...(article.officialZh ? { officialZh: article.officialZh } : {}),
  };
}

/**
 * node（Readability）抽出「过短」正文时回退 Defuddle 的阈值。
 * 2026-09-09 事故：openai.com 等 JS 渲染站点用 Readability 拿不到正文
 * （Readability failed to extract article content），而 Defuddle 同一篇能
 * 抽到 3 万字符。生产默认后端是 node，于是这些源长期零收录。
 */
const FALLBACK_MIN_CHARS = Number(process.env.FETCH_FALLBACK_MIN_CHARS ?? '200');

function isThin(article: ExtractedArticle | null, minChars: number): boolean {
  if (!article) return true;
  return (article.contentMarkdown ?? '').trim().length < minChars;
}

type NodeFn = (
  source: SourceConfig,
  discovered: DiscoveredArticle,
  fetchImpl: FetchLike,
) => Promise<ExtractedArticle>;

type WorkerFn = (
  source: ReturnType<typeof toWorkerSource>,
  discovered: DiscoveredArticle,
  fetchImpl: FetchLike,
) => ReturnType<typeof fetchWorkerArticle>;

/** node 抽取失败/过短时，用 worker（Defuddle）再试一次。 */
async function withDefuddleFallback(
  source: SourceConfig,
  discovered: DiscoveredArticle,
  fetchImpl: FetchLike,
  nodeFn: NodeFn,
  workerFn: WorkerFn,
): Promise<ExtractedArticle> {
  const minChars = source.min_content_chars ?? FALLBACK_MIN_CHARS;
  let firstReason: string | null = null;

  try {
    const article = await nodeFn(source, discovered, fetchImpl);
    if (!isThin(article, minChars)) return article;
    firstReason = `thin content (${(article.contentMarkdown ?? '').trim().length} < ${minChars} chars)`;
  } catch (error) {
    firstReason = error instanceof Error ? error.message : String(error);
  }
  console.warn(
    `fetch: node extractor unusable for ${discovered.url} (${firstReason}); retrying with defuddle`,
  );

  try {
    return toExtractedArticle(await workerFn(toWorkerSource(source), discovered, fetchImpl));
  } catch (error) {
    const secondReason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `both extractors failed for ${discovered.url} (node: ${firstReason}; defuddle: ${secondReason})`,
    );
  }
}

export function createFetchBackend(
  backend: string | undefined,
): FetchBackend {
  const name = (backend ?? process.env.FETCH_BACKEND ?? 'node').trim().toLowerCase();
  if (name === 'node') {
    return {
      name,
      fetchArticle: (source, discovered, fetchImpl) =>
        withDefuddleFallback(source, discovered, fetchImpl, fetchNodeArticle, fetchWorkerArticle),
      fetchArticleWithLocalization: (source, discovered, fetchImpl) =>
        withDefuddleFallback(
          source,
          discovered,
          fetchImpl,
          fetchNodeArticleWithLocalization,
          fetchWorkerArticleWithLocalization,
        ),
    };
  }
  if (name === 'worker') {
    return {
      name,
      async fetchArticle(source, discovered, fetchImpl) {
        return toExtractedArticle(
          await fetchWorkerArticle(
            toWorkerSource(source),
            discovered,
            fetchImpl,
          ),
        );
      },
      async fetchArticleWithLocalization(source, discovered, fetchImpl) {
        return toExtractedArticle(
          await fetchWorkerArticleWithLocalization(
            toWorkerSource(source),
            discovered,
            fetchImpl,
          ),
        );
      },
    };
  }
  throw new Error(`Unsupported FETCH_BACKEND "${name}"; expected "node" or "worker"`);
}
