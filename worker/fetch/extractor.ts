/**
 * 文章提取器 —— Phase 6 引擎组件（Worker-compatible fetch path）。
 *
 * 用 Defuddle（正文提取）+ linkedom（DOM 实现）替换 `scripts/update/fetch.ts`
 * 的 `jsdom + @mozilla/readability` 组合。Defuddle 在数学公式、脚注、元数据
 * 提取、噪声排除上全面优于 Readability，且零 Node 内置模块依赖，Cloudflare
 * Workers 可用。
 *
 * 这是预研组件：不接线进 `scripts/update/` 生产管线（路线图纪律——Phase 5
 * 管线接 Repository interface 后才接线）。当前由 `__tests__/extractor.test.ts`
 * 锚定行为，等 Phase 5-6 接线时直接插入。
 *
 * 设计依据：
 * - linkedom 而非 jsdom：jsdom 依赖 node: 内置模块，Workers 不可用；linkedom
 *   纯 JS，有专门的 `linkedom/worker` 入口。Defuddle 官方 CLI 也用 linkedom。
 * - 全局 shim：Defuddle 内部的 turndown 在模块初始化时检查 globalThis.window
 *   .DOMParser（已验证），linkedom 的 DOMParser 通过全局注入是官方推荐用法。
 * - ExtractionResult 而非直接返回 DefuddleResponse：领域层有自己的类型
 *   （RawArticle），提取器映射到领域边界，不泄漏 Defuddle 的类型。将来换引擎
 *   只改这里，调用方无感。
 */

import { parseHTML } from 'linkedom';
import { collapseCarousels, type CarouselNode } from './carousel-collapse';
import { DEFAULT_MIN_CONTENT_CHARS as MIN_CONTENT_CHARS } from '../../scripts/update/constants';
import { isGhostPublishedAt } from '../../scripts/update/git-date';

/**
 * 归一化 Defuddle 的 published 值：
 * - 逗号分隔的多时间戳（github.blog JSON-LD 对同一时刻给出 -07:00 与
 *   +00:00 两个 datePublished，Defuddle 拼接为 "A, B"）取第一段；
 * - 非法值返回空串。
 */
function normalizePublished(raw: string): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const first = value.split(',')[0]?.trim() ?? '';
  if (!first) return '';
  const time = Date.parse(first);
  if (Number.isNaN(time)) return '';
  const year = new Date(time).getUTCFullYear();
  return year >= 1970 && year <= 2100 ? first : '';
}

/**
 * Next.js Flight 数据里的文章创建时间回退（anthropic research 页面无
 * meta/JSON-LD 日期，日期只存在于 `_createdAt` 字段）。取第一个出现值
 * （当前文章），相关推荐等后续值不取。
 */
