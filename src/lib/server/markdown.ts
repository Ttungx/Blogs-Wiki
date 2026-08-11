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
 * remarkImageProxy 暂未接入（需要请求上下文）；SSR 图片直接用远程 URL。
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

const HIGHLIGHT_THEME = 'github-dark-default';

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
        if (pre) parent.children[index] = pre;
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
      .use(rehypeStringify);
  });

/** 将 Markdown 渲染为 HTML 字符串。 */
export async function renderMarkdown(markdown: string): Promise<string> {
  const processor = await processorPromise;
  const file = await processor.process(markdown);
  return String(file);
}
