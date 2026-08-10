# andrej-karpathy URL 边界核验（2026-08-10）

## 索引 URL

- 博客入口：https://karpathy.github.io/
- RSS：https://karpathy.github.io/feed.xml（200，10 条目）

## 文章路径形态

- **实际为 Jekyll 日期路径 `/YYYY/MM/DD/<slug>/`**（如 `/2026/02/12/microgpt/`），注册表"URL /<slug>"表述不准确。
- feed 链接为 `http://` 明文（非 https），需规范化。
- sources.json 当前 `article_paths: null`：RSS 驱动下可接受，但如需路径白名单应写日期前缀形态，不能用简单 `/<slug>`。

## 内容方向与混入判定

- LLM 教育 / 个人思考为主（microgpt、recipe、Pong from Pixels、A Survival Guide to a PhD 属 AI 教育）。
- **无关混入**：`biohacking-lite`（生物黑客）、`blockchain`（Bitcoin 教程）、`medium`（迁移公告占位）、短篇科幻 `forward-pass` / `ai`（AI 题材虚构，是否收录看产品定位）。
- 判定：**mixed**（主流 AI 教育 + 少量生活/科普/公告）。

## 建议

- `exclude_paths`（日期前缀精确排除）：`/2020/06/11/biohacking-lite`、`/2021/06/21/blockchain`、`/2018/01/20/medium`；虚构短篇 `/2021/03/27/forward-pass`、`/2015/11/14/ai` 可选排除。
- `rss_url` 保持；可选补 `sitemap_url: https://karpathy.github.io/sitemap.xml`。
- feed 链接 http→https 规范化。

## 证据

- https://karpathy.github.io/feed.xml（10 条目全量，2015-11 至 2026-02）
