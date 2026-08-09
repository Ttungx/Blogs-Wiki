import type { SourceConfig } from './types';

export interface SourceSelection {
  runnable: SourceConfig[];
  skipped: SourceConfig[];
}

/**
 * Scaffold sources participate in dry runs, but full updates must never call
 * translation or persist content for them.
 */
export function selectSourcesForRun(
  sources: SourceConfig[],
  dryRun: boolean,
): SourceSelection {
  if (dryRun) return { runnable: [...sources], skipped: [] };

  const runnable: SourceConfig[] = [];
  const skipped: SourceConfig[] = [];
  for (const source of sources) {
    // Full updates are deny-by-default. New sources must explicitly pass the
    // configuration validator and opt into translation + persistence.
    const active = source.update_mode === 'active';
    (active ? runnable : skipped).push(source);
  }
  return { runnable, skipped };
}
