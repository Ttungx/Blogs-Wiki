-- Seed sources table from src/data/sources.json (Phase 7).
-- Required for source_runs / source_items FK constraints.
-- Idempotent upsert: re-running updates name + updated_at only.

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('openai', 'OpenAI', 'company', 'https://openai.com/', 'https://openai.com/news/', 'openai.com', NULL, 'https://openai.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('anthropic', 'Anthropic', 'company', 'https://www.anthropic.com/', 'https://www.anthropic.com/research', 'anthropic.com', NULL, 'https://www.anthropic.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('cloudflare', 'Cloudflare Blog', 'company', 'https://www.cloudflare.com/', 'https://blog.cloudflare.com/', 'blog.cloudflare.com', 'https://blog.cloudflare.com/rss/', 'https://blog.cloudflare.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('simon-willison', 'Simon Willison''s Weblog', 'personal', 'https://simonwillison.net/', 'https://simonwillison.net/', 'simonwillison.net', 'https://simonwillison.net/atom/everything/', 'https://simonwillison.net/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('lilian-weng', 'Lil''Log', 'personal', 'https://lilianweng.github.io/', 'https://lilianweng.github.io/', 'lilianweng.github.io', 'https://lilianweng.github.io/index.xml', 'https://lilianweng.github.io/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('langchain', 'LangChain Blog', 'company', 'https://www.langchain.com/', 'https://www.langchain.com/blog', 'langchain.com', 'https://www.langchain.com/blog/rss.xml', 'https://www.langchain.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('cursor', 'Cursor Blog', 'company', 'https://cursor.com/', 'https://cursor.com/blog', 'cursor.com', NULL, 'https://cursor.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('hugging-face', 'Hugging Face Blog', 'company', 'https://huggingface.co/', 'https://huggingface.co/blog', 'huggingface.co', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co/sitemap-blog.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('qwen', 'Qwen Blog', 'company', 'https://qwenlm.github.io/', 'https://qwenlm.github.io/blog/', 'qwenlm.github.io', NULL, 'https://qwenlm.github.io/en/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('google-deepmind', 'Google DeepMind', 'company', 'https://deepmind.google/', 'https://deepmind.google/blog/', 'deepmind.google', 'https://deepmind.google/blog/rss.xml', 'https://deepmind.google/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('microsoft-research', 'Microsoft Research', 'company', 'https://www.microsoft.com/en-us/research/', 'https://www.microsoft.com/en-us/research/blog/', 'microsoft.com', 'https://www.microsoft.com/en-us/research/feed/', NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('google-research', 'Google Research', 'company', 'https://research.google/', 'https://research.google/blog/', 'research.google', 'https://research.google/blog/rss/', NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('meta-ai', 'Meta AI', 'company', 'https://ai.meta.com/', 'https://ai.meta.com/blog/', 'ai.meta.com', NULL, 'https://ai.meta.com/sitemap/ai_meta_com_sitemap.xml.gz', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('eleuther-ai', 'EleutherAI Blog', 'company', 'https://www.eleuther.ai/', 'https://blog.eleuther.ai/', 'blog.eleuther.ai', 'https://blog.eleuther.ai/index.xml', 'https://blog.eleuther.ai/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('mistral-ai', 'Mistral AI', 'company', 'https://mistral.ai/', 'https://mistral.ai/news/', 'mistral.ai', 'https://mistral.ai/news/rss', NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('amazon-science', 'Amazon Science', 'company', 'https://www.amazon.science/', 'https://www.amazon.science/blog', 'amazon.science', NULL, NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('chip-huyen', 'Chip Huyen', 'personal', 'https://huyenchip.com/', 'https://huyenchip.com/blog/', 'huyenchip.com', 'https://huyenchip.com/feed.xml', 'https://huyenchip.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('sebastian-raschka', 'Ahead of AI', 'personal', 'https://sebastianraschka.com/', 'https://magazine.sebastianraschka.com/', 'magazine.sebastianraschka.com', 'https://magazine.sebastianraschka.com/feed', 'https://magazine.sebastianraschka.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('hamel-husain', 'Hamel Husain', 'personal', 'https://hamel.dev/', 'https://hamel.dev/blog/', 'hamel.dev', 'https://hamel.dev/index.xml', 'https://hamel.dev/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('eugene-yan', 'Eugene Yan', 'personal', 'https://eugeneyan.com/', 'https://eugeneyan.com/writing/', 'eugeneyan.com', 'https://eugeneyan.com/rss/', 'https://eugeneyan.com/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('jay-alammar', 'Jay Alammar', 'personal', 'https://jalammar.github.io/', 'https://newsletter.languagemodels.co/', 'newsletter.languagemodels.co', 'https://newsletter.languagemodels.co/feed', NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('andrej-karpathy', 'Andrej Karpathy', 'personal', 'https://karpathy.ai/', 'https://karpathy.github.io/', 'karpathy.github.io', 'https://karpathy.github.io/feed.xml', NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');

INSERT INTO sources (id, name, type, homepage_url, blog_url, domain, rss_url, sitemap_url, logo, avatar)
VALUES ('one-poem-suffices', 'One Poem Suffices', 'personal', 'https://keli-wen.github.io/One-Poem-Suffices/', 'https://keli-wen.github.io/One-Poem-Suffices/', 'keli-wen.github.io', NULL, 'https://keli-wen.github.io/One-Poem-Suffices/sitemap.xml', NULL, NULL)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=datetime('now');
