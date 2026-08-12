/**
 * Translation planning scaffold: pure functions, no I/O, not wired into
 * the production translate pipeline.
 *
 * Responsibilities:
 *  - Parse Markdown into a remark (mdast) AST (GFM enabled).
 *  - Protect link/image/definition URLs, code, inline code, raw HTML, and
 *    math (display + inline, via remark-math) with deterministic tokens,
 *    then strictly restore them after a model translation pass.
 *  - Split body content into chunks at heading / top-level block boundaries
 *    without ever cutting through a structural block (code fence, table,
 *    list, blockquote, ...).
 *  - Decide the translation mode from CJK ratio and official-Chinese signal:
 *    official-zh > native-zh > translate.
 *  - Build a self-describing TranslationPlan consumed later by an executor.
 *
 * Default-safe: conservative thresholds, loud failures on anything that
 * could corrupt protected content, and no side effects.
 */

import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';

/** Which pipeline action the plan prescribes. */
export type TranslationMode = 'official-zh' | 'native-zh' | 'translate';

/** What a protected span stands for in the original Markdown. */
export type SpanKind = 'url' | 'code' | 'inline-code' | 'html' | 'math' | 'inline-math';

/** A value removed from the text sent to the model, keyed by its token. */
export interface ProtectedSpan {
  kind: SpanKind;
  token: string;
  value: string;
}

/** One independently translatable unit of the article. */
export interface PlannedChunk {
  /** Stable id derived from heading path + position; safe to use as a checkpoint key. */
  id: string;
  kind: 'title' | 'body';
  /** English heading texts leading to this chunk; empty for pre-heading content. */
  headingPath: string[];
  /** Protected Markdown (tokens in place of URLs/code/html) ready for the model. */
  source: string;
  /** SHA-256 of `source`; changes when the source changes, invalidating checkpoints. */
  sha256: string;
  /** Estimated tokens (chars / 4); used for the chunk size cap. */
  tokens: number;
  /** Spans whose tokens appear in `source`. Empty for passthrough modes. */
  spans: ProtectedSpan[];
  /** True when a single block alone exceeded the token cap and was kept whole. */
  oversized?: boolean;
}

/** Read-only settings for remark-stringify, kept consistent with the site's Markdown style. */
export interface StringifySettings {
  bullet?: '-' | '*' | '+';
  fence?: '`' | '~';
  emphasis?: '*' | '_';
  strong?: '*' | '_';
}

export interface ChunkOptions {
  /** Soft token cap per chunk; a single block may exceed it and is then kept whole. */
  maxTokens?: number;
  /** Hard guard against runaway chunk counts; exceeded => throw. */
  maxChunks?: number;
}

export interface TranslationInput {
  /** Full article body in Markdown (no frontmatter). Required. */
  markdown: string;
  /** Optional article title, planned as its own `title` chunk. */
  title?: string;
  /** Source article URL, carried through for executor/checkpoint use. */
  url?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  /**
   * Official-Chinese signal: `true` or the official zh URL when the article
   * body is already the official Chinese version. Highest mode priority.
   */
  officialZh?: boolean | string;
  /** CJK ratio at or above which the body is treated as native Chinese. Default 0.5. */
  cjkThreshold?: number;
  chunk?: ChunkOptions;
  stringify?: StringifySettings;
}

export interface TranslationPlan {
  url?: string;
  mode: TranslationMode;
  sourceLanguage: string;
  targetLanguage: string;
  /** Present only when `input.title` was provided. */
  title?: PlannedChunk;
  /** Body chunks in document order. Passthrough modes yield exactly one chunk. */
  chunks: PlannedChunk[];
  stats: {
    chunks: number;
    /** Blocks kept whole because they alone exceeded the token cap. */
    oversizeBlocks: number;
    totalTokens: number;
    cjkRatio: number;
  };
}

export const DEFAULT_CJK_THRESHOLD = 0.5;
export const DEFAULT_MAX_TOKENS = 6000;
export const DEFAULT_MAX_CHUNKS = 64;

