# Cursor 来源 URL 边界核验（2026-08-10）

## 结论

干净可用：sitemap.xml 存在（158 条总 URL，98 条 /blog/* 全为英文单段 slug），无 RSS（/blog/rss.xml 与 /blog/feed.xml 均 404）。列表页 17 条展示，无 /cn /ja /zh-Hant /ko 本地化混入。次要问题：客户案例/营销文（salesforce/paypal/notion/planetscale 等）与工程技术文混排在 /blog/ 下。

## 证据

- sitemap.xml（26KB，158 条 loc）：/blog 1 条 + /blog/<slug> 97 条，全部单段英文 slug，无本地化前缀。
- RSS 探测：https://cursor.com/blog/rss.xml → 404；https://cursor.com/blog/feed.xml → 404。
- 列表页 /blog（HTML 445KB）：链接全部为 /blog/<slug>/，未见本地化路径；重复计数仅来自页面多处引用（title/card/canonical）。
- 混排样本：工程技术（agent-swarm-model-economics、real-time-rl-for-composer、scaling-agents、how-cursor-router-works、reward-hacking-coding-benchmarks、mixture-of-kittens）vs 客户故事/营销（salesforce、paypal、notion、planetscale、ios-mobile-app）。

## 建议的 sources.json 配置

- 新增 `sitemap_url: https://cursor.com/sitemap.xml`（覆盖 98 篇，远超列表页 17 条）。
- 保持 article_paths `["/blog"]`、exclude_paths `["/blog/topic"]`，不设 use_rss（无 RSS）。

## mixedIssues

- 客户案例/产品营销文与工程技术文同栏，无路径可切分，需内容级过滤（数量少，影响有限）。
