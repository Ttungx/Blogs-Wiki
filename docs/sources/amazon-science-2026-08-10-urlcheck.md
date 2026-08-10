# URL 边界核验：amazon-science（2026-08-10）

## 入口与 URL 形态

- 列表页 `https://www.amazon.science/blog`：curl 可达（200, 528KB），页内含 13 个文章链接，URL 形态 `/blog/<kebab-slug>`（绝对 URL）。无 ?page 分页参数，疑似 JS load-more / 无限滚动。
- RSS：无。
- Sitemap：`sitemap.xml` 为索引，含 108 个按月分片 + `sitemap-latest.xml`；但分片与 latest 均返回 HTTP 202 空体（WAF/限流），curl 拿不到内容。管线可用性未知。
- 结论：`article_paths=["/blog/"]`，无 rss；分页需管线实测 JS 加载或按月 sitemap（若 undici 可过 202）。

## 内容判定：以技术为主，少量公司/行业边缘内容

页面 13 条样本：agentic systems、ground truth、reasoning traces RL、perception agent 开源、健康 AI agent benchmark、FLAT 数据中心网络、Graviton5、EC2 形式化验证、工业控制器多任务学习等——均为工程技术。边缘条目（非 AI 研究但属工程）：

- `the-fuel-of-the-future-is-already-here-why-triso-matters`（核燃料行业科普，非 AI/工程研究，建议排除）
- `amazon-and-university-of-michigan-give-robots-a-sense-of-touch`（合作研究，保留）

## 建议

```json
{"article_paths": ["/blog/"], "rss": null,
 "exclude_paths": ["/blog/the-fuel-of-the-future-is-already-here-why-triso-matters/"],
 "note": "分页 JS load-more 或按月 sitemap（curl 202）需管线实测；全量覆盖依赖这两个入口之一"}
```
