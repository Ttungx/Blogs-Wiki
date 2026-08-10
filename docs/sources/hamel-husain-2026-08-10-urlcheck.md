# hamel-husain URL 边界核验（2026-08-10）

## 索引 URL

- 博客入口：https://hamel.dev/blog/
- RSS：https://hamel.dev/index.xml（唯一可用 feed；/feed.xml、/blog/feed.xml、/rss.xml、/atom.xml 全部 404）
- Sitemap：https://hamel.dev/sitemap.xml（200，含全部 /blog/posts/ 地址）

## 文章路径形态

- 实际文章：`/blog/posts/<slug>/`（sitemap 证据；如 `/blog/posts/evals-skills/`）。sources.json `article_paths: ["/blog"]` 前缀可覆盖。

## 内容方向与混入判定

- 主题纯净：Agent / Evals / AI 工程，无无关混入。
- **feed 缺陷**：14 条目中 5 条 `<link>` 错误指向 `https://hamel.dev/`（站点根）而非文章页（Do Automated Evals Work?、Stop Saying RAG Is Dead、Inspect AI、Thoughts On A Month With Devin、nbsanity）。`article_paths: ["/blog"]` 过滤后这些条目被丢弃（约 1/3 覆盖损失）。对应文章真实地址在 sitemap（如 `is-rag-dead` 位于 `/blog/posts/evals-faq/`）。
- **FAQ 碎片页**：sitemap 中 `/blog/posts/evals-faq/<question-slug>` 有约 20 个独立 URL，实为同一长文的 FAQ 分节；若走 sitemap 会被当作多篇文章收录。
- 判定：**clean（文章本体），feed 链接缺陷需兜底**。

## 建议

- `article_paths: ["/blog"]` 保持；补 `sitemap_url: https://hamel.dev/sitemap.xml` 作为冗余发现入口（sitemap 链接正确）。
- 若走 sitemap，需对 `evals-faq/` 子页面去重（按父 slug 归并）或排除子分节。
- `exclude_paths` 可留空。

## 证据

- https://hamel.dev/index.xml（14 条目抽样）
- https://hamel.dev/sitemap.xml（/blog/posts/ 全部地址）
- https://hamel.dev/blog/（列表页，无 feed 自动发现链接）
