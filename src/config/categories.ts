export const CATEGORIES = [
  'AI',
  'Agent',
  'AI Coding / Developer Tools',
  'Research',
  'Engineering / Infrastructure',
  'Internet / Technology',
  'Personal Growth',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_OPTIONS: ReadonlyArray<{
  value: Category;
  label: string;
}> = CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));