function resolveNextJsCreatedAt(html: string): string {
  for (const match of html.matchAll(/_createdAt\\?":\\?"([^\\"]+)/g)) {
    const value = match[1]?.trim() ?? '';
    if (value && !isGhostPublishedAt(value)) return value;
  }
  return '';
}

/**
 * turndown（Defuddle 的 markdown 转换器）在模块初始化时检查 globalThis.window
 * 和 globalThis.window.DOMParser。在纯 Node / Workers 中这些不存在，需要注入
 * linkedom 的实现。
 *
 * 守卫避免重复设置（多次 import 本模块或测试环境已有全局时跳过）。
 */
function ensureTurndownGlobals(): void {
  const global = globalThis as Record<string, unknown>;
  if (!global.window) {
    // turndown 用 `typeof window !== 'undefined' ? window : {}` 选 DOMParser；
    // 设为 globalThis 让它找到我们注入的 globalThis.DOMParser。
    global.window = global;
  }
  if (!global.DOMParser) {
    // linkedom 的 DOMParser 在 parseFromString 里委托给 parseHTML。
    const { DOMParser } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    global.DOMParser = DOMParser;
  }
  if (typeof global.document === 'undefined') {
    // turndown 的 legacy 回退路径检查 document.implementation.createHTMLDocument。
    // 给一个 linkedom document 占位，让它走 DOMParser 路径而非 legacy 回退。
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    global.document = document;
  }
}

ensureTurndownGlobals();

// defuddle/full 自带数学公式（temml/mathml-to-latex）和 markdown 转换（turndown）。
// 必须用动态 import：ESM 的静态 import 是 hoisted 的，在 ensureTurndownGlobals()
// 之前执行，会导致 turndown 初始化时 globalThis.window 还未设好，markdown
// 转换降级为 legacy 回退并报错。动态 import 确保全局 shim 先就位。
let defuddleCtor: typeof import('defuddle/full').default | null = null;
async function getDefuddle() {
  if (!defuddleCtor) {
    const mod = await import('defuddle/full');
    defuddleCtor = mod.default;
  }
  return defuddleCtor;
}

export interface ExtractionInput {
  /** 完整页面 HTML。 */
  html: string;
  /** 页面 URL（用于 URL 绝对化、Defuddle extractor 匹配）。 */
  url: string;
  /** 正文最小纯文本字符数；未设则用 DEFAULT_MIN_CONTENT_CHARS。 */
  minContentChars?: number;
}

export interface ExtractionResult {
  title: string;
  author: string;
  /** ISO 8601 或空串（与 RawArticle.publishedAt 约定一致）。 */
  publishedAt: string;
  /** og:image 或空串。 */
  imageUrl: string;
  /** BCP 47 语言码，如 'en' / 'zh'。 */
  originalLanguage: string;
  /** Defuddle 的 Markdown 输出。 */
  contentMarkdown: string;
  wordCount: number;
}

/**
 * 与 scripts/update/fetch.ts 的 directoryBaseUrl 等价的内联实现（extractor
 * 不能依赖 Node-only 模块）。页面 URL 常省略尾斜杠（Jekyll permalinks），
 * 相对图片/链接会丢目录段；末尾无扩展名时补成目录形式。
 */
function directoryBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname;
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? '';
  if (!pathname.endsWith('/') && !/\.[a-z0-9]{1,8}$/i.test(lastSegment)) {
    url.pathname = `${pathname}/`;
  }
  return url.toString();
}

/**
 * Defuddle 转 Markdown 后，相对图片/链接 URL 原样保留（例如 qwenlm
 * 的 `![Back](back_arrow.png)`）。对 markdown 输出做绝对化：图片与链接
 * 的 URL 若为相对路径则基于 directoryBaseUrl 补全，保留原始引用链接，
 * 不下载、不改写 CDN 地址。
 */
function absolutizeMarkdownUrls(markdown: string, baseUrl: string): string {
  const base = directoryBaseUrl(baseUrl);
  return markdown
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt: string, rawUrl: string) => {
      if (/^(?:https?:|data:|blob:|mailto:|#)/i.test(rawUrl)) return match;
      try {
        const resolved = new URL(rawUrl, base);
        if (!/^https?:$/.test(resolved.protocol)) return match;
        return `![${alt}](${resolved.toString()})`;
      } catch {
        return match;
      }
    })
    .replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, text: string, rawUrl: string) => {
      if (/^(?:https?:|data:|blob:|mailto:|#|javascript:)/i.test(rawUrl)) return match;
      try {
        const resolved = new URL(rawUrl, base);
        if (!/^https?:$/.test(resolved.protocol)) return match;
        return `[${text}](${resolved.toString()})`;
      } catch {
        return match;
      }
    });
}

/**
 * 从页面 HTML 提取文章正文与元数据。
 *
 * 内部用 Defuddle（defuddle/full，带数学公式 + markdown 转换）+ linkedom（DOM）。
 * `markdown: true` 使 `result.content` 直接返回 Markdown（而非 HTML）。
 *
 * @throws {Error} Defuddle 提取失败，或正文为空 / 过短（< {@link MIN_CONTENT_CHARS} 字符）。
 */
export async function extractArticle(input: ExtractionInput): Promise<ExtractionResult> {
  const { html, url, minContentChars } = input;
  let { document } = parseHTML(html);

  // Defuddle's `embedToMarkdown` rule matches image/link sources against a
  // substring regex (`twitter\.com|x\.com`). CDN hostnames that merely end in
  // "x.com" (e.g. Meta's `*.fbsbx.com`) are then misclassified as X/Twitter
  // embeds and the image is dropped entirely from the Markdown output. Rewrite
  // the offending substring to a placeholder before extraction and restore it
  // afterwards so such images survive (defuddle 0.19.2 upstream bug).
  const X_COM_TOKEN = 'x__dot__com';
  let patchedSources = false;
  for (const img of document.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src') ?? '';
    if (!/(?:twitter\.com|x\.com)/i.test(src)) continue;
    try {
      const hostname = new URL(src, url).hostname;
      if (/^(?:www\.)?(?:twitter\.com|x\.com)$/i.test(hostname)) continue; // genuine embed
    } catch {
      continue;
    }
    img.setAttribute('src', src.replace(/x\.com/gi, X_COM_TOKEN));
    patchedSources = true;
  }

  // 客户证言轮播折叠（与 Node 抓取链共用逻辑）：只保留前 3 条
  // logo + quote，删除轮播 UI，追加原文指引。必须赶在 Defuddle
  // 转 Markdown 之前执行，否则 16 张 logo 全部进入正文。
  // 作用域收窄到正文根，避免 header/sidebar 轮播被当成证言并注入指引。
  const carouselRoot =
    document.querySelector('main, article, [role="main"]') ?? document.body;
  collapseCarousels(carouselRoot as unknown as CarouselNode, url);

  const DefuddleFull = await getDefuddle();
  const result = new DefuddleFull(document, { url, markdown: true }).parse();

  let contentMarkdown = (result.content ?? '').trim();
  if (patchedSources) {
    contentMarkdown = contentMarkdown.replace(new RegExp(X_COM_TOKEN, 'g'), 'x.com');
  }
  contentMarkdown = absolutizeMarkdownUrls(contentMarkdown, url);
  const textLength = contentMarkdown.replace(/\s+/g, ' ').length;
  const minChars = minContentChars ?? MIN_CONTENT_CHARS;
  if (textLength < minChars) {
    throw new Error(
      `extractor: content too short (${textLength} chars, minimum ${minChars}) for ${url}`,
    );
  }

  return {
    title: (result.title ?? '').trim(),
    author: (result.author ?? '').trim(),
    publishedAt: (() => {
      const fromDefuddle = normalizePublished(result.published ?? '');
      if (fromDefuddle && !isGhostPublishedAt(fromDefuddle)) return fromDefuddle;
      return resolveNextJsCreatedAt(html);
    })(),
    imageUrl: (result.image ?? '').trim(),
    originalLanguage: (result.language ?? 'en').trim().split(/[_-]/)[0]?.toLowerCase() || 'en',
    contentMarkdown,
    wordCount: result.wordCount ?? 0,
  };
}
