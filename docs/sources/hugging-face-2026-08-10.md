# Hugging Face 来源审计（2026-08-10）

## 状态：通过（量大门槛未过，维持 dry-run-only）

## 证据

- 发现入口：RSS `blog/feed.xml` ok（835 candidates，HTTP 200 存活）；Sitemap `sitemap-blog.xml` ok（835 candidates）；列表页 ok（64 raw / 37 candidates）；合并 858 candidates。
- 三篇样本全部 PASS：
  - `blog/allenai/tutormoments` — 2026-08-07，en，markdown 10645，images 3
  - `blog/baseten` — 2026-08-06，en，markdown 7724，images 12
  - `blog/LiquidAI/lfm2-5-2-6b` — 2026-08-04，en，markdown 9334，images 11
- 官方中文：`/blog/zh` 200 但仅为界面本地化索引（title=Hugging Face – 博客，447 中文字符 / 317KB，非文章译文）；文章本身无 hreflang。结论：无官方中文，走模型翻译。
- 图片：原链保留（含 org 子路径文章），无懒加载地址问题。
- 注意：候选包含大量 org 子路径（allenai/baseten/LiquidAI 等），合并 858 篇，单源量远超其他来源。

## 建议的 sources.json 配置修正

- 字段维持不变（rss_url / sitemap_url / article_paths `["/blog"]` / dry-run-only）。
- 激活前必需：按来源级 `--limit` 增量限制已就位（默认 3 篇/源）；建议加内容过滤（如排除纯营销/发布会类）或按 org 白名单收敛，避免 858 候选拖慢更新与翻译成本。

## 可否转 active

暂不可。抓取链路健康，但候选量 858 且来源杂乱，需先核增量限制与内容过滤门槛（路书共性待办），并确认 org 子路径文章不会被重复收录。
