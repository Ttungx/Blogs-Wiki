# eugene-yan URL 边界核验（2026-08-10）

## 索引 URL

- 文章索引：https://eugeneyan.com/writing/（列表含每篇日期、时长、标签）
- RSS：https://eugeneyan.com/rss/（200；`/rss.xml` 404，注册表"RSS"链接即 `/rss/`）
- Sitemap：https://eugeneyan.com/sitemap.xml

## 文章路径形态

- `/writing/<slug>/`（带尾斜杠）。sources.json `article_paths: ["/writing"]` 前缀可覆盖。
- feed 中链接带双斜杠（`https://eugeneyan.com//writing/<slug>/`），需 URL 规范化，不影响路径匹配。

## 内容方向与混入判定

- **RSS 混入 `/speaking/`**：feed 条目含演讲页（`/speaking/aie-2025/`、`/speaking/nvidia-gtc-2025/`），`article_paths` 过滤后剔除，无碍。
- **/writing/ 内混入非 AI 主题**：2025 Year in Review（life）、Advice for New Principal Tech ICs（leadership/career）、Exceptional Leadership（leadership）、写作 FAQ（writing）等与 LLM/Agent 方向无关。
- **noindex 站外跳转占位**：`/writing/secure-source-code/`（列表与 RSS 均在，正文 1 min 占位，跳 claude.com），需排除。
- 判定：**mixed**（方向为主流 Applied ML/LLM/Agent，但存在 life/leadership 类与跳转占位）。

## 建议

- `article_paths: ["/writing"]` 保持（已过滤 /speaking/）。
- `exclude_paths: ["/writing/secure-source-code"]`；更通用方案：抓取层识别 meta-refresh/canonical 站外跳转即跳过（与 chip-huyen 验证页同一前置能力）。
- 建议按标签过滤非 AI 内容（life / leadership / career / writing / misc / omscs / til），或依赖分类层降权。

## 证据

- https://eugeneyan.com/writing/（列表含 /writing/secure-source-code 等）
- https://eugeneyan.com/rss/（14 条目抽样，含 /speaking/ 两条）
- https://eugeneyan.com/sitemap.xml
