# one-poem-suffices URL 边界核验（2026-08-10）

## 索引 URL

- 博客入口：https://keli-wen.github.io/One-Poem-Suffices/
- Sitemap：https://keli-wen.github.io/One-Poem-Suffices/sitemap.xml（27 URL，无 lastmod）
- 无 RSS。

## 文章路径形态

- 四栏目结构：`one-poem-suffices/`、`thinking-in-context/`、`zen-of-harness-engineering/`、`scaling-thoughts/`；文章为 `/<栏目>/<slug>/`（如 `/scaling-thoughts/renting-time/`）。
- sources.json `article_paths` 已按四栏目前缀配置，形态匹配。

## 内容方向与混入判定

- 全部为 LLM / Agent / Context Engineering / 个人成长思考，主题纯净。
- **杂质为结构性页面**：站点根、4 个栏目落地页（`one-poem-suffices/`、`thinking-in-context/`、`zen-of-harness-engineering/`、`scaling-thoughts/`）非文章；`/one-poem-suffices/one-poem-suffices/` 为独立页（疑似栏目说明/关于页）。
- `scaling-thoughts/2025-review` 为年度回顾，偏个人，可选排除。
- 判定：**clean（内容），需排除栏目落地页**。

## 建议

- `exclude_paths`：`/One-Poem-Suffices/`（站点根）、4 个栏目落地页、`/one-poem-suffices/one-poem-suffices`；或要求文章 URL 至少两级路径且非栏目名。
- 硬阻碍不变：无机器可读日期（sitemap 无 lastmod、文章页无日期 meta/JSON-LD），需可见文本日期解析或 Git 历史兜底。
- en 双语版未进 sitemap，无需去重。

## 证据

- https://keli-wen.github.io/One-Poem-Suffices/sitemap.xml（27 URL 全量）
