export type SourceType = 'company' | 'personal';
export type SourceUpdateMode = 'active' | 'dry-run-only';

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  homepage_url: string;
  blog_url: string;
  domain: string;
  rss_url?: string;
  sitemap_url?: string;
  /** Optional pathname filters for child sitemaps: when set, only child
   *  sitemap URLs whose pathname starts with one of these prefixes are
   *  fetched (e.g. OpenAI's category sitemaps under /sitemap.xml/research/).
   *  The root sitemap itself is always parsed for these child URLs. */
  sitemap_include_paths?: string[];
  logo?: string;
  avatar?: string;
  /** `dry-run-only` sources can be discovered and fetched, but never translated or persisted. */
  update_mode?: SourceUpdateMode;
  /** When true, fetch prefers an official Simplified Chinese alternate and
   *  marks the article as `official-zh` (skipping model translation). */
  prefer_official_zh?: boolean;
  /** Optional pathname-prefix mapping from the default (usually English) URL
   *  shape to its official Simplified Chinese shape, e.g. `{ "/blog": "/zh/blog" }`.
   *  When the page advertises no hreflang alternate, the fetch layer probes the
   *  mapped Chinese URL and uses it when it resolves to `lang=zh` (cursor,
   *  qwen). */
  zh_path_map?: Record<string, string>;
  /** Optional GitHub commit-history date fallback for sites that publish no
   *  machine-readable date (e.g. keli-wen.github.io). When the page exposes no
   *  date, the fetch layer resolves the article file path and asks the GitHub
   *  API for its first commit date. */
  git_date?: {
    repo: string;
    /** Defaults to the repository's default branch when omitted. */
    branch?: string;
    /** Optional URL pathname prefix to strip before building the file path
     *  (e.g. `/One-Poem-Suffices`). */
    path_prefix?: string;
    /** Path of the article source file relative to the repo root. The tokens
     *  `{pathname}` (URL pathname without leading slash) and `{slug}` (last
     *  path segment) are substituted, e.g. `docs{pathname}/index.md`. */
    path_template: string;
  };
  /** Optional JSON-API source: the site exposes article lists and bodies only
   *  through authenticated POST JSON endpoints (e.g. Tencent Hunyuan's
   *  `hy.tencent.com` blog, which is a React SPA with no RSS/sitemap and
   *  returns Markdown bodies directly). When present, discovery uses the list
   *  endpoint and fetch uses the detail endpoint instead of HTML parsing. */
  api?: {
    /** List endpoint (POST application/json). */
    list_url: string;
    /** List request body (e.g. `{ pageNum: 1, pageSize: 50 }`). */
    list_body?: Record<string, unknown>;
    /** Dot-path to the article array in the list response (e.g. `data.list`). */
    list_path?: string;
    /** Article URL template with `{id}` / `{slug}` placeholders (e.g.
     *  `https://hy.tencent.com/research/{slug}`). */
    article_url_template?: string;
    /** Detail endpoint (POST application/json). */
    detail_url: string;
    /** Detail request body with `{id}` / `{lang}` placeholders. */
    detail_body?: Record<string, unknown>;
    /** Dot-path to the Markdown body in the detail response (e.g.
     *  `data.detail.content`). */
    content_path?: string;
    /** Dot-path to the title in the detail response. */
    title_path?: string;
    /** Dot-path to the author in the detail response. */
    author_path?: string;
    /** Dot-path to the cover image in the detail response. */
    image_path?: string;
    /** Dot-path to the publish date (Unix seconds or ISO) in the detail
     *  response. Falls back to the list item's date when omitted. */
    published_at_path?: string;
    /** Dot-path to the language code in the detail response. */
    language_path?: string;
    /** Official Simplified Chinese language code (default `zh`). When set,
     *  the localization pass requests this language directly from the detail
     *  endpoint (official Chinese straight through, no model translation). */
    zh_lang?: string;
    /** Extra headers for the detail request (e.g. `accept-language`). */
    detail_headers?: Record<string, string>;
  };
  /** Optional pathname prefixes; when set, only URLs under one of these paths are treated as articles. */
  article_paths?: string[];
  /** Optional pathname prefixes to reject regardless of `article_paths`. */
  exclude_paths?: string[];
  /**
   * 从 URL 路径推断发布日期的正则（页面无机器可读日期、sitemap 无 lastmod
   * 时用，如 simonwillison.net 的 /2026/Jul/9/slug/ 路径）。必须含年份捕获
   * 组，可选月/日捕获组。
   */
  url_date_pattern?: string;
  /** 正文最小纯文本字符数；未设则用 DEFAULT_MIN_CONTENT_CHARS。
   *  短新闻源可调低、长 essay 源可调高，避免单一阈值误杀/漏放。 */
  min_content_chars?: number;
  /** 启用促销/直播/placeholder 严格内容过滤（原 backfill-policy 的 qualityFilter，
   *  现统一为源级开关，增量与回填共用）。 */
  quality_filter?: boolean;
  /** 为 true 时跳过全局 NON_ARTICLE_PATHS 黑名单，让 article_paths 白名单完全
   *  决定收录范围。用于博客路径含 /press /media /tag 等被全局黑名单段的公司站。 */
  allow_non_article_paths?: boolean;
  /** 每次增量更新的篇数上限；未设则用 DEFAULT_LIMIT_PER_SOURCE。CLI `--limit` 仍可全局覆盖。 */
  limit?: number;
  /** 发现策略：`auto`（默认）首个非空发现源即返回；`merge` 四路并集去重（覆盖更全，略慢）。 */
  discovery_strategy?: 'auto' | 'merge';
  /** 子 sitemap 抓取上限；未设则用 DEFAULT_MAX_CHILD_SITEMAPS。 */
  max_child_sitemaps?: number;
  /** 回填策略（`npm run backfill` 消费）。未设则用 backfill-policy 兜底默认。 */
  backfill?: {
    /** `all` 收录窗口内全部；`since` 只收 since 之后。默认 `all`。 */
    mode?: 'all' | 'since';
    /** mode='since' 时的起始日期（YYYY-MM-DD）。 */
    since?: string;
    /** 单源回填篇数上限（保护阀）。 */
    max_articles?: number;
    /** 回填期是否启用促销/placeholder 严格过滤；未设则回退 source.quality_filter。 */
    quality_filter?: boolean;
  };
}

