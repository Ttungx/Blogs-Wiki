/**
 * 管线类型 ↔ 领域类型的映射器（纯函数）。
 *
 * 从 `scripts/update/repository-factory.ts` 提取，让 Node 管线和 Worker
 * 编排器共用同一份字段重命名逻辑，消除 Phase 5 接线时引入的重复。
 *
 * 所有 import 都是 type-only：`scripts/update/types.ts` 的 snake_case
 * 类型只在编译期存在，运行时不触发该模块求值，Worker 构建安全。
 */

import type {
  ExtractedArticle,
  SourceConfig,
  TranslationResult,
} from '../../scripts/update/types';
import type {
  RawArticle,
  SourceConfig as DomainSourceConfig,
  TranslationResult as DomainTranslationResult,
} from './types';

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

/** 抓取模型 → camelCase 领域文章模型。 */
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

/** 翻译模型 → camelCase 领域翻译模型。 */
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
