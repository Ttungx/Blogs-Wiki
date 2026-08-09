// Category normalization and prompt helpers for the update pipeline.

const TRAILING_PUNCTUATION = /[.,;:!?，。；：！？、…]+$/;

function normalizeLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(TRAILING_PUNCTUATION, '')
    .toLowerCase();
}

/**
 * Normalize arbitrary model output into a valid category list.
 *
 * Accepts a string array, a single string, null, or any non-array value.
 * Normalizes case/whitespace/trailing punctuation on both sides, then
 * matches exactly against `allowed`. Non-matching values are dropped,
 * duplicates are removed, and the result follows `allowed` order.
 * Falls back to ['Other'] when the result is empty (or [] if `allowed`
 * does not contain 'Other').
 */
export function normalizeCategories(raw: unknown, allowed: readonly string[]): string[] {
  const items = Array.isArray(raw) ? raw : raw == null ? [] : [raw];

  const picked = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'string') continue;
    picked.add(normalizeLabel(item));
  }

  const result = allowed.filter((category) => picked.has(normalizeLabel(category)));

  if (result.length === 0) {
    const other = allowed.find((category) => normalizeLabel(category) === 'other');
    return other ? [other] : [];
  }

  return result;
}

/**
 * Generate the category-list section for the model prompt.
 * Lists every allowed option and states that choices are restricted
 * to this list and that multiple selection is allowed.
 */
export function categoryPrompt(allowed: readonly string[]): string {
  const list = allowed.map((category) => `- ${category}`).join('\n');
  return [
    '可选分类 / Allowed categories:',
    '只能从以下分类中选择，可多选 / Choose only from these categories; multiple selection is allowed:',
    list,
  ].join('\n');
}