/** 增量管线结构化错误（取代原先的字符串数组，便于按类型聚合分析）。 */
export interface ArticleError {
  url: string;
  kind: 'fetch' | 'integrity' | 'translate' | 'redirect' | 'fatal';
  code?: string;
  message: string;
}

export interface ProcessedUrlState {
  version: number;
  updated_at: string | null;
  blogs: Record<string, string[]>;
}

export interface DiscoveredArticle {
  url: string;
  title?: string;
  publishedAt?: string;
  /** JSON-API source article id (detail request payload). */
  apiId?: string;
  /** JSON-API source default language (detail request payload). */
  apiLang?: string;
}

export interface ExtractedArticle {
  url: string;
  title: string;
  author?: string;
  imageUrl?: string;
  publishedAt: string;
  originalLanguage: string;
  contentMarkdown: string;
  /** Official Simplified Chinese URL when one was preferred and fetched. */
  officialZhUrl?: string;
  /** How the content reached this state: `official-zh`, `native-zh`, or `model`. */
  contentSource?: 'official-zh' | 'native-zh' | 'model';
}

export interface TranslationResult {
  translatedTitle: string;
  categories: string[];
  contentMarkdown: string;
  model: string;
  /** Persisted provenance for display: `official-zh` | `native-zh` | `model`. */
  translationStatus?: 'official-zh' | 'native-zh' | 'model';
  /** Official Simplified Chinese URL when model/official content has one. */
  originalZhUrl?: string;
}

export interface UpdateOptions {
  rootDir: string;
  dryRun: boolean;
  sourceId?: string;
  limit?: number;
}

export interface SourceUpdateResult {
  sourceId: string;
  discovered: number;
  pending: number;
  processed: number;
  failed: number;
  errors: ArticleError[];
}

export interface UpdateSummary {
  sources: SourceUpdateResult[];
  discovered: number;
  pending: number;
  processed: number;
  failed: number;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type TranslateArticle = (
  article: ExtractedArticle,
  categories: readonly string[],
) => Promise<TranslationResult>;
