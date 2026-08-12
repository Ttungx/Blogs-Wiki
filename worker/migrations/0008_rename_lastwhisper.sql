-- Rename source id keli-wen → lastwhisper (blogs collection id 已同步改名).
-- Safe if old ID absent, new ID already exists, or old ID is missing.
-- Copy dependent rows before deleting old articles to preserve foreign keys.

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('lastwhisper', 'LastWhisper', 'personal', 'https://keli-wen.github.io/One-Poem-Suffices/', 'https://keli-wen.github.io/One-Poem-Suffices/', 'keli-wen.github.io', NULL, 'https://keli-wen.github.io/One-Poem-Suffices/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  homepage_url=excluded.homepage_url,
  blog_url=excluded.blog_url,
  domain=excluded.domain,
  rss_url=NULL,
  sitemap_url=excluded.sitemap_url,
  updated_at=datetime('now');

INSERT OR IGNORE INTO articles (
  id, source_id, original_url, original_language, published_at,
  image_url, author, source_domain, created_at, updated_at
)
SELECT
  'lastwhisper/' || substr(a.id, length('keli-wen/') + 1),
  'lastwhisper',
  a.original_url, a.original_language, a.published_at,
  a.image_url, a.author, a.source_domain, a.created_at, a.updated_at
FROM articles a
WHERE a.source_id = 'keli-wen' AND a.id LIKE 'keli-wen/%';

INSERT OR IGNORE INTO article_versions (
  article_id, language, title, content_markdown, excerpt, provenance,
  translation_model, original_alt_url, created_at, updated_at
)
SELECT
  'lastwhisper/' || substr(v.article_id, length('keli-wen/') + 1),
  v.language, v.title, v.content_markdown, v.excerpt, v.provenance,
  v.translation_model, v.original_alt_url, v.created_at, v.updated_at
FROM article_versions v
JOIN articles a ON a.id = v.article_id
WHERE a.source_id = 'keli-wen' AND v.article_id LIKE 'keli-wen/%';

INSERT OR IGNORE INTO article_categories (article_id, category_name)
SELECT
  'lastwhisper/' || substr(c.article_id, length('keli-wen/') + 1),
  c.category_name
FROM article_categories c
JOIN articles a ON a.id = c.article_id
WHERE a.source_id = 'keli-wen' AND c.article_id LIKE 'keli-wen/%';

INSERT INTO source_items (
  source_id, original_url, title, published_at, status, attempt_count,
  last_error, article_id, discovered_at, updated_at
)
SELECT
  'lastwhisper',
  i.original_url, i.title, i.published_at, i.status, i.attempt_count,
  i.last_error,
  CASE
    WHEN i.article_id LIKE 'keli-wen/%' THEN 'lastwhisper/' || substr(i.article_id, length('keli-wen/') + 1)
    ELSE i.article_id
  END,
  i.discovered_at, i.updated_at
FROM source_items i
WHERE i.source_id = 'keli-wen'
ON CONFLICT(source_id, original_url) DO UPDATE SET
  title=COALESCE(source_items.title, excluded.title),
  published_at=COALESCE(source_items.published_at, excluded.published_at),
  article_id=COALESCE(source_items.article_id, excluded.article_id),
  updated_at=MAX(source_items.updated_at, excluded.updated_at);

UPDATE source_runs
SET source_id='lastwhisper'
WHERE source_id='keli-wen';

DELETE FROM source_items WHERE source_id='keli-wen';
DELETE FROM articles WHERE source_id='keli-wen';
DELETE FROM sources WHERE id='keli-wen';
