-- Drop FK constraint on source_runs.source_id.
-- source_runs is an operational log; a run can cover multiple sources
-- (sourceId='all') and should survive source removal. The 'sources' table
-- is display config, not a constraint on historical run records.
-- source_items.source_id FK is retained (each item always belongs to one source).

DROP TABLE IF EXISTS source_runs;

CREATE TABLE IF NOT EXISTS source_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  discovered  INTEGER NOT NULL DEFAULT 0,
  pending     INTEGER NOT NULL DEFAULT 0,
  processed   INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  errors      TEXT,
  trigger     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_runs_status ON source_runs (status);
