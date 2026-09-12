/**
 * 一次性数据修复：补全「官方中文时代」遗留行的英文原文版本。
 *
 * 背景（2026-09-12）：openai/cursor/qwen 在双语源反转改造前入库的行，主实体
 * 是官方中文页（original_language='zh'，original_url 指向 /zh-Hans-CN/、/cn/、
 * /zh/ 前缀页面），D1 没有 en 版本——列表页双语标题（中文在上、英文原题在下）
 * 依赖 en 版本取原题，联不到就只剩中文单行。
 *
 * 修复：按确定性前缀映射推导英文版 URL → fetchArticle 抓英文原文 → 经
 * content-sync 写回。⚠️ payload 必须带**全量状态**（zh 现有版本 + 分类 +
 * 质量/发布字段透传）：同 id 换 original_url 会触发身份迁移预清理，旧行
 * 连同版本被级联删除后按 payload 重建——只带 en 会把官方中文版弄丢。
 * 翻正后 original_language='en'、original_url=英文页，与现行双语源反转
 * 架构一致。已有 en 版本的行自动跳过（幂等，可重跑）。
 *
 * 用法：
 *   npx tsx --env-file-if-exists=.env scripts/update/complete-official-en.ts             # 预演
 *   npx tsx --env-file-if-exists=.env scripts/update/complete-official-en.ts --apply     # 落盘
 *   可选 --source openai --limit 5 --id <articleId>
 *   FETCH_USER_AGENT=浏览器UA （openai.com 对 BlogsWikiBot 整站 403）
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createFetchBackend } from './fetch-backend';
import { createFetchImpl } from './network';
import { loadSources } from './config';
import type { SourceConfig } from './types';

/** zh 页 → en 页的确定性前缀映射（与三源的官方中文路径一一对应）。 */
const ZH_TO_EN_PREFIX: Record<string, Array<[from: string, to: string]>> = {
  openai: [['/zh-Hans-CN/index/', '/index/']],
  cursor: [['/cn/blog/', '/blog/']],
  qwen: [['/zh/blog/', '/blog/']],
};

interface TargetRow {
  id: string;
  source_id: string;
  original_language: string;
  original_url: string;
  published_at: string;
  published_at_source: string | null;
  image_url: string | null;
  author: string | null;
  source_domain: string;
  published: number;
  quality_score: number | null;
  quality_model: string | null;
  zh_title: string | null;
  zh_markdown: string | null;
  zh_excerpt: string | null;
  zh_translated_at: string | null;
  zh_translation_model: string | null;
  zh_original_alt_url: string | null;
  zh_provenance: string | null;
  en_title: string | null;
  en_markdown: string | null;
  categories: string | null;
}

function queryD1(sql: string): Array<Record<string, unknown>> {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  // wrangler 走直连（代理出口 IP 会触发 Cloudflare API 鉴权抖动 7403）；
  // 文章抓取仍用进程代理 env（openai/cursor 本机直连被墙）。
  const directEnv = { ...process.env };
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) delete directEnv[key];
  let raw: string;
  try {
    // cmd.exe 传参会弄坏多行 SQL，先折叠成单行。
    const oneLine = sql.replace(/\s+/g, ' ').trim();
    raw = execSync(
      `npx wrangler d1 execute blogs-wiki --remote --json --command ${JSON.stringify(oneLine)}`,
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, env: directEnv },
    );
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    const detail = String(err.stdout ?? err.stderr ?? err.message ?? error).slice(0, 600);
    throw new Error(`D1 query failed: ${detail}`);
  }
  const clean = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const parsed = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1)) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed[0]?.results ?? [];
}

function toEnUrl(sourceId: string, zhUrl: string): string | undefined {
  for (const [from, to] of ZH_TO_EN_PREFIX[sourceId] ?? []) {
    if (zhUrl.includes(from)) return zhUrl.replace(from, to);
  }
  return undefined;
}

