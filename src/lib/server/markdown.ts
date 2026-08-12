/**
 * 独立 Markdown 渲染器 —— SSR 请求时渲染 D1 中的 content_markdown。
 *
 * 复刻 Astro 的 Markdown 管线（astro.config.mjs 中配置的插件），
 * 确保 SSR 输出与静态构建一致：
 *   remarkParse → remarkGfm → remarkMath → remarkRehype → rehypeKatex → 代码高亮 → rehypeStringify
 *
 * 语法高亮：用 @shikijs/engine-javascript（纯 JS 正则引擎）而非默认的
 * Oniguruma WASM——Cloudflare Workers 禁止 WASM 代码生成
 * （WebAssembly.instantiate: Wasm code generation disallowed by embedder）。
 * 不能用 @shikijs/rehype 默认入口（getSingletonHighlighter 不传 engine，
 * 强制走 WASM）；其 core 入口（rehypeShikiFromHighlighter）与当前
 * hast 版本存在兼容问题，故这里用自建 rehype 插件直接调 codeToHast。
 *
 * 图片不走代理；渲染时会按原文 URL 将相对图片地址规范为远程绝对地址，
 * 避免浏览器把它们错误解析到本站 `/articles/...` 路径。
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import { createHighlighter, type Highlighter } from 'shiki';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import { visit } from 'unist-util-visit';
import { toString } from 'hast-util-to-string';
import type { Root, Element } from 'hast';
import rehypeStringify from 'rehype-stringify';

/** 博客代码块常用语言（控制 bundle 大小）。 */
const HIGHLIGHT_LANGS = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'bash',
  'shell',
  'html',
  'css',
  'markdown',
  'yaml',
  'sql',
] as const;

const HIGHLIGHT_THEME = 'github-light-default';

/**
 * 自定义 rehype 插件（attacher 模式）：把 `pre > code.language-xxx`
 * 替换为 Shiki 高亮结果。不用 @shikijs/rehype 插件本体（其 highlighter
 * 创建强制走 WASM）。unified 的 use() 会以 attacher 工厂方式调用本函数
 * （plugin.call(processor, input)），故返回 transformer。
 */
function rehypeHighlight(input: { highlighter: Highlighter }) {
  const { highlighter } = input;
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || index === undefined || !parent) return;
      const code = node.children[0] as Element | undefined;
      if (!code || code.type !== 'element' || code.tagName !== 'code') return;
      const classes = code.properties?.className;
      const lang = Array.isArray(classes)
        ? (classes.find((c) => typeof c === 'string' && c.startsWith('language-')) as string | undefined)?.slice(9)
        : undefined;
      if (!lang || !highlighter.getLoadedLanguages().includes(lang)) return;
      try {
        const fragment = highlighter.codeToHast(toString(code), {
          lang,
          theme: HIGHLIGHT_THEME,
        });
        const pre = fragment.children[0] as Element | undefined;
        if (pre) {
          pre.properties ??= {};
          pre.properties['data-language'] = lang;
          parent.children[index] = pre;
        }
      } catch (error) {
        // 单个代码块高亮失败不影响整页渲染
        console.error(`[markdown] code highlight failed for lang ${lang}`, error);
      }
      return 'skip';
    });
    // unified 约定：rehype 插件必须返回（可能修改后的）tree。
    return tree;
  };
}

/** Markdown 输出的轻量语义增强：单页单 H1、标题锚点、表格横滑与资源 URL 安全规范化。 */
function rehypeReaderEnhancements() {
  return (tree: Root, file: { data: Record<string, unknown> }) => {
    const usedHeadingIds = new Map<string, number>();
    const baseUrl = typeof file.data.baseUrl === 'string' ? file.data.baseUrl : undefined;
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName === 'img' && node.properties) {
        const src = node.properties.src;
        if (typeof src === 'string') {
          const safeSrc = resolveAssetUrl(src, baseUrl);
          if (safeSrc) node.properties.src = safeSrc;
          else delete node.properties.src;
        }
        if (typeof node.properties.alt !== 'string') node.properties.alt = '';
        node.properties.loading = 'lazy';
        node.properties.decoding = 'async';
        node.properties.referrerPolicy = 'no-referrer';
      }

      if (node.tagName === 'a' && node.properties) {
        const href = node.properties.href;
        if (typeof href === 'string') {
          const safeHref = resolveLinkUrl(href, baseUrl);
          if (safeHref) {
            node.properties.href = safeHref;
            if (isExternalHttpUrl(safeHref, baseUrl)) {
              node.properties.target = '_blank';
              node.properties.rel = ['noreferrer', 'noopener'];
            }
          } else {
            delete node.properties.href;
          }
        }
      }

      if (node.tagName === 'h1') node.tagName = 'h2';

      if (/^h[2-6]$/.test(node.tagName)) {
        node.properties ??= {};
        const existingId = node.properties.id;
        const base =
          typeof existingId === 'string' && existingId
            ? existingId
            : headingIdFromText(toString(node));
        const count = usedHeadingIds.get(base) ?? 0;
        usedHeadingIds.set(base, count + 1);
        node.properties.id = count ? `${base}-${count + 1}` : base;
      }

      if (node.tagName === 'table' && index !== undefined && parent) {
        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'] },
          children: [node],
        } as Element;
        return 'skip';
      }
    });
    wrapTestimonialFigures(tree);
    return tree;
  };
}

