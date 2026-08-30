import fs from 'node:fs/promises';
import path from 'node:path';
import { assertNotBlocked, loadBlockedSources } from './blocked-sources';
import type { SourceConfig, SourceType, SourceUpdateMode } from './types';

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface SourceConfigValidation {
  sources: SourceConfig[];
  issues: ConfigIssue[];
  warnings: ConfigIssue[];
}

const SOURCE_TYPES = new Set<SourceType>(['company', 'personal']);
const UPDATE_MODES = new Set<SourceUpdateMode>(['active', 'dry-run-only']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validateString(
  source: Record<string, unknown>,
  key: string,
  index: number,
  issues: ConfigIssue[],
): void {
  if (typeof source[key] !== 'string' || !(source[key] as string).trim()) {
    issues.push({ path: `[${index}].${key}`, message: 'must be a non-empty string' });
  }
}

export function validateSourceConfigs(raw: unknown): SourceConfigValidation {
  if (!Array.isArray(raw)) {
    return { sources: [], issues: [{ path: '$', message: 'must be a JSON array' }], warnings: [] };
  }

  const issues: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const ids = new Set<string>();
  const sources: SourceConfig[] = [];

  raw.forEach((value, index) => {
    if (!isRecord(value)) {
      issues.push({ path: `[${index}]`, message: 'must be an object' });
      return;
    }

    for (const key of ['id', 'name', 'domain']) validateString(value, key, index, issues);
    for (const key of ['homepage_url', 'blog_url']) {
      if (!validHttpUrl(value[key])) {
        issues.push({ path: `[${index}].${key}`, message: 'must be an absolute http(s) URL' });
      }
    }
    for (const key of ['rss_url', 'sitemap_url']) {
      if (value[key] !== undefined && !validHttpUrl(value[key])) {
        issues.push({ path: `[${index}].${key}`, message: 'must be an absolute http(s) URL' });
      }
    }
    if (value.api !== undefined) {
      if (!isRecord(value.api)) {
        issues.push({ path: `[${index}].api`, message: 'must be an object' });
      } else {
        for (const key of ['list_url', 'detail_url']) {
          if (value.api[key] !== undefined && !validHttpUrl(value.api[key])) {
            issues.push({ path: `[${index}].api.${key}`, message: 'must be an absolute http(s) URL' });
          }
        }
      }
    }

    if (!SOURCE_TYPES.has(value.type as SourceType)) {
      issues.push({ path: `[${index}].type`, message: 'must be "company" or "personal"' });
    }
    if (!UPDATE_MODES.has(value.update_mode as SourceUpdateMode)) {
      issues.push({
        path: `[${index}].update_mode`,
        message: 'must be explicit: "active" or "dry-run-only"',
      });
    }

    const id = typeof value.id === 'string' ? value.id.trim() : '';
    if (id) {
      if (ids.has(id)) issues.push({ path: `[${index}].id`, message: `duplicate source id "${id}"` });
      ids.add(id);
    }

    if (typeof value.domain === 'string' && value.domain.trim()) {
      const domain = value.domain.trim().toLowerCase();
      if (domain.includes('/') || domain.includes(':') || /\s/.test(domain)) {
        issues.push({ path: `[${index}].domain`, message: 'must be a hostname without scheme or path' });
      }
    }

    for (const key of ['article_paths', 'exclude_paths', 'sitemap_include_paths'] as const) {
      const paths = value[key];
      if (paths === undefined) continue;
      if (!Array.isArray(paths) || paths.some((entry) => {
        if (typeof entry !== 'string' || !entry) return true;
        // `^`-prefixed entries are regex patterns; others must be absolute
        // pathname prefixes so they stay usable as prefixes.
        if (entry.startsWith('^')) {
          try {
            new RegExp(entry);
            return false;
          } catch {
            return true;
          }
        }
        return !entry.startsWith('/');
      })) {
        issues.push({
          path: `[${index}].${key}`,
          message: 'must contain absolute path prefixes or ^-prefixed regex patterns',
        });
      }
    }

    // 未知字段：提示但不阻断（宽松校验是特性，但消除"配了没反应"的静默）。
    const ALLOWED_KEYS = new Set([
      'id', 'name', 'type', 'homepage_url', 'blog_url', 'domain', 'extra_domains',
      'rss_url', 'sitemap_url', 'sitemap_include_paths', 'logo', 'avatar',
      'update_mode', 'prefer_official_zh', 'zh_path_map', 'git_date', 'api',
      'article_paths', 'exclude_paths', 'url_date_pattern',
      'min_content_chars', 'quality_filter', 'allow_non_article_paths',

    ]);
    for (const key of Object.keys(value)) {
      if (!ALLOWED_KEYS.has(key)) {
        warnings.push({ path: `[${index}].${key}`, message: 'unknown field (silently ignored)' });
      }
    }

    // url_date_pattern：必须可编译且含年份捕获组（否则 url-date.ts 静默降级为 undefined）。
    if (value.url_date_pattern !== undefined) {
      if (typeof value.url_date_pattern !== 'string' || !value.url_date_pattern.trim()) {
        issues.push({ path: `[${index}].url_date_pattern`, message: 'must be a non-empty regex string' });
      } else {
        try {
          new RegExp(value.url_date_pattern);
          if (!/\((?!\?)/.test(value.url_date_pattern)) {
            issues.push({ path: `[${index}].url_date_pattern`, message: 'must contain a capturing group for the year' });
          }
        } catch {
          issues.push({ path: `[${index}].url_date_pattern`, message: 'must be a valid regex' });
        }
      }
    }

    // 按源可调的正整数阈值。
    for (const key of ['min_content_chars', 'limit', 'max_child_sitemaps'] as const) {
      const num = value[key];
      if (num !== undefined && (typeof num !== 'number' || !Number.isInteger(num) || num <= 0)) {
        issues.push({ path: `[${index}].${key}`, message: 'must be a positive integer' });
      }
    }

    if (value.min_published_year !== undefined
      && (typeof value.min_published_year !== 'number' || !Number.isInteger(value.min_published_year)
        || value.min_published_year < 1900 || value.min_published_year > 2100)) {
      issues.push({ path: `[${index}].min_published_year`, message: 'must be a 4-digit year' });
    }

    if (value.extra_domains !== undefined) {
      if (!Array.isArray(value.extra_domains) || !value.extra_domains.length
        || value.extra_domains.some((entry) => typeof entry !== 'string'
          || !entry.trim()
          || entry.includes('/') || entry.includes(':') || /\s/.test(entry))) {
        issues.push({ path: `[${index}].extra_domains`, message: 'must be a non-empty array of hostnames without scheme or path' });
      } else if (typeof value.domain === 'string' && value.extra_domains.includes(value.domain.trim().toLowerCase())) {
        issues.push({ path: `[${index}].extra_domains`, message: 'must not repeat `domain`' });
      }
    }

    // backfill 策略（Stage 5 消费）。
    if (value.backfill !== undefined) {
      const bf = value.backfill;
      if (!isRecord(bf)) {
        issues.push({ path: `[${index}].backfill`, message: 'must be an object' });
      } else {
        if (bf.mode !== undefined && !['all', 'since'].includes(bf.mode as string)) {
          issues.push({ path: `[${index}].backfill.mode`, message: 'must be "all" or "since"' });
        }
        if (bf.since !== undefined && (typeof bf.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bf.since) || Number.isNaN(Date.parse(bf.since)))) {
          issues.push({ path: `[${index}].backfill.since`, message: 'must be a valid YYYY-MM-DD date' });
        }
        if (bf.max_articles !== undefined && (typeof bf.max_articles !== 'number' || !Number.isInteger(bf.max_articles) || bf.max_articles <= 0)) {
          issues.push({ path: `[${index}].backfill.max_articles`, message: 'must be a positive integer' });
        }
        if (bf.quality_filter !== undefined && typeof bf.quality_filter !== 'boolean') {
          issues.push({ path: `[${index}].backfill.quality_filter`, message: 'must be a boolean' });
        }
      }
    }

    // 交叉依赖：声明了消费方字段却缺前置字段（运行时才暴露的错前移到加载时）。
    if (value.sitemap_include_paths !== undefined && value.sitemap_url === undefined) {
      issues.push({ path: `[${index}].sitemap_include_paths`, message: 'requires sitemap_url to be set' });
    }
    if (isRecord(value.api) && value.api.list_url !== undefined && value.api.detail_url === undefined) {
      issues.push({ path: `[${index}].api.detail_url`, message: 'required when api.list_url is set' });
    }
    if (isRecord(value.git_date)) {
      if (typeof value.git_date.repo !== 'string' || !value.git_date.repo.trim()) {
        issues.push({ path: `[${index}].git_date.repo`, message: 'required when git_date is set' });
      }
      if (typeof value.git_date.path_template !== 'string' || !value.git_date.path_template.trim()) {
        issues.push({ path: `[${index}].git_date.path_template`, message: 'required when git_date is set' });
      }
    }

    sources.push(value as unknown as SourceConfig);
  });

  return { sources, issues, warnings };
}

export async function loadSourcesUnchecked(rootDir: string): Promise<SourceConfig[]> {
  const file = path.join(rootDir, 'src', 'data', 'sources.json');
  const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  const result = validateSourceConfigs(raw);
  if (result.issues.length) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n  - ');
    throw new Error(`Invalid source configuration in ${file}:\n  - ${detail}`);
  }
  for (const warning of result.warnings) {
    console.warn(`[sources.json] ${warning.path}: ${warning.message}`);
  }
  return result.sources;
}

/**
 * 加载源配置的唯一咽喉点：schema 校验通过后，再跑永久拉黑（tombstone）门禁。
 * 命中拉黑（同 id / 同域名 / 子域 / 父域 / extra_domains 相交）即抛错拒绝加载。
 * update / backfill / census / audit 四个抓取驱动入口都经此函数，故全部自动受保护。
 * block-source 工具与 smoke 测试需要绕过门禁读写源，改用 loadSourcesUnchecked。
 */
export async function loadSources(rootDir: string): Promise<SourceConfig[]> {
  const sources = await loadSourcesUnchecked(rootDir);
  const blocked = await loadBlockedSources(rootDir);
  assertNotBlocked(sources, blocked);
  return sources;
}
