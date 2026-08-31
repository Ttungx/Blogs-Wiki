-- 入库但不上线（用户决策 2026-08-31）：质量门禁未通过的文章照常保存，但
-- published=0 不进 SSR（列表/详情均过滤）；quality_score/quality_model 供未来复审与模型升级后重评。
ALTER TABLE articles ADD COLUMN published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE articles ADD COLUMN quality_score REAL;
ALTER TABLE articles ADD COLUMN quality_model TEXT;
