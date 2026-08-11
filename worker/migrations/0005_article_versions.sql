-- Article multi-language refactor.
-- Split articles (identity + content conflated) into:
--   articles         — identity only (url, date, author, etc.)
--   article_versions — language-specific content (title, markdown, provenance)
--
-- This migration drops and recreates articles + article_categories.
-- The remote D1 has 0 articles (fresh), so no data loss.
-- Local D1 articles are gitignored pipeline products (regenerated on next run).

DROP TABLE IF EXISTS article_categories;
DROP TABLE IF EXISTS articles;

CREATE TABLE IF NOT EXISTS articles (
  id                TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL,
  original_url      TEXT NOT NULL,
  original_language TEXT NOT NULL DEFAULT 'en',
  published_at      TEXT NOT NULL,
  image_url         TEXT,
  author            TEXT,
  source_domain     TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, original_url)
);

CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles (source_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);

CREATE TABLE IF NOT EXISTS article_versions (
  article_id        TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  language          TEXT NOT NULL,
  title             TEXT NOT NULL,
  content_markdown  TEXT NOT NULL,
  excerpt           TEXT,
  provenance        TEXT NOT NULL CHECK (provenance IN ('original', 'official-zh', 'native-zh', 'model')),
  translation_model TEXT,
  original_alt_url  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (article_id, language)
);

CREATE INDEX IF NOT EXISTS idx_versions_article  ON article_versions (article_id);
CREATE INDEX IF NOT EXISTS idx_versions_language ON article_versions (language);

CREATE TABLE IF NOT EXISTS article_categories (
  article_id    TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  category_name TEXT NOT NULL REFERENCES categories (name),
  PRIMARY KEY (article_id, category_name)
);
