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
  errors: string[];
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
