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
    ...(source.prefer_official_zh !== undefined
      ? { preferOfficialZh: source.prefer_official_zh }
      : {}),
    ...(source.zh_path_map !== undefined ? { zhPathMap: source.zh_path_map } : {}),
    ...(source.git_date !== undefined ? { gitDate: source.git_date } : {}),
  };
}

function toExtractedArticle(article: Awaited<ReturnType<typeof fetchWorkerArticle>>): ExtractedArticle {
  return {
    url: article.url,
    title: article.title,
    ...(article.author ? { author: article.author } : {}),
    ...(article.imageUrl ? { imageUrl: article.imageUrl } : {}),
    publishedAt: article.publishedAt,
    originalLanguage: article.originalLanguage,
    contentMarkdown: article.contentMarkdown,
    ...(article.officialZhUrl ? { officialZhUrl: article.officialZhUrl } : {}),
    ...(article.contentSource ? { contentSource: article.contentSource } : {}),
  };
}

export function createFetchBackend(
  backend: string | undefined,
): FetchBackend {
  const name = (backend ?? process.env.FETCH_BACKEND ?? 'node').trim().toLowerCase();
  if (name === 'node') {
    return {
      name,
      fetchArticle: fetchNodeArticle,
      fetchArticleWithLocalization: fetchNodeArticleWithLocalization,
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
