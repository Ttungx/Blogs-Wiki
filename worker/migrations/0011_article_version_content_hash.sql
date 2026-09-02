-- 内容指纹（D1 写入预算，docs/d1-write-budget.md 阶段 B）：sync 端对每个语言版本
-- 独立计算 SHA-256 并持久化，幂等判定直接比较指纹——内容未变时整篇跳过、
-- 零写入。与 rendered_html/rendered_hash（SSR 渲染缓存，0009）语义分离，
-- 两者互不读写。
ALTER TABLE article_versions ADD COLUMN content_hash TEXT;
-- 既有行首次同步（或全量重放）时由服务端重算回填；无索引亦无需索引：
-- 幂等判定按文章点查（source_id, original_url 已有索引），不走 hash 查找。
