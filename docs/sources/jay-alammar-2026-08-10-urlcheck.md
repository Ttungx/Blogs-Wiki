# jay-alammar URL 边界核验（2026-08-10）

## 索引 URL

- 博客入口：https://newsletter.languagemodels.co/（Substack）
- RSS：https://newsletter.languagemodels.co/feed（200，11 条目，机器可读日期）

## 文章路径形态

- `/p/<slug>`（如 `/p/the-illustrated-gpt-oss`），与 `article_paths: ["/p"]` 一致。

## 内容方向与混入判定

- 全部为 LLM 可视化教育 / 图解（NeurIPS 图解、DeepSeek-R1 图解、Transformer 课程等），主题纯净。
- 唯一杂质：`/p/coming-soon`（2023-03-12 首发占位公告）；`/p/were-writing-a-book-*`、`/p/our-book-*` 为书籍宣传但属 LLM 教育范畴，可收。
- 判定：**clean**。

## 建议

- `article_paths: ["/p"]` 保持；可选 `exclude_paths: ["/p/coming-soon"]`（占位页，收录价值低）。
- 可选补 `sitemap_url`（Substack 站点 sitemap 存在），非必须。

## 证据

- https://newsletter.languagemodels.co/feed（11 条目全量）
