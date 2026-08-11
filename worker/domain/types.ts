/**
 * 领域模型（Domain Types）—— Blogs Wiki 内容系统的核心对象。
 *
 * 设计原则：
 * - 全 camelCase（领域层规范）。`src/data/sources.json` 的 snake_case 经由
 *   映射层（Phase 3+ 配置加载器）转换为这里的 SourceConfig。
 * - 字段名与 `scripts/update/types.ts` 的 ExtractedArticle / TranslationResult
 *   对齐，方便 Phase 5 接线时平滑映射。
 * - 面向未来但不过度设计（手册 §17）：不预建 youtube_video_id / podcast_id 等
 *   平台特有字段；待真实需要时进 metadata。
 *
 * 这是 Phase 1-2 的产物：纯类型定义，零运行时依赖，Workers / Node 通用。
 */

/** 来源类型。 */
export type SourceType = 'company' | 'personal';

/** 来源更新模式：`active` 进完整更新；`dry-run-only` 只参与 dry-run（配置门禁）。 */
export type SourceUpdateMode = 'active' | 'dry-run-only';

/** 翻译来源标记，用于展示溯源。 */
export type TranslationStatus = 'official-zh' | 'native-zh' | 'model';

/** 内容到达当前状态的方式（抓取层产出）。 */
export type ContentSource = 'official-zh' | 'native-zh' | 'model';

/**
 * 来源配置（领域层 camelCase 视图）。
 *
 * 这是 `src/data/sources.json`（管线配置）和 `src/content/blogs/*.md`（站点展示）
 * 两份注册表合并后的完整视图。Phase 3 D1 落库时映射到此类型。
 */
export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  homepageUrl: string;
  blogUrl: string;
  domain: string;
  rssUrl?: string;
  sitemapUrl?: string;
  /** 子 sitemap 路径前缀白名单（如 OpenAI 的 /sitemap.xml/research/）。 */
  sitemapIncludePaths?: string[];
  logo?: string;
  avatar?: string;
  /** 来源更新模式，未显式声明视为不可运行（门禁在 source-policy）。 */
  updateMode?: SourceUpdateMode;
  /** 为 true 时抓取优先官方简体中文 alternate，命中则跳过模型翻译。 */
  preferOfficialZh?: boolean;
  /** 文章路径前缀白名单；设置后只有这些前缀下的 URL 被视为文章。 */
  articlePaths?: string[];
  /** 无论 articlePaths 如何，这些前缀下的 URL 一律拒绝。 */
  excludePaths?: string[];
}

/** 发现阶段的候选条目。 */
export interface DiscoveredItem {
  sourceId: string;
  url: string;
  title?: string;
  publishedAt?: string;
}

/**
 * 抓取 + 提取后、翻译前的规范化文章。
 *
 * 字段命名与 `scripts/update/types.ts` 的 ExtractedArticle 对齐，
 * Phase 5 接线时可直接结构兼容映射。
 */
export interface RawArticle {
  sourceId: string;
  url: string;
  title: string;
  author?: string;
  imageUrl?: string;
  publishedAt: string;
  originalLanguage: string;
  contentMarkdown: string;
  /** 命中的官方简体中文 URL（preferOfficialZh 且抓取成功）。 */
  officialZhUrl?: string;
  /** 内容来源方式。 */
  contentSource?: ContentSource;
}

/** 翻译（含分类）结果。与 scripts/update/types.ts TranslationResult 对齐。 */
export interface TranslationResult {
  translatedTitle: string;
  categories: string[];
  contentMarkdown: string;
  model: string;
  translationStatus?: TranslationStatus;
  originalZhUrl?: string;
}

/**
 * 已持久化的完整文章记录（读模型）。
 *
 * Phase 8 Astro SSR 将消费此类型——从 Repository 读取后直接渲染，
 * 不再依赖 getCollection 与文件系统。
 */
export interface ArticleRecord {
  /** 文章 id（slug），对应文件名 `<id>.md` / D1 主键。 */
  id: string;
  sourceId: string;
  originalUrl: string;
  originalTitle: string;
  translatedTitle: string;
  /** ISO 8601 字符串，保留与原文一致发布日期。 */
  publishedAt: string;
  translatedAt: string;
  originalLanguage: string;
  translationModel: string;
  translationStatus?: TranslationStatus;
  originalZhUrl?: string;
  contentMarkdown: string;
  excerpt?: string;
  imageUrl?: string;
  author?: string;
  sourceDomain: string;
  categories: string[];
}

/** save() 的输入。 */
export interface SaveArticleInput {
  source: SourceConfig;
  article: RawArticle;
  translation: TranslationResult;
  /** 翻译完成时间，默认 new Date()。 */
  translatedAt?: Date;
}

/** save() 的返回。 */
export interface SaveResult {
  id: string;
  /** true = 新建；false = 同 originalUrl 已存在（幂等）。 */
  created: boolean;
}

/** processed-urls.json 的快照视图。 */
export interface ProcessedStateSnapshot {
  version: number;
  updatedAt: string | null;
  blogs: Record<string, string[]>;
}
