/**
 * 共享运行时常量。
 *
 * SourceConfig 的可选字段（min_content_chars / limit / max_child_sitemaps）可按源
 * 覆盖这些默认值，让新源只改 sources.json 就能调参，不必动代码。
 */

/** 默认正文最小纯文本字符数。fetch 层与门禁层共用。 */
export const DEFAULT_MIN_CONTENT_CHARS = 200;

/** 默认每源每次增量更新的篇数上限。CLI `--limit` 仍可全局覆盖。 */
export const DEFAULT_LIMIT_PER_SOURCE = 3;

/** 默认子 sitemap 抓取上限，防止 sitemap index 爆炸式拉取。 */
export const DEFAULT_MAX_CHILD_SITEMAPS = 10;
