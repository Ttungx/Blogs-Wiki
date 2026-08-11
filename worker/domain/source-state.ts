import type { SourceItemStatus } from './types';

const ALLOWED_TRANSITIONS: Record<SourceItemStatus, readonly SourceItemStatus[]> = {
  discovered: ['discovered', 'fetching', 'skipped', 'failed'],
  fetching: ['fetching', 'fetched', 'failed'],
  fetched: ['fetched', 'translating', 'skipped', 'failed'],
  translating: ['translating', 'published', 'failed'],
  published: ['published'],
  skipped: ['skipped'],
  failed: ['failed', 'discovered', 'fetching'],
};

export function canTransitionSourceItem(
  from: SourceItemStatus,
  to: SourceItemStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertSourceItemTransition(
  from: SourceItemStatus,
  to: SourceItemStatus,
): void {
  if (!canTransitionSourceItem(from, to)) {
    throw new Error(`invalid source item transition: ${from} -> ${to}`);
  }
}
