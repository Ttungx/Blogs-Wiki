# Qwen 来源 URL 边界核验（2026-08-10）

## 结论

/blog/ 下约 45 篇文章全部为官方模型/技术文（`/blog/<slug>/` 单段形态），无社区混排；官方中文覆盖近乎完整（47 篇有 `/zh/blog/<slug>/` alternate，仅个别最新篇缺）。注意：qwenlm.github.io 为归档站（sitemap lastmod 止于 2025-09-23），现役博客在 qwen.ai。

## 证据

- `/en/sitemap.xml`：53 条 URL；45 条 blog 文章（qwen/qwen1.5/qwen2/qwen2.5*/qwen3/qwen3-coder/qwen3guard/qwq-32b/qwen-moe/qwen-vl*/qwen-image*/qwen-agent 等），8 条非文章（/、/about/、/categories/、/publication/、/resources/、/search/、/tags/、/tags/usage/）。
- alternate 共 95 个：en 48 + zh 47 → 47 篇文章存在官方中文版 `/zh/blog/<slug>/`，中文覆盖近满。
- 文章 URL 全部位于根路径（sitemap 名带 /en 前缀但 loc 无 /en），article_paths `["/blog"]` 可直接命中。

## 建议的 sources.json 配置

- 保持 sitemap_url / article_paths `["/blog"]` / dry-run-only。
- 建议加 `prefer_official_zh: true`（与 openai 同机制，直通 /zh/blog/ 官方中文）。
- 中期待办：迁移到现役源 qwen.ai（本仓现指向归档站，增量将长期为零）。

## mixedIssues

- 站点已冻结（lastmod 2025-09），增量更新无新内容，需确认是否值得保留或迁移。
