import fs from 'node:fs/promises';
import path from 'node:path';
import type { SourceConfig, SourceType, SourceUpdateMode } from './types';

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface SourceConfigValidation {
  sources: SourceConfig[];
  issues: ConfigIssue[];
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
    return { sources: [], issues: [{ path: '$', message: 'must be a JSON array' }] };
  }

  const issues: ConfigIssue[] = [];
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

    for (const key of ['article_paths', 'exclude_paths'] as const) {
      const paths = value[key];
      if (paths === undefined) continue;
      if (!Array.isArray(paths) || paths.some((entry) => typeof entry !== 'string' || !entry.startsWith('/'))) {
        issues.push({ path: `[${index}].${key}`, message: 'must contain pathname prefixes beginning with /' });
      }
    }

    sources.push(value as unknown as SourceConfig);
  });

  return { sources, issues };
}

export async function loadSources(rootDir: string): Promise<SourceConfig[]> {
  const file = path.join(rootDir, 'src', 'data', 'sources.json');
  const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  const result = validateSourceConfigs(raw);
  if (result.issues.length) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n  - ');
    throw new Error(`Invalid source configuration in ${file}:\n  - ${detail}`);
  }
  return result.sources;
}
