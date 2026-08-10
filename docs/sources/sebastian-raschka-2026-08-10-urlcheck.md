# sebastian-raschka URL 边界核验（2026-08-10）

## 索引 URL

- 博客入口：https://magazine.sebastianraschka.com/（Substack）
- RSS：https://magazine.sebastianraschka.com/feed（200，lastBuildDate 2026-08-10，全文收录 content:encoded）
- Sitemap：https://magazine.sebastianraschka.com/sitemap.xml（既有，76 raw / 74 候选）

## 文章路径形态

- `/p/<slug>`（如 `/p/controlling-reasoning-effort-in-llms`），与 sources.json `article_paths: ["/p"]` 一致。

## 内容方向与混入判定

- 近 12 篇全部为 LLM 训练/微调/推理/研究主题（reasoning effort、local coding agents、LLM 架构、DeepSeek 技术拆解等），无生活/职业/营销混入。
- 判定：**clean**，无需 exclude。

## 建议

- `article_paths: ["/p"]` 保持；`exclude_paths` 可留空。
- 无机器可读日期问题（feed pubDate 正常）。

## 证据

- https://magazine.sebastianraschka.com/feed（12 条目抽样：2025-12 至 2026-07，全部 /p/ 路径）
- https://magazine.sebastianraschka.com/sitemap.xml
