# LangChain 来源审计（2026-08-10）

## 状态：通过

## 证据

- 发现入口：RSS `https://www.langchain.com/blog/rss.xml` ok（100 candidates，HTTP 200 存活）；Sitemap ok（576 raw / 494 candidates）；列表页 ok（40 raw / 17 candidates）；合并 494 candidates。
- 三篇样本全部 PASS：
  - `blog/managed-deep-agents-is-now-in-public-beta` — 2026-08-07，en，markdown 13477，images 2
  - `blog/introducing-managed-deep-agents` — 2026-05-13，en，markdown 7475，images 3
  - `blog/introducing-llm-gateway` — 2026-05-13，en，markdown 7850，images 5
- 官方中文：`/zh-cn/blog` 404，页面无中文（cn-chars=0），无 hreflang alternate → 无官方中文，走模型翻译。
- 图片：绝对原链（cdn.prod.website-files.com），保留原链无问题。
- RSS 存活：200；日期与文章一致（2026-08-07 为最新），未见明显 RSS/页面日期错位。

## 建议的 sources.json 配置修正

- `article_paths: ["/blog"]` 保持；可考虑加 `exclude_paths` 过滤 `/blog/topic`、`/blog/category` 类聚合页（本次未验证具体路径，建议激活前在 dry-run 里确认）。
- 其余字段（rss_url / sitemap_url / domain / update_mode）维持不变。

## 可否转 active

可以。无发现/抓取阻塞，RSS 存活、日期可用、图片原链、无官方中文走翻译。按推进顺序（LangChain 第一）可作为首个转 active 的来源。注意激活时仍需满足"至少抽取三篇检查标题/作者/日期/代码块/表格/图片"的完整适配门禁。
