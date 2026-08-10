# Google Research 来源审计报告（2026-08-10）

- 来源 ID：`google-research`
- 审计方式：`npm run audit:source -- --source google-research --samples 3`（真实网络，代理 127.0.0.1:7897）
- 登记表状态：正在适配 / `dry-run-only`
- **状态：通过**（dry-run 审计 PASS；不转 active）

## 证据

### 发现入口
- RSS：ok，raw=100 / candidates=100，899ms；RSS 存活。
- Sitemap：未配置（0）。
- 列表页：ok，raw=94 / candidates=68，695ms。
- 合并候选：156。

### 三篇样本（全部 PASS）
| 标题 | 日期 | 语言 | markdown 长度 | images |
| --- | --- | --- | --- | --- |
| Science One Framework: A verifiable autonomous research framework via Chain-of-Evidence | 2026-07-30 | en | 9717 | 0 |
| SymptomAI: Towards a conversational AI agent for everyday symptom assessment | 2026-07-22 | en | 11882 | 0 |
| Towards a quantum computer that learns from its errors | 2026-07-22 | en | 8269 | 0 |

标题、日期、语言、正文长度均正常。

### 图片
- 三篇样本抽取结果均为 `images=0`，但原文 HTML 实测含 65 个 `<img>` 且有 `og:image` → **Readability 抽取丢失正文图片**，登记表已知问题已复现。
- 原文 img src 均为绝对原链（`storage.googleapis.com/...`），无 `data-src` 懒加载 → 原链本身无问题，丢失发生在抽取层。

### 官方中文
- 文章页无任何 `hreflang` alternate → 无官方中文版本，需模型翻译。

### 其他
- 文章 URL 301 重定向到带尾斜杠地址（curl 需 `-L`），管线审计通过，未受影响。
- RSS 存活：是。

## 建议的 sources.json 配置修正
- 现有配置正确（`rss_url=https://research.google/blog/rss/`、`blog_url=https://research.google/blog/`、`article_paths=["/blog"]`），无需修改。
- 可选：补充 `sitemap_url`（本次未验证）。

## 可否转 active
**否**。阻塞项：
1. 正文图片抽取丢失（Readability），不满足"图片保留原链"要求。
2. 无官方中文，翻译依赖三 Secrets，且当前 V1 管线翻译与分类未解耦。
