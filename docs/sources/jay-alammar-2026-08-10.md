# Jay Alammar（Language Models & Co.）核验报告

核验日期：2026-08-10。状态：**通过**（3/3 样本 PASS）。

## 证据

- `npm run audit:source -- --source jay-alammar --samples 3`：rss ok（11 候选）、sitemap 未配置、listing 0。
- PASS：`the-illustrated-neurips-2025-a-visual`（2025-11-03，en，markdown 20981，图片 20）、`the-illustrated-gpt-oss`（2025-08-19，en，markdown 12113，图片 10）、`how-transformer-llms-work-free-course`（2025-02-10，en，markdown 3021，图片 1）。
- 图片为 Substack CDN 远程链（与 sebastian-raschka 同构），保留原链。无官方中文版本（Substack，EN）。

## 建议的 sources.json 配置修正

- 现有配置（rss + `article_paths: ["/p"]`）无需修改。可选补 sitemap（Substack 站点 sitemap 存在），非必须。

## 可否转 active

可以。三篇样本标题/日期/语言/正文/图片全部达标，且与 LLM 可视化教育方向一致。