/** Reserved token pattern; source text containing it fails fast instead of corrupting. */
const TOKEN_PATTERN = /\{\{BW:(?:url|code|inline-code|html|math|inline-math):\d+\}\}/g;

function parseMarkdown(markdown: string): MdNode {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown) as unknown as MdNode;
}

// Minimal structural node shape; avoids a hard dependency on @types/mdast.
interface MdNode {
  type: string;
  children?: MdNode[];
  [key: string]: unknown;
}

/**
 * CJK ideographs (+ CJK punctuation) / (CJK + Latin letters).
 * Code-block and raw-html content count toward the ratio; acceptable for a
 * binary gate at a 0.5 threshold.
 */
export function cjkRatio(text: string): number {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0x3000 && code <= 0x303f) // CJK Symbols and Punctuation
    ) {
      cjk += 1;
    } else if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) // a-z
    ) {
      latin += 1;
    }
  }
  const total = cjk + latin;
  return total === 0 ? 0 : cjk / total;
}

export function isNativeChinese(text: string, threshold = DEFAULT_CJK_THRESHOLD): boolean {
  return cjkRatio(text) >= threshold;
}

/**
 * Mode priority: official-zh > native-zh > translate.
 * An explicit official-Chinese signal always wins; a CJK-heavy body is
 * passed through without a model call; everything else is translated.
 */
export function resolveTranslationMode(
  markdown: string,
  options: { officialZh?: boolean | string; cjkThreshold?: number } = {},
): { mode: TranslationMode; cjkRatio: number } {
  if (options.officialZh) return { mode: 'official-zh', cjkRatio: cjkRatio(markdown) };
  const ratio = cjkRatio(markdown);
  if (ratio >= (options.cjkThreshold ?? DEFAULT_CJK_THRESHOLD)) {
    return { mode: 'native-zh', cjkRatio: ratio };
  }
  return { mode: 'translate', cjkRatio: ratio };
}

function assertNoReservedTokens(text: string): void {
  const match = text.match(TOKEN_PATTERN);
  if (match) {
    throw new Error(`source contains reserved translation token "${match[0]}"; refusing to protect`);
  }
}

function nextToken(kind: SpanKind, counter: { value: number }): string {
  counter.value += 1;
  return `{{BW:${kind}:${counter.value}}}`;
}

