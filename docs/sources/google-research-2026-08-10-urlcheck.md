# URL 边界核验：google-research（2026-08-10）

## 入口与 URL 形态

- RSS：`https://research.google/blog/rss/` 可达，100 条，全部 `/blog/<kebab-slug>/`，与列表页 `/blog/` 同构。
- 结论：`article_paths=["/blog/"]`，`rss=research.google/blog/rss/`。

## 内容判定：干净，全为研究/工程技术

100 条抽样全为研究文章（quantum error correction、diffusion、agentic RAG、LLM reasoning、foundation models、unlearning audit、S2Vec、flood forecasting 等）。仅 3 条会议/合作综述类边缘内容，仍属研究向：

- `a-new-era-of-innovation-google-research-at-io-2026`（I/O 研究回顾）
- `catalyzing-scientific-impact-through-global-partnerships-and-open-resources`（开放资源合作）
- `google-research-at-the-check-up`（健康研究会议回顾）

可保留；如需严格剔除会议回顾，可排除上述 3 条。

## 建议

```json
{"article_paths": ["/blog/"], "rss": "https://research.google/blog/rss/", "exclude_paths": []}
```
