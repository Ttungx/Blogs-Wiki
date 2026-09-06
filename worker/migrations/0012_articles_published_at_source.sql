-- 0012：articles.published_at_source —— 发表日期口径（2026-09-05 日期兜底政策配套）。
--
-- NULL / 'published' = published_at 为真实发表日期（存量行全部如此）；
-- 'ingested' = 页面与发现层均无日期，published_at 实为系统收录日。
-- SSR 展示层据此把无日期文章显示为"无"，不再假装是发表日（翻译日期展示不受影响）。
ALTER TABLE articles ADD COLUMN published_at_source TEXT;