function longestRun(value: string, marker: '`' | '~'): number {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    current = character === marker ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/**
 * Walk the AST, replacing protected values with tokens.
 * `blockIndex` is the index of the current root child so each span can be
 * attributed to exactly one block for per-chunk restore.
 */
function collectSpans(
  node: MdNode,
  spans: ProtectedSpan[],
  blockSpans: ProtectedSpan[][],
  blockIndex: number,
  counter: { value: number },
  fence: '`' | '~',
): void {
  const protect = (kind: SpanKind, key: string, nodeToMutate: MdNode): void => {
    const raw = nodeToMutate[key];
    if (typeof raw !== 'string' || raw === '') return;
    let token = nextToken(kind, counter);
    // Make remark choose a delimiter longer than any delimiter run in the
    // protected value. The trailing X avoids inline-code edge spacing rules.
    if (kind === 'code') token += `${fence.repeat(longestRun(raw, fence))}X`;
    if (kind === 'inline-code') token += `${'`'.repeat(longestRun(raw, '`'))}X`;
    const span: ProtectedSpan = { kind, token, value: raw };
    spans.push(span);
    blockSpans[blockIndex].push(span);
    nodeToMutate[key] = span.token;
  };

  switch (node.type) {
    case 'link':
    case 'image':
    case 'definition':
      protect('url', 'url', node);
      break;
    case 'code':
      protect('code', 'value', node);
      break;
    case 'inlineCode':
      protect('inline-code', 'value', node);
      break;
    case 'html':
      protect('html', 'value', node);
      break;
    case 'math':
      protect('math', 'value', node);
      break;
    case 'inlineMath':
      protect('inline-math', 'value', node);
      break;
    default:
      break;
  }

  for (const child of node.children ?? []) {
    collectSpans(child, spans, blockSpans, blockIndex, counter, fence);
  }
}

/**
 * Parse Markdown and return the protected serialized text plus all spans.
 * Throws when the source already contains reserved token syntax.
 */
export function protectMarkdown(
  markdown: string,
  stringify?: StringifySettings,
): { text: string; spans: ProtectedSpan[] } {
  assertNoReservedTokens(markdown);
  const tree = parseMarkdown(markdown);
  const spans: ProtectedSpan[] = [];
  const blockSpans: ProtectedSpan[][] = (tree.children ?? []).map(() => []);
  const counter = { value: 0 };
  const fence = stringify?.fence ?? '`';
  (tree.children ?? []).forEach((child, index) => {
    collectSpans(child, spans, blockSpans, index, counter, fence);
  });
  const text = serializeTree(tree, stringify);
  return { text, spans };
}

/**
 * Strict restore: every span token must appear exactly once in `text`.
 * Any leftover reserved token pattern after restoration is an error.
 */
export function restoreMarkdown(text: string, spans: ProtectedSpan[]): string {
  let restored = text;
  for (const span of spans) {
    const occurrences = countOccurrences(restored, span.token);
    if (occurrences !== 1) {
      throw new Error(
        `restore failed: token ${span.token} (${span.kind}) appears ${occurrences} times, expected exactly 1`,
      );
    }
    restored = restored.split(span.token).join(span.value);
  }
  const leftover = restored.match(TOKEN_PATTERN);
  if (leftover) {
    throw new Error(`restore failed: unexpected leftover token "${leftover[0]}"`);
  }
  return restored;
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function serializeTree(tree: MdNode, stringify?: StringifySettings): string {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkStringify, {
      bullet: '-',
      fence: '`',
      emphasis: '*',
      strong: '*',
      ...stringify,
    })
    .stringify(tree as never)
    .trim();
}

function extractHeadingText(node: MdNode): string {
  let text = '';
  const walk = (child: MdNode): void => {
    if (child.type === 'text' && typeof child.value === 'string') text += child.value;
    if (child.type === 'inlineCode' && typeof child.value === 'string') text += child.value;
    for (const grand of child.children ?? []) walk(grand);
  };
  for (const child of node.children ?? []) walk(child);
  return text.trim();
}

function estimateTokens(markdown: string): number {
  return Math.ceil(markdown.length / 4);
}

function chunkId(headingPath: string[], index: number): string {
  const hash = createHash('sha1').update(`${headingPath.join('|')}#${index}`).digest('hex');
  return `chunk-${hash.slice(0, 8)}`;
}

/**
 * Split protected body Markdown into chunks at heading / top-level block
 * boundaries. Never cuts through a block: a single block larger than
 * `maxTokens` is kept whole and flagged `oversized`.
 */
export function chunkMarkdown(
  markdown: string,
  options: ChunkOptions = {},
  stringify?: StringifySettings,
): PlannedChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  assertNoReservedTokens(markdown);

  const tree = parseMarkdown(markdown);
  const roots = tree.children ?? [];
  const blockSpans: ProtectedSpan[][] = roots.map(() => []);
  const spans: ProtectedSpan[] = [];
  const counter = { value: 0 };
  const fence = stringify?.fence ?? '`';
  roots.forEach((child, index) => collectSpans(child, spans, blockSpans, index, counter, fence));

  const chunks: PlannedChunk[] = [];
  const headingStack: Array<{ depth: number; text: string }> = [];
  let current: PlannedChunk | null = null;
  let sectionIndex = 0;
  let oversizeBlocks = 0;

  const flush = (): void => {
    if (current && current.source.trim() !== '') {
      current.id = chunkId(current.headingPath, sectionIndex);
      current.source = current.source.trim();
      current.sha256 = createHash('sha256').update(current.source).digest('hex');
      current.tokens = estimateTokens(current.source);
      chunks.push(current);
      sectionIndex += 1;
    }
    current = null;
  };

  const closeIfOverCap = (extraTokens: number): void => {
    if (!current) return;
    if (current.tokens + extraTokens > maxTokens) flush();
  };

  roots.forEach((child, index) => {
    if (child.type === 'heading') {
      flush();
      const text = extractHeadingText(child);
      const depth = Math.min(6, Math.max(1, typeof child.depth === 'number' ? child.depth : 1));
      while (headingStack.length && headingStack[headingStack.length - 1].depth >= depth) {
        headingStack.pop();
      }
      if (text) headingStack.push({ depth, text });
    }

    const blockText = serializeTree({ type: 'root', children: [child] }, stringify);
    if (blockText.trim() === '') return;
    const blockTokens = estimateTokens(blockText);
    const blockOversize = blockTokens > maxTokens;

    if (!current || (blockOversize && current.source.trim() !== '')) flush();
    closeIfOverCap(blockTokens);

    if (!current) {
      current = {
        id: '',
        kind: 'body',
        headingPath: headingStack.map((heading) => heading.text),
        source: '',
        sha256: '',
        tokens: 0,
        spans: [],
        ...(blockOversize ? { oversized: true } : {}),
      };
    }

    current.source = `${current.source}\n\n${blockText}`.trim();
    current.tokens = estimateTokens(current.source);
    current.spans.push(...blockSpans[index]);
    if (blockOversize) oversizeBlocks += 1;
  });

  flush();
  if (chunks.length > maxChunks) {
    throw new Error(`markdown produced ${chunks.length} chunks, exceeding maxChunks=${maxChunks}`);
  }
  return chunks;
}

