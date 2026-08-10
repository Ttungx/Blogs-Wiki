# eleuther-ai URL 边界检查（2026-08-10）

抓取入口：`https://blog.eleuther.ai/index.xml`（RSS）+ `https://blog.eleuther.ai/sitemap.xml`（60 条）。

## URL 形态

- 文章均为根路径 `https://blog.eleuther.ai/<slug>/`，一级 slug。
- sitemap 含聚合页 `https://blog.eleuther.ai/categories/`（及 `categories/<name>/`：announcement、release、meta、policy、contributor-spotlight、investigations、article）与首页 `https://blog.eleuther.ai/`；RSS 只含文章。

## 判定：clean（无营销/产品公告混入）

全部文章为技术研究（可解释性、SAE、RLHF、eval、架构、模型发布技术说明）。边界项仅 3 个元内容：`year-one`、`year-two-full`/`year-two-preface`（组织年度回顾，仍偏技术）、`nyt-yi-34b-response`（诉讼回应，政策/法律性质）；`contributor-spotlight-1` 为社区介绍（低技术密度）。无本地化重复。

## 建议

- 以 RSS 为唯一入口即可（干净）。
- 若走 sitemap：`article_paths`: `["^/[^/]+/?$"]`，`exclude_paths`: `["^/categories", "^/$"]`。
- 可选排除：`nyt-yi-34b-response`、`contributor-spotlight-1`。

## 证据

- sitemap 文章示例：`https://blog.eleuther.ai/dynamical-models-of-ai-governability/`、`https://blog.eleuther.ai/attention-probes/`
- 聚合页：`https://blog.eleuther.ai/categories/`（sitemap 内 8 个）
- 边界项：`https://blog.eleuther.ai/nyt-yi-34b-response/`、`https://blog.eleuther.ai/year-one/`、`https://blog.eleuther.ai/contributor-spotlight-1/`
