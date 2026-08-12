-- Rename canonical source IDs after the source metadata rename.
-- Safe if old IDs exist, new IDs already exist, or old IDs are absent.
-- Copy dependent rows before deleting old articles to preserve foreign keys.

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('moonshot', 'Moonshot', 'company', 'https://www.kimi.com/', 'https://www.kimi.com/blog/', 'kimi.com', NULL, 'https://www.kimi.com/sitemap/sitemap-ug-blog.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  homepage_url=excluded.homepage_url,
  blog_url=excluded.blog_url,
  domain=excluded.domain,
  rss_url=excluded.rss_url,
  sitemap_url=excluded.sitemap_url,
  updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('z-ai', 'z.ai', 'company', 'https://z.ai/', 'https://z.ai/blog', 'z.ai', NULL, NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  homepage_url=excluded.homepage_url,
  blog_url=excluded.blog_url,
  domain=excluded.domain,
  rss_url=NULL,
  sitemap_url=NULL,
  updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('keli-wen', 'keli-wen', 'personal', 'https://keli-wen.github.io/One-Poem-Suffices/', 'https://keli-wen.github.io/One-Poem-Suffices/', 'keli-wen.github.io', NULL, 'https://keli-wen.github.io/One-Poem-Suffices/sitemap.xml', NULL, NULL)
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
  CASE a.source_id
    WHEN 'kimi' THEN 'moonshot/' || substr(a.id, length('kimi/') + 1)
    WHEN 'glm' THEN 'z-ai/' || substr(a.id, length('glm/') + 1)
    WHEN 'one-poem-suffices' THEN 'keli-wen/' || substr(a.id, length('one-poem-suffices/') + 1)
  END,
  CASE a.source_id
    WHEN 'kimi' THEN 'moonshot'
    WHEN 'glm' THEN 'z-ai'
    WHEN 'one-poem-suffices' THEN 'keli-wen'
  END,
  a.original_url, a.original_language, a.published_at,
  a.image_url, a.author, a.source_domain, a.created_at, a.updated_at
FROM articles a
WHERE (a.source_id = 'kimi' AND a.id LIKE 'kimi/%')
   OR (a.source_id = 'glm' AND a.id LIKE 'glm/%')
   OR (a.source_id = 'one-poem-suffices' AND a.id LIKE 'one-poem-suffices/%');

INSERT OR IGNORE INTO article_versions (
  article_id, language, title, content_markdown, excerpt, provenance,
  translation_model, original_alt_url, created_at, updated_at
)
SELECT
  CASE a.source_id
    WHEN 'kimi' THEN 'moonshot/' || substr(v.article_id, length('kimi/') + 1)
    WHEN 'glm' THEN 'z-ai/' || substr(v.article_id, length('glm/') + 1)
    WHEN 'one-poem-suffices' THEN 'keli-wen/' || substr(v.article_id, length('one-poem-suffices/') + 1)
  END,
  v.language, v.title, v.content_markdown, v.excerpt, v.provenance,
  v.translation_model, v.original_alt_url, v.created_at, v.updated_at
FROM article_versions v
JOIN articles a ON a.id = v.article_id
WHERE (a.source_id = 'kimi' AND v.article_id LIKE 'kimi/%')
   OR (a.source_id = 'glm' AND v.article_id LIKE 'glm/%')
   OR (a.source_id = 'one-poem-suffices' AND v.article_id LIKE 'one-poem-suffices/%');

INSERT OR IGNORE INTO article_categories (article_id, category_name)
SELECT
  CASE a.source_id
    WHEN 'kimi' THEN 'moonshot/' || substr(c.article_id, length('kimi/') + 1)
    WHEN 'glm' THEN 'z-ai/' || substr(c.article_id, length('glm/') + 1)
    WHEN 'one-poem-suffices' THEN 'keli-wen/' || substr(c.article_id, length('one-poem-suffices/') + 1)
  END,
  c.category_name
FROM article_categories c
JOIN articles a ON a.id = c.article_id
WHERE (a.source_id = 'kimi' AND c.article_id LIKE 'kimi/%')
   OR (a.source_id = 'glm' AND c.article_id LIKE 'glm/%')
   OR (a.source_id = 'one-poem-suffices' AND c.article_id LIKE 'one-poem-suffices/%');

INSERT INTO source_items (
  source_id, original_url, title, published_at, status, attempt_count,
  last_error, article_id, discovered_at, updated_at
)
SELECT
  CASE i.source_id
    WHEN 'kimi' THEN 'moonshot'
    WHEN 'glm' THEN 'z-ai'
    WHEN 'one-poem-suffices' THEN 'keli-wen'
  END,
  i.original_url, i.title, i.published_at, i.status, i.attempt_count,
  i.last_error,
  CASE
    WHEN i.article_id LIKE 'kimi/%' THEN 'moonshot/' || substr(i.article_id, length('kimi/') + 1)
    WHEN i.article_id LIKE 'glm/%' THEN 'z-ai/' || substr(i.article_id, length('glm/') + 1)
    WHEN i.article_id LIKE 'one-poem-suffices/%' THEN 'keli-wen/' || substr(i.article_id, length('one-poem-suffices/') + 1)
    ELSE i.article_id
  END,
  i.discovered_at, i.updated_at
FROM source_items i
WHERE i.source_id IN ('kimi', 'glm', 'one-poem-suffices')
ON CONFLICT(source_id, original_url) DO UPDATE SET
  title=COALESCE(source_items.title, excluded.title),
  published_at=COALESCE(source_items.published_at, excluded.published_at),
  article_id=COALESCE(source_items.article_id, excluded.article_id),
  updated_at=MAX(source_items.updated_at, excluded.updated_at);

UPDATE source_runs
SET source_id=CASE source_id
  WHEN 'kimi' THEN 'moonshot'
  WHEN 'glm' THEN 'z-ai'
  WHEN 'one-poem-suffices' THEN 'keli-wen'
END
WHERE source_id IN ('kimi', 'glm', 'one-poem-suffices');

DELETE FROM source_items WHERE source_id IN ('kimi', 'glm', 'one-poem-suffices');
DELETE FROM articles WHERE source_id IN ('kimi', 'glm', 'one-poem-suffices');
DELETE FROM sources WHERE id IN ('kimi', 'glm', 'one-poem-suffices');
