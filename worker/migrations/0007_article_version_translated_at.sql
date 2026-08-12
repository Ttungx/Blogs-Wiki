-- 首次生成模型译文的时间，与版本的最后写入时间分离。
-- translated_at 只用于 provenance='model' 的译文；官方/原生中文仍使用版本更新时间。

ALTER TABLE article_versions ADD COLUMN translated_at TEXT;

-- 既有数据没有保留翻译完成时刻。用已有版本最后写入时间回填，
-- 让历史记录至少不再错误复用原文发布日期。
UPDATE article_versions
SET translated_at = updated_at
WHERE provenance = 'model'
  AND translated_at IS NULL;