/** 将 logo 段 + 紧随 blockquote 包装为稳定的证言卡片结构，避免 CSS :has/float hack。 */
function wrapTestimonialFigures(node: Root | Element): void {
  for (const child of node.children) {
    if (isElementNode(child)) wrapTestimonialFigures(child);
  }

  for (let i = 0; i < node.children.length; i++) {
    const current = node.children[i];
    if (!isLogoParagraph(current)) continue;
    const quoteIndex = findNextElementIndex(node.children, i + 1);
    if (quoteIndex < 0) continue;
    const quote = node.children[quoteIndex];
    if (!isElementNode(quote) || quote.tagName !== 'blockquote') continue;
    const img = getSingleMeaningfulImageChild(current);
    if (!img) continue;
    node.children.splice(i, quoteIndex - i + 1, createTestimonialFigure(img, quote));
  }
}

/** 跳过 hast 中元素之间的空白文本节点。 */
function findNextElementIndex(children: Root['children'], start: number): number {
  for (let i = start; i < children.length; i++) {
    const child = children[i];
    if (isElementNode(child)) return i;
    if (child.type === 'text' && child.value.trim() === '') continue;
    return -1;
  }
  return -1;
}

function createTestimonialFigure(img: Element, quote: Element): Element {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['reader-testimonial'] },
    children: [
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['reader-testimonial-logo'] },
        children: [img],
      },
      {
        type: 'element',
        tagName: 'blockquote',
        properties: mergeClassName(quote.properties, 'reader-testimonial-quote'),
        children: quote.children,
      },
    ],
  };
}

function isLogoParagraph(node: Root['children'][number]): node is Element {
  if (!isElementNode(node) || node.tagName !== 'p') return false;
  const img = getSingleMeaningfulImageChild(node);
  if (!img) return false;
  const alt = img.properties?.alt;
  return typeof alt === 'string' && /logo/i.test(alt);
}

function getSingleMeaningfulImageChild(node: Element): Element | null {
  const meaningful = node.children.filter((child) => {
    if (child.type === 'text') return child.value.trim() !== '';
    return child.type === 'element';
  });
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (!isElementNode(only)) return null;
  if (only.tagName === 'img') return only;
  // logo 常被包在链接里：<p><a href="..."><img alt="...logo"></a></p>
  if (only.tagName === 'a') return getSingleMeaningfulImageChild(only);
  return null;
}

function mergeClassName(
  properties: Element['properties'] | undefined,
  className: string,
): Element['properties'] {
  const next = { ...(properties ?? {}) };
  const existing = next.className;
  const parts = Array.isArray(existing)
    ? existing.map(String).filter(Boolean)
    : typeof existing === 'string' || typeof existing === 'number'
      ? String(existing).split(/\s+/).filter(Boolean)
      : [];
  next.className = parts.includes(className) ? parts : [...parts, className];
  return next;
}

function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === 'object' && (node as { type?: string }).type === 'element');
}

function headingIdFromText(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'section';
}

/**
 * Markdown 抓取结果可能携带 `images/example.png` 一类相对资源地址。
 * 浏览器会默认按本站文章路由解析，必须回到原文 URL 的语境。
 * 只放行网页图片地址或 data:image，其他协议剥离，避免外部内容把危险资源
 * 通过 set:html 带入阅读页。
 */
function resolveAssetUrl(value: string, baseUrl: string | undefined): string | null {
  if (/^data:image\//i.test(value.trim())) return value;
  try {
    const resolved = new URL(value, baseUrl);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
  } catch {
    return null;
  }
}

/**
 * 外部 Markdown 经 set:html 直出，链接必须显式白名单。
 * 相对链接使用原文地址解析，防止落到本站文章路由；mailto 保留给作者联系方式。
 */
function resolveLinkUrl(value: string, baseUrl: string | undefined): string | null {
  if (value.startsWith('#')) return value;
  try {
    const resolved = new URL(value, baseUrl);
    return ['http:', 'https:', 'mailto:'].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function isExternalHttpUrl(value: string, baseUrl: string | undefined): boolean {
  try {
    const target = new URL(value);
    const base = baseUrl ? new URL(baseUrl) : null;
    return (target.protocol === 'http:' || target.protocol === 'https:') && target.origin !== base?.origin;
  } catch {
    return false;
  }
}

/** 预构建 highlighter（JS 引擎，无 WASM，Worker 兼容）。 */
const highlighterPromise = createHighlighter({
  themes: [HIGHLIGHT_THEME],
  langs: [...HIGHLIGHT_LANGS],
  engine: createJavaScriptRegexEngine(),
});

/** 预构建 processor（避免每次请求重新组装插件链）。高亮初始化失败时降级为无高亮渲染。 */
const processorPromise = highlighterPromise
  .then((highlighter) =>
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeHighlight, { highlighter })
      .use(rehypeReaderEnhancements)
      .use(rehypeStringify),
  )
  .catch((error: unknown) => {
    console.error('[markdown] highlighter init failed; falling back to no-highlight rendering', error);
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeReaderEnhancements)
      .use(rehypeStringify);
  });

export interface RenderMarkdownOptions {
  /** 原文 URL；用于还原抓取 Markdown 中的相对图片地址。 */
  baseUrl?: string;
}

/** 将 Markdown 渲染为 HTML 字符串。 */
export async function renderMarkdown(
  markdown: string,
  options: RenderMarkdownOptions = {},
): Promise<string> {
  const processor = await processorPromise;
  const file = await processor.process({
    value: markdown,
    data: { baseUrl: options.baseUrl },
  });
  return String(file);
}
