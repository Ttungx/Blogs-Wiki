/**
 * Pure content-integrity helpers for the update pipeline.
 * Math is archival structure: source TeX must equal translated TeX.
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
