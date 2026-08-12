/**
 * 原文入库前的最低完整性门禁（handoff §9）。
 *
 * 检查项（error 为阻塞项，warn 记入审计但可入库）：
 * - title 非空
 * - 正文长度 >= MIN_CONTENT_CHARS
 * - published_at 存在（或显式 fallback）
 * - 内容不像是导航/归档列表（文本过短且链接密集）
 * - 无 placeholder 泄漏（lorem / TODO / 空链接 / 空图片）
 * - 图片 URL 全部为绝对 http(s) 原链（不下载、不改写）
 *
 * 同时输出技术统计：math / table / code block / image 数量。
 */

import type { ExtractedArticle, SourceConfig } from './types';
import { DEFAULT_MIN_CONTENT_CHARS as MIN_CONTENT_CHARS } from './constants';

export type IntegritySeverity = 'error' | 'warn';

export interface IntegrityIssue {
  severity: IntegritySeverity;
  code: string;
  message: string;
}

export interface ContentStats {
  mathCount: number;
  tableCount: number;
  codeBlockCount: number;
  imageCount: number;
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 剥离 fenced 代码块，返回代码块之外的内容。模板语法（{{ ... }}）、shell
 * 变量、Jinja 等大量出现在代码块内，属于合法展示内容，不应触发 placeholder
 * / 空链接 / 空图片等泄漏检查。
 */
function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, ' ');
}

export function contentStats(markdown: string): ContentStats {
  return {
    mathCount: (markdown.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) ?? []).length,
    tableCount: (markdown.match(/^\s*\|.*\|\s*$/gm) ?? []).length > 0
      ? (markdown.match(/^\s*\|[^\n]+\|\s*$/gm) ?? []).length
      : 0,
    codeBlockCount: (markdown.match(/```/g) ?? []).length / 2,
    imageCount: (markdown.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
  };
}

const PLACEHOLDER_PATTERNS: Array<{ code: string; pattern: RegExp; severity?: IntegritySeverity }> = [
  // 小写 snake/kebab 风格模板（{{content}}、{{article}}）在 LLM 技术文章里
  // 常见于正文展示的 prompt 模板示例（HuggingGPT / AutoGPT / hamel.dev），
  // 无法可靠区分"渲染泄漏"与"内容本身"，降为 warn（记录但不阻塞入库）。
  { code: 'template-placeholder', pattern: /\{\{\s*[a-z][a-z0-9_-]*\s*\}\}/, severity: 'warn' as const },
  { code: 'lorem-ipsum', pattern: /lorem ipsum/i },
  // TODO/TBD 在技术文章正文可能合法出现（讨论代码中的待办），降为警告。
  { code: 'todo-marker', pattern: /\b(?:TODO|TBD|FIXME|XXX)\b/i, severity: 'warn' as const },
  { code: 'empty-link', pattern: /\[[^\]]*\]\(\s*\)/ },
  { code: 'empty-image', pattern: /!\[[^\]]*\]\(\s*\)/ },
];

const NAV_LINK_DENSITY = 3;

/**
 * Substack 直播/转录/促销信号（handoff dan-koe qualityFilter 要求）。
 * 命中任意一条即视为纯 livestream / promo 内容，不入库：
 * - "Generate transcript" / "A recording from ... live video"：视频/直播转录
 * - "Paid episode"：付费墙后的直播录音
 * - 明显的活动 deadline / 订阅价格 / 销售文案
 */
const PROMO_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'livestream-transcript', pattern: /generate transcript/i },
  { code: 'livestream-recording', pattern: /a recording from .* live video/i },
  { code: 'paid-episode-paywall', pattern: /paid episode/i },
  { code: 'event-deadline', pattern: /(?:in|only)\s+\d+\s+days?.*(?:deadline|to book|to lock|ends?)/i },
];

export function checkArticleIntegrity(
  article: ExtractedArticle,
  source: SourceConfig,
  options: { promoFilter?: boolean; minContentChars?: number } = {},
): { issues: IntegrityIssue[]; stats: ContentStats } {
  const minContentChars = options.minContentChars ?? source.min_content_chars ?? MIN_CONTENT_CHARS;
  const promoFilter = options.promoFilter ?? source.quality_filter ?? false;
  const issues: IntegrityIssue[] = [];
  const stats = contentStats(article.contentMarkdown);

  if (!article.title || !article.title.trim()) {
    issues.push({ severity: 'error', code: 'missing-title', message: 'title 为空' });
  }

  const text = plainText(article.contentMarkdown);
  if (text.length < minContentChars) {
    issues.push({
      severity: 'error',
      code: 'content-too-short',
      message: `正文纯文本 ${text.length} 字符，低于 ${minContentChars}`,
    });
  }

  // 无效日期哨兵（如 Defuddle 对无日期页面返回 0001-01-01T00:00:00Z）视为
  // 无日期：handoff §9 要求 published_at 存在或显式 fallback，FAQ/About
  // 等辅助页无日期且不应入库。
  const publishedValid = article.publishedAt
    ? (() => {
        const time = Date.parse(article.publishedAt);
        if (Number.isNaN(time)) return false;
        const year = new Date(time).getUTCFullYear();
        return year >= 1970 && year <= 2100;
      })()
    : false;
  if (!publishedValid) {
    issues.push({
      severity: 'error',
      code: 'missing-published-date',
      message: article.publishedAt
        ? `published_at 无效（${article.publishedAt}）且无显式 fallback`
        : 'published_at 缺失且无显式 fallback',
    });
  }

  // 导航 / 归档列表检测：文本很短但链接很多（如索引页、归档页、链接集）。
  const linkCount = (stripCodeBlocks(article.contentMarkdown).match(/\[[^\]]*\]\(https?:\/\/[^)\s]+\)/g) ?? []).length;
  if (text.length < minContentChars && linkCount >= NAV_LINK_DENSITY) {
    issues.push({
      severity: 'error',
      code: 'looks-like-navigation-list',
      message: `正文 ${text.length} 字符但含 ${linkCount} 个外链，疑似导航/归档列表`,
    });
  }

  for (const entry of PLACEHOLDER_PATTERNS) {
    if (!entry.pattern.test(stripCodeBlocks(article.contentMarkdown))) continue;
    if (entry.severity === 'warn') {
      issues.push({ severity: 'warn', code: entry.code, message: `正文含 ${entry.code} 标记（提示性）` });
    } else {
      issues.push({
        severity: 'error',
        code: entry.code,
        message: `代码块外正文含 placeholder 泄漏（${entry.code}）`,
      });
    }
  }

  // 图片必须保留绝对 http(s) 原链；data:/blob: URI 是完整内联原图（如
  // Cloudflare 的 base64 内联图），保留原链不算错误；只有相对路径视为
  // 规范化失败。
  for (const match of stripCodeBlocks(article.contentMarkdown).matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const url = match[1];
    if (!/^(?:https?:|data:|blob:)/i.test(url)) {
      issues.push({
        severity: 'error',
        code: 'image-url-not-absolute',
        message: `图片 URL 既非绝对 http(s) 也非 data/blob 内联：${url}`,
      });
    }
  }

  // Substack 直播/转录/促销信号（仅 qualityFilter 源启用）。
  if (promoFilter) {
    for (const entry of PROMO_PATTERNS) {
      if (entry.pattern.test(article.contentMarkdown)) {
        issues.push({
          severity: 'error',
          code: entry.code,
          message: `命中促销/直播信号（${entry.code}）`,
        });
      }
    }
  }

  return { issues, stats };
}
