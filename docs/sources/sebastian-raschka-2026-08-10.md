# Ahead of AI（Sebastian Raschka）核验报告

核验日期：2026-08-10。状态：**通过**（3/3 样本 PASS）。

## 证据

- `npm run audit:source -- --source sebastian-raschka --samples 3`：rss ok（20 候选）、sitemap ok（76 raw / 74 候选）、listing 0（Substack 列表页无可提取入口，RSS+Sitemap 已覆盖）。
- PASS：`controlling-reasoning-effort-in-llms`（2026-07-18，en，markdown 58085，图片 31）、`supporting-ahead-of-ai`（2024-02-07，en，markdown 9643，图片 1）、`using-local-coding-agents`（2026-06-27，en，markdown 51353，图片 26）。
- 图片抽查：全部为 `substackcdn.com/image/fetch/...` 远程 CDN 链，内嵌原始 S3 媒体地址，保留原链、无本地下载。
- 无官方中文版本（Substack，EN 原文）。

## 建议的 sources.json 配置修正

- 现有配置（rss + sitemap + `article_paths: ["/p"]`）无需修改，可直接沿用。

## 可否转 active

可以。三篇样本标题/日期/语言/正文/图片均达标，更新频率适中。
