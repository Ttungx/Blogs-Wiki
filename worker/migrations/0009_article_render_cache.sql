-- 渲染缓存：文章 HTML 首次渲染后写回，后续请求直接取（免费版 Worker 10ms CPU
-- 的 Shiki 高亮是 1102 根因，见 2026-08-30 事故）。键 = (article_id, language)，
-- 失效 = rendered_hash 与内容哈希不一致（内容更新或渲染器版本变更自动重渲染）。
ALTER TABLE article_versions ADD COLUMN rendered_html TEXT;
ALTER TABLE article_versions ADD COLUMN rendered_hash TEXT;
