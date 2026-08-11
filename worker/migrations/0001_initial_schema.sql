-- Blogs Wiki D1 initial schema (Phase 3)
-- All tables use upsert (idempotency principle, roadmap section 18).

CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'company' CHECK (type IN ('company', 'personal')),
  homepage_url TEXT NOT NULL,
  blog_url     TEXT NOT NULL,
  domain       TEXT NOT NULL,
  rss_url      TEXT,
  sitemap_url  TEXT,
  logo         TEXT,
  avatar       TEXT,
  config       TEXT DEFAULT '{}',
  display      TEXT DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  name       TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id                 TEXT PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES sources (id),
  original_url       TEXT NOT NULL,
  original_title     TEXT NOT NULL,
  translated_title   TEXT NOT NULL,
  published_at       TEXT NOT NULL,
  translated_at      TEXT NOT NULL,
  original_language  TEXT NOT NULL DEFAULT 'en',
  translation_model  TEXT NOT NULL,
  translation_status TEXT CHECK (translation_status IN ('official-zh', 'native-zh', 'model')),
  original_zh_url    TEXT,
  content_markdown   TEXT NOT NULL,
  excerpt            TEXT,
  image_url          TEXT,
  author             TEXT,
  source_domain      TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, original_url)
);

CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles (source_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_translated ON articles (translated_at DESC);

CREATE TABLE IF NOT EXISTS article_categories (
  article_id    TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  category_name TEXT NOT NULL REFERENCES categories (name),
  PRIMARY KEY (article_id, category_name)
);

CREATE TABLE IF NOT EXISTS source_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     TEXT NOT NULL REFERENCES sources (id),
  original_url  TEXT NOT NULL,
  title         TEXT,
  published_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered', 'fetching', 'fetched', 'translating', 'published', 'skipped', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  article_id    TEXT REFERENCES articles (id),
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, original_url)
);

CREATE INDEX IF NOT EXISTS idx_source_items_status  ON source_items (source_id, status);
CREATE INDEX IF NOT EXISTS idx_source_items_article ON source_items (article_id);

CREATE TABLE IF NOT EXISTS source_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL REFERENCES sources (id),
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