/** 反向映射：en URL → zh 页 URL（坏行 zh 重建用；只替换首次出现）。 */
function toZhUrl(sourceId: string, enUrl: string): string | undefined {
  for (const [from, to] of ZH_TO_EN_PREFIX[sourceId] ?? []) {
    if (enUrl.includes(to)) return enUrl.replace(to, from);
  }
  return undefined;
}

async function pushRepair(row: TargetRow, enUrl: string, enTitle: string, enMarkdown: string): Promise<void> {
  const endpoint = (process.env.CONTENT_SYNC_URL ?? '').trim().replace(/\/+$/, '');
  const token = (process.env.CONTENT_SYNC_TOKEN ?? '').trim();
  if (!endpoint || !token) throw new Error('CONTENT_SYNC_URL / CONTENT_SYNC_TOKEN not set');
  if (!row.zh_title || !row.zh_markdown) throw new Error('zh version missing in D1; refusing identity flip');

  const versions: Array<Record<string, unknown>> = [
    {
      language: 'en',
      title: enTitle,
      contentMarkdown: enMarkdown,
      provenance: 'original',
    },
    {
      language: 'zh',
      title: row.zh_title,
      contentMarkdown: row.zh_markdown,
      ...(row.zh_excerpt ? { excerpt: row.zh_excerpt } : {}),
      provenance: row.zh_provenance ?? 'official-zh',
      ...(row.zh_translation_model ? { translationModel: row.zh_translation_model } : {}),
      ...(row.zh_original_alt_url ? { originalAltUrl: row.zh_original_alt_url } : {}),
      ...(row.zh_translated_at ? { translatedAt: row.zh_translated_at } : {}),
    },
  ];
  const categories = row.categories ? row.categories.split('\u0000') : [];
  const body = JSON.stringify({
    sources: [],
    sql: [],
    articles: [
      {
        id: row.id,
        sourceId: row.source_id,
        originalUrl: enUrl,
        originalLanguage: 'en',
        publishedAt: row.published_at,
        ...(row.published_at_source ? { publishedAtSource: row.published_at_source } : {}),
        ...(row.image_url ? { imageUrl: row.image_url } : {}),
        ...(row.author ? { author: row.author } : {}),
        sourceDomain: row.source_domain,
        published: row.published === 1,
        ...(row.quality_score != null ? { qualityScore: row.quality_score } : {}),
        ...(row.quality_model ? { qualityModel: row.quality_model } : {}),
        ...(categories.length > 0 ? { categories } : {}),
        versions,
      },
    ],
  });
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`content-sync failed: ${lastError}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const readOption = (name: string): string | undefined => {
    const eq = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (eq !== undefined) return eq;
    const at = args.indexOf(`--${name}`);
    return at !== -1 ? args[at + 1] : undefined;
  };
  const sourceFilter = readOption('source');
  const limitArg = readOption('limit');
  const limit = limitArg ? Number(limitArg) : undefined;
  const idFilter = readOption('id');

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const sources = await loadSources(rootDir);
  const byId = new Map<string, SourceConfig>(sources.map((s) => [s.id, s]));
  const targets: TargetRow[] = [];
  const sourceIds = sourceFilter ? [sourceFilter] : Object.keys(ZH_TO_EN_PREFIX);
  for (const sourceId of sourceIds) {
    // --id 模式 = 强制修复单篇（忽略分支过滤，zh 一律从 zh 页重建）。
    const where = idFilter
      ? `a.id = '${idFilter.replace(/'/g, "''")}'`
      : `((a.original_language = 'zh' AND e.article_id IS NULL)
           OR (a.original_language = 'en' AND e.article_id IS NOT NULL AND z.article_id IS NULL))`;
    const rows = queryD1(
      `SELECT a.id, a.source_id, a.original_language, a.original_url, a.published_at, a.published_at_source, a.image_url, a.author, a.source_domain,
              a.published, a.quality_score, a.quality_model,
              z.title AS zh_title, z.content_markdown AS zh_markdown, z.excerpt AS zh_excerpt,
              z.translated_at AS zh_translated_at, z.translation_model AS zh_translation_model,
              z.original_alt_url AS zh_original_alt_url, z.provenance AS zh_provenance,
              e.title AS en_title, e.content_markdown AS en_markdown,
              (SELECT GROUP_CONCAT(c.category_name, char(0)) FROM article_categories c WHERE c.article_id = a.id) AS categories
       FROM articles a
       LEFT JOIN article_versions z ON z.article_id = a.id AND z.language = 'zh'
       LEFT JOIN article_versions e ON e.article_id = a.id AND e.language = 'en'
       WHERE a.source_id = '${sourceId}' AND ${where}
       ORDER BY a.published_at DESC`,
    ) as unknown as TargetRow[];
    targets.push(...rows);
  }
  const bounded = (idFilter ? targets.filter((t) => t.id === idFilter) : targets).slice(0, limit ?? targets.length);
  console.log(`targets: ${bounded.length} zh-only row(s)${apply ? '' : ' [dry-run]'}`);

  const fetchImpl = createFetchImpl(console);
  // 与生产一致的抓取后端（node 抽取失败自动回退 Defuddle）；
  // openai.com 对 BlogsWikiBot UA 整站 403，FETCH_USER_AGENT 传浏览器 UA。
  const fetchBackend = createFetchBackend(process.env.FETCH_BACKEND ?? 'node');
  let ok = 0;
  const failures: string[] = [];
  for (const row of bounded) {
    // zh 行按前缀映射推导；已是 en 主实体的坏行（zh 被清）直接用现 URL。
    const enUrl = row.original_language === 'en' ? row.original_url : toEnUrl(row.source_id, row.original_url);
    if (!enUrl) {
      failures.push(`${row.id}: no zh→en URL mapping`);
      continue;
    }
    if (!apply) {
      console.log(`  would fetch ${enUrl}`);
      continue;
    }
    try {
      const source = byId.get(row.source_id);
      if (!source) throw new Error('source config not found (blocked?)');
      // en 版本已在（此前误跑翻正但 zh 被清的行）：直接用 D1 现值，免重抓。
      let enTitle = row.en_title ?? '';
      let enMarkdown = row.en_markdown ?? '';
      if (enMarkdown.trim().length >= 400 && enTitle.trim()) {
        console.log('    en reused from D1');
      } else {
        const article = await fetchBackend.fetchArticle(source, { url: enUrl }, fetchImpl);
        if (!article.title?.trim()) throw new Error('empty title');
        if (article.contentMarkdown.trim().length < 400) {
          throw new Error(`extracted content too short (${article.contentMarkdown.trim().length} chars)`);
        }
        enTitle = article.title;
        enMarkdown = article.contentMarkdown;
      }
      // zh 版本缺失或 --id 强制模式：从 zh 页重建（坏行的 original_url 已翻正，
      // 用反向映射还原 zh 页地址）。
      if (!row.zh_markdown || idFilter) {
        const zhSourceUrl = row.original_language === 'zh'
          ? row.original_url
          : toZhUrl(row.source_id, row.original_url) ?? row.original_url;
        const zhArticle = await fetchBackend.fetchArticle(source, { url: zhSourceUrl }, fetchImpl);
        if (!zhArticle.title?.trim() || zhArticle.contentMarkdown.trim().length < 400) {
          throw new Error(`zh version rebuild failed from ${zhSourceUrl}`);
        }
        row.zh_title = zhArticle.title;
        row.zh_markdown = zhArticle.contentMarkdown;
        row.zh_provenance = 'official-zh';
        console.log(`    zh rebuilt from ${zhSourceUrl}`);
      }
      await pushRepair(row, enUrl, enTitle, enMarkdown);
      ok += 1;
      console.log(`  + ${row.id} ← ${enTitle.slice(0, 60)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${row.id}: ${message}`);
      console.error(`  - ${row.id}: ${message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`done: ok=${ok} failed=${failures.length} / ${bounded.length}`);
  if (failures.length > 0) {
    console.log('failures:\n' + failures.map((f) => `  ${f}`).join('\n'));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
