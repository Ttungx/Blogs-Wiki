/**
 * Pure content-integrity helpers for the update pipeline.
 * Math is archival structure: source TeX must equal translated TeX.
 * Links/images are archival structure too: the translated URL set must equal
 * the source URL set (canonicalized), otherwise the model silently dropped,
 * rewrote, or polluted a link (e.g. closing with a fullwidth ）which swallows
 * following Chinese text into the href).
 */

import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export type MathNodeKind = 'math' | 'inlineMath';

export interface MathInventoryEntry {
  kind: MathNodeKind;
  value: string;
  hash: string;
}

interface MdNode {
  type: string;
  value?: unknown;
  url?: unknown;
  children?: MdNode[];
}

function walkMath(node: MdNode, out: MathInventoryEntry[]): void {
  if (node.type === 'math' || node.type === 'inlineMath') {
    const value = typeof node.value === 'string' ? node.value : '';
    out.push({
      kind: node.type,
      value,
      hash: createHash('sha256').update(value).digest('hex'),
    });
  }
  for (const child of node.children ?? []) walkMath(child, out);
}

/** Collect display/inline math nodes in document order with SHA-256 of raw TeX. */
export function collectMathInventory(markdown: string): MathInventoryEntry[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(markdown) as unknown as MdNode;
  const entries: MathInventoryEntry[] = [];
  walkMath(tree, entries);
  return entries;
}

/**
 * Fail loudly when translated Markdown loses, reorders, or rewrites TeX.
 * Empty math on both sides is a no-op success.
 */
export function assertMathIntegrity(sourceMarkdown: string, translatedMarkdown: string): void {
  const source = collectMathInventory(sourceMarkdown);
  const translated = collectMathInventory(translatedMarkdown);
  if (source.length === 0 && translated.length === 0) return;

  if (source.length !== translated.length) {
    throw new Error(
      `math integrity failed: source has ${source.length} math node(s), translated has ${translated.length}`,
    );
  }

  for (let i = 0; i < source.length; i += 1) {
    const expected = source[i];
    const actual = translated[i];
    if (expected.kind !== actual.kind || expected.hash !== actual.hash) {
      throw new Error(
        `math integrity failed at index ${i}: expected ${expected.kind} ` +
          `hash=${expected.hash.slice(0, 12)}…, got ${actual.kind} hash=${actual.hash.slice(0, 12)}…`,
      );
    }
  }
}

export interface LinkInventoryEntry {
  kind: 'link' | 'image' | 'definition';
  url: string;
}

function walkLinks(node: MdNode, out: LinkInventoryEntry[]): void {
  if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
    if (typeof node.url === 'string') out.push({ kind: node.type, url: node.url });
  }
  for (const child of node.children ?? []) walkLinks(child, out);
}

/** Collect link/image/definition destinations in document order (mdast-canonical). */
export function collectLinkInventory(markdown: string): LinkInventoryEntry[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(markdown) as unknown as MdNode;
  const entries: LinkInventoryEntry[] = [];
  walkLinks(tree, entries);
  return entries;
}

/**
 * Canonical form for source-vs-translation URL comparison.
 * Deliberately narrow: only the http→https scheme upgrade is forgiven
 * (models routinely normalize it and the target stays equivalent).
 * Everything else — dropped tracking params, rewritten paths, unescaped or
 * polluted destinations — must fail loudly.
 */
export function canonicalLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed;
}

/** CJK / fullwidth / whitespace inside a link destination = polluted href. */
export function isPollutedLinkUrl(url: string): boolean {
  return /[\s\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(url);
}

function walkInlineCode(node: MdNode, out: string[]): void {
  if (node.type === 'inlineCode' && typeof node.value === 'string') out.push(node.value);
  for (const child of node.children ?? []) walkInlineCode(child, out);
}

/** Collect inline-code contents in document order (must survive translation verbatim). */
export function collectInlineCodeInventory(markdown: string): string[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(markdown) as unknown as MdNode;
  const entries: string[] = [];
  walkInlineCode(tree, entries);
  return entries;
}

/** Count fenced-code-block delimiter lines (``` / ~~~); translated count must equal source. */
export function countFenceLines(markdown: string): number {
  const matches = markdown.match(/^(?: *```| *~~~)/gm);
  return matches ? matches.length : 0;
}

function truncateUrl(url: string, maxLength = 120): string {
  return url.length > maxLength ? `${url.slice(0, maxLength)}…` : url;
}

/**
 * Fail loudly when translation drops, rewrites, or pollutes links/images, or
 * alters inline-code contents. Empty on both sides is a no-op success.
 *
 * Comparison is order-insensitive (multiset): Chinese word order legitimately
 * moves clauses — and their links — around. Drops, rewrites, and pollution
 * still fail loudly; only pure reordering passes.
 */
export function assertLinkIntegrity(sourceMarkdown: string, translatedMarkdown: string): void {
  const translatedLinks = collectLinkInventory(translatedMarkdown);
  for (let i = 0; i < translatedLinks.length; i += 1) {
    if (isPollutedLinkUrl(translatedLinks[i].url)) {
      throw new Error(
        `link integrity failed at translated index ${i} (${translatedLinks[i].kind}): ` +
          `polluted destination ${truncateUrl(translatedLinks[i].url)}`,
      );
    }
  }

  const source = collectLinkInventory(sourceMarkdown).map((entry) => canonicalLinkUrl(entry.url)).sort();
  const translated = translatedLinks.map((entry) => canonicalLinkUrl(entry.url)).sort();
  if (source.length !== translated.length) {
    throw new Error(
      `link integrity failed: source has ${source.length} link(s), translated has ${translated.length}`,
    );
  }
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== translated[i]) {
      throw new Error(
        `link integrity failed at sorted index ${i}: expected ${truncateUrl(source[i])}, ` +
          `got ${truncateUrl(translated[i])}`,
      );
    }
  }

  const sourceCode = collectInlineCodeInventory(sourceMarkdown).sort();
  const translatedCode = collectInlineCodeInventory(translatedMarkdown).sort();
  // 非对称：源行内代码必须逐字存活（防删/防改）；模型额外给裸标识符
  // （如 async）加 code 格式是无害美化，允许新增。
  const remaining = [...translatedCode];
  for (let i = 0; i < sourceCode.length; i += 1) {
    const at = remaining.indexOf(sourceCode[i]);
    if (at === -1) {
      throw new Error(
        `link integrity failed: inline-code span ${i} (${truncateUrl(sourceCode[i], 60)}) ` +
          `missing or altered in translation`,
      );
    }
    remaining.splice(at, 1);
  }

  const sourceFences = countFenceLines(sourceMarkdown);
  const translatedFences = countFenceLines(translatedMarkdown);
  if (sourceFences !== translatedFences) {
    throw new Error(
      `link integrity failed: source has ${sourceFences} fence line(s), ` +
        `translated has ${translatedFences} (unbalanced code fences swallow content)`,
    );
  }
}
