# chip-huyen URL 边界检查（2026-08-10）

抓取入口：`https://huyenchip.com/feed.xml`（RSS，仅 40 条近文）+ `https://huyenchip.com/sitemap.xml`（64 条全量）。

## URL 形态

- 文章为**日期路径** `https://huyenchip.com/YYYY/MM/DD/<slug>.html`（2017-07-28 起至今，共 40 条）。
- RSS 链接带双斜杠 `https://huyenchip.com//2025/01/16/ai-engineering-pitfalls.html`，需归一化去重。
- sitemap 噪声：Google 验证占位 `google40674044319d01f1.html`、`/assets/genai.pdf`、`/mlops/`（重复 2 条）、`/stories/*`（虚构文学，非技术）、`/llama-devs.html`、`/llama-police.html`（无日期非文章）、`/about/`、`/archive/`、`/blog/`、`/books/`、`/communication/`、`/creators/`、`/dotagents/`、`/entanglements/`、`/events/`、`/list-100/`、`/research/`、`/start/`、首页。

## 判定：clean（日期路径形态可精确隔离）

文章全部技术（ML/LLM 工程、RLHF、agent、MLOps）；sitemap 非文章项全部落在日期路径之外，可用正则一刀切。无本地化重复。

## 建议

- `article_paths`: `["^/\\d{4}/\\d{2}/\\d{2}/.+\\.html$"]`
- `exclude_paths`（防御性）：`["^/stories", "^/assets/", "google40674044319d01f1\\.html$", "^/mlops/?$", "^/llama-", "^/about/?$", "^/archive/?$", "^/blog/?$", "^/books/?$", "^/communication/?$", "^/creators/?$", "^/dotagents/?$", "^/entanglements/?$", "^/events/?$", "^/list-100/?$", "^/research/?$", "^/start/?$", "^/$"]`
- RSS 链接双斜杠归一化（`//` → `/`）后与 sitemap 去重。

## 证据

- 日期路径：`https://huyenchip.com/2025/01/07/agents.html`、`https://huyenchip.com/2023/05/02/rlhf.html`
- 非文章：`https://huyenchip.com/google40674044319d01f1.html`、`https://huyenchip.com/stories/anything-i-want.html`、`https://huyenchip.com/assets/genai.pdf`、`https://huyenchip.com/mlops/`（重复）
