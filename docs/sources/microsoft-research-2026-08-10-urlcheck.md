# URL 边界核验：microsoft-research（2026-08-10）

## 入口与 URL 形态

- RSS：`https://www.microsoft.com/en-us/research/feed/` 可达但仅 10 条（截断，非全量；最新 10 篇）。
- 列表页：`/en-us/research/blog/` 服务端渲染，页内含约 13 个文章链接，URL 形态 `/en-us/research/blog/<kebab-slug>`；分页参数 `?research-area=all&page=N`（0–148 页）。注意 `page=2` 抓取返回与 page=1 相同字节数，疑似参数未生效或 JS 化，需管线实测分页。
- 结论：`article_paths=["/en-us/research/blog/"]`，`rss=.../research/feed/`（仅覆盖最新 10 条，增量覆盖率有限）。

## 内容判定：干净，全为研究/工程技术

可见条目（feed 10 条 + 列表页 13 slug）全为技术研究：Orchard agentic 框架、Echoverse 计算机用 agent、EvoLib、SymCrypt Rust 验证、Aurora 1.5 天气 FM、Flint 可视化语言、SkillOpt、Memora、脑科学 AI、Talos 罕见病基因分析、Data Formulator。未见公司公告/营销。

## 建议

```json
{"article_paths": ["/en-us/research/blog/"], "rss": "https://www.microsoft.com/en-us/research/feed/",
 "exclude_paths": [], "note": "feed 仅 10 条；若需全量增量，需验证列表页分页 ?page=N 是否可被管线抓取"}
```
