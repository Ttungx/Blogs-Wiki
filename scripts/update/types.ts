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