function buildTitleChunk(title: string): PlannedChunk {
  return {
    id: chunkId(['<title>'], 0),
    kind: 'title',
    headingPath: [],
    source: title.trim(),
    sha256: createHash('sha256').update(title.trim()).digest('hex'),
    tokens: estimateTokens(title),
    spans: [],
  };
}

/**
 * Plan the translation of one article.
 * - Passthrough modes (official-zh / native-zh) yield one unprotected body
 *   chunk: the content is already Chinese and must reach persistence unchanged.
 * - Translate mode protects structure, chunks by heading/block boundaries,
 *   and keeps title separate from body.
 */
export function createTranslationPlan(input: TranslationInput): TranslationPlan {
  const markdown = input.markdown.trim();
  if (!markdown) throw new Error('createTranslationPlan: markdown is empty');

  const threshold = input.cjkThreshold ?? DEFAULT_CJK_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`createTranslationPlan: cjkThreshold must be in (0, 1], got ${threshold}`);
  }

  const { mode, cjkRatio: ratio } = resolveTranslationMode(markdown, {
    officialZh: input.officialZh,
    cjkThreshold: threshold,
  });

  const sourceLanguage = input.sourceLanguage ?? 'en';
  const targetLanguage = input.targetLanguage ?? 'zh-CN';
  const title = input.title && input.title.trim() !== '' ? buildTitleChunk(input.title) : undefined;

  let chunks: PlannedChunk[];
  let oversizeBlocks = 0;
  if (mode === 'translate') {
    chunks = chunkMarkdown(markdown, input.chunk, input.stringify);
    oversizeBlocks = chunks.filter((chunk) => chunk.oversized).length;
  } else {
    chunks = [
      {
        id: chunkId([], 0),
        kind: 'body',
        headingPath: [],
        source: markdown,
        sha256: createHash('sha256').update(markdown).digest('hex'),
        tokens: estimateTokens(markdown),
        spans: [],
      },
    ];
  }

  return {
    ...(input.url ? { url: input.url } : {}),
    mode,
    sourceLanguage,
    targetLanguage,
    ...(title ? { title } : {}),
    chunks,
    stats: {
      chunks: chunks.length,
      oversizeBlocks,
      totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
      cjkRatio: ratio,
    },
  };
}
