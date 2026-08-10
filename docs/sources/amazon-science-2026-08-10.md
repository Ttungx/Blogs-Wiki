# Amazon Science 来源审计报告（2026-08-10）

- 来源 ID：`amazon-science`
- 审计方式：`npm run audit:source -- --source amazon-science --samples 3`（真实网络，代理 127.0.0.1:7897）
- 登记表状态：正在适配 / `dry-run-only`
- **状态：受阻**（审计 FAIL：1/3 样本抓取超时）

## 证据

### 发现入口
- RSS / Sitemap：均未配置（0）。
- RSS 探测：`/blog/rss.xml`、`/rss`、`/blog/feed`、`/feed` 全部 404 → 无公开 RSS。
- 列表页：ok，raw=68 / candidates=13，2568ms；仅覆盖列表首页约 13 篇，登记表已知限制。

### 三篇样本
| 标题 | 日期 | 语言 | markdown 长度 | images | 结果 |
| --- | --- | --- | --- | --- | --- |
| How controllers from industrial machinery can coordinate multitask machine learning | 2026-07-30 | en | 13138 | 0 | PASS |
| A new benchmark for evaluating patient-facing health AI agents | 2026-07-29 | en | 9032 | 0 | PASS |
| Amazon and University of Michigan give robots a sense of touch | — | — | — | — | FAIL：抓取超时（The operation was aborted due to timeout） |

通过样本的标题、日期、语言、正文长度正常；1 篇超时失败。

### 图片
- 通过样本抽取结果 `images=0`，但原文 HTML 实测含 63 个 `<img>`、4 个 `<figure>` 且有 `og:image` → **Readability 抽取丢失正文图片**（登记表未记录，本次新发现）。
- 原文 img src 均为绝对原链（`cdn.amazon.science/...`），无 `data-src` 懒加载 → 原链本身无问题。

### 官方中文
- 文章页 hreflang 仅 `en` 与 `x-default` → 无官方中文版本，需模型翻译。

### RSS 存活
- 不适用（无 RSS）。

## 建议的 sources.json 配置修正
- 保持 `dry-run-only`，现有配置无需改动。
- 若要扩覆盖：确认列表分页（如 `?page=2`）或补可用 `sitemap_url`；当前无 RSS 可配置。
- 建议为抓取增加按源超时放宽/重试，缓解样本超时。

## 可否转 active
**否**。阻塞项：
1. 样本抓取超时（1/3），需重试/超时策略。
2. 正文图片抽取丢失（Readability）。
3. 仅 13 篇候选且无分页证据，覆盖不足。
4. 无官方中文，翻译依赖三 Secrets。
