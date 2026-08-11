import { FileArticleRepository } from '../../worker/repositories/file/file-article-repository';
import { FileSourceStateRepository } from '../../worker/repositories/file/file-source-state-repository';
import { createWorkerRepositories } from '../../worker/runtime/repositories';
import type { ArticleRepository } from '../../worker/repositories/article-repository';
import type { SourceStateRepository } from '../../worker/repositories/source-state-repository';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  SourceConfig as DomainSourceConfig,
  RawArticle,
  TranslationResult as DomainTranslationResult,
} from '../../worker/domain/types';
import type {
  ExtractedArticle,
  SourceConfig,
  TranslationResult,
} from './types';

export type StorageBackend = 'file' | 'd1';

export interface UpdateRepositories {
  articles: ArticleRepository;
  sourceState: SourceStateRepository;
}

export interface RepositoryFactoryOptions {
  rootDir: string;
  backend?: string;
  d1Database?: D1Database;
}

/**
 * 创建更新管线使用的持久化后端。
 *
 * Node 更新命令默认使用 FileRepository。D1 只能在拥有 Worker binding
 * 的运行时使用；显式选择 d1 但未注入 binding 时必须快速失败。
 */
export function createUpdateRepositories(options: RepositoryFactoryOptions): UpdateRepositories {
  const backend = (options.backend ?? process.env.STORAGE_BACKEND ?? 'file').trim().toLowerCase();

  if (backend === 'file') {
    return {
      articles: new FileArticleRepository({ rootDir: options.rootDir }),
      sourceState: new FileSourceStateRepository({ rootDir: options.rootDir }),
    };
  }

  if (backend === 'd1') {
    if (!options.d1Database) {
      throw new Error(
        'STORAGE_BACKEND=d1 requires an injected D1Database; Node update CLI cannot create a D1 binding',
      );
    }
    return createWorkerRepositories({ DB: options.d1Database });
  }

  throw new Error(`Unsupported STORAGE_BACKEND "${backend}"; expected "file" or "d1"`);
}

/** snake_case 管线来源配置 → camelCase 领域来源配置。 */
export function toDomainSource(source: SourceConfig): DomainSourceConfig {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    homepageUrl: source.homepage_url,
    blogUrl: source.blog_url,
    domain: source.domain,
    ...(source.rss_url ? { rssUrl: source.rss_url } : {}),
    ...(source.sitemap_url ? { sitemapUrl: source.sitemap_url } : {}),
    ...(source.sitemap_include_paths ? { sitemapIncludePaths: source.sitemap_include_paths } : {}),
    ...(source.logo ? { logo: source.logo } : {}),
    ...(source.avatar ? { avatar: source.avatar } : {}),
    ...(source.update_mode ? { updateMode: source.update_mode } : {}),
    ...(source.prefer_official_zh !== undefined
      ? { preferOfficialZh: source.prefer_official_zh }
      : {}),
    ...(source.article_paths ? { articlePaths: source.article_paths } : {}),
    ...(source.exclude_paths ? { excludePaths: source.exclude_paths } : {}),
  };
}

/** 旧抓取模型 → camelCase 领域文章模型。 */
export function toDomainArticle(source: SourceConfig, article: ExtractedArticle): RawArticle {
  return {
    sourceId: source.id,
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

/** 旧翻译模型 → camelCase 领域翻译模型。 */
export function toDomainTranslation(
  translation: TranslationResult,
): DomainTranslationResult {
  return {
    translatedTitle: translation.translatedTitle,
    categories: translation.categories,
    contentMarkdown: translation.contentMarkdown,
    model: translation.model,
    ...(translation.translationStatus
      ? { translationStatus: translation.translationStatus }
      : {}),
    ...(translation.originalZhUrl
      ? { originalZhUrl: translation.originalZhUrl }
      : {}),
  };
}
