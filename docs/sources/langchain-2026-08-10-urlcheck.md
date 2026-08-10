# langchain URL 边界检查（2026-08-10）

抓取入口：`https://www.langchain.com/blog/rss.xml`（RSS）+ `https://www.langchain.com/sitemap.xml`（根 sitemap）。

## URL 形态

- 文章为 `https://www.langchain.com/blog/<slug>`，一级 slug；根 sitemap 中 `/blog/` 前缀共 494 条，全部单段（Segments=1），**无 `/blog/topic`、无 `/blog/category`、无嵌套聚合页**；RSS 同样只含 `/blog/<slug>` 文章。答案：聚合页未混入候选。
- 风险在根 sitemap 本身：含大量非 `/blog/` 页面（`/resources/*`、`/customers/*`、`/langsmith/*`、`/templates/*`、`/breakoutagents/*`、`/events` 等），若不做路径过滤会误收。
- `/blog/` 前缀内的营销噪声：`/blog/customers-*`（客户案例，约 30+ 条）、`/blog/announcing-langsmith-is-now-a-transactable-offering...`（市场公告）、月度 newsletter（`*-2026-langchain-newsletter`）。

## 判定：clean（路径形态），内容含少量客户案例营销

技术内容为主（agent 工程、evals、RAG、observability、模型基准）；`/blog/customers-*` 与 newsletter 为营销/汇总，建议排除。

## 建议

- `article_paths`: `["^/blog/[^/]+$"]`（单段 slug，防根 sitemap 其他前缀与未来嵌套页）
- `exclude_paths`（新增）：`["^/blog/customers", "^/blog/.*newsletter", "^/blog/announcing-langsmith-is-now-a-transactable-offering"]`

## 证据

- 根 sitemap `/blog/` 分段统计：Segments=1 共 494 条（无多段）
- RSS 干净示例：`https://www.langchain.com/blog/how-we-build-an-autonomous-sre-agent-for-kubernetes-deployments`
- 营销示例：`https://www.langchain.com/blog/customers-klarna`、`https://www.langchain.com/blog/april-2026-langchain-newsletter`
