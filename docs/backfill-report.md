# Backfill 原文回填报告（2026-08-12）

## 总览

依据 `BLOGS_WIKI_BACKFILL_SCOPE_HANDOFF.md` 对 25 个已适配源执行首轮原文批量回填。
只收原文（Defuddle 抓取 + 完整性门禁），未调用翻译模型。

| 源 | discovered | eligible | skipped_date | truncated_max | saved | failed | earliest | latest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| andrej-karpathy | 5 | 5 | 0 | 0 | 5 | 0 | 2016-05-31 | Wed, 07 Se |
| anthropic | 170 | 170 | 0 | 0 | 170 | 0 | 2022-05-21 | 2026-08-06 |
| cloudflare | 3577 | 3577 | 0 | 3497 | 80 | 0 | 2024-12-26 | 2026-08-11 |
| cursor | 91 | 91 | 0 | 0 | 91 | 0 | 2023-06-11 | 2026-06-03 |
| dan-koe | 20 | 20 | 0 | 0 | 20 | 0 | 2026-01-21 | 2026-08-08 |
| eleuther-ai | 49 | 49 | 0 | 0 | 49 | 0 | 2021-04-20 | 2026-07-13 |
| github-engineering | 7 | 7 | 0 | 0 | 7 | 0 | 2026-04-03 | 2026-08-10 |
| google-deepmind | 84 | 84 | 0 | 0 | 83 | 1 | 2025-06-13 | Tue, 18 No |
| google-research | 156 | 100 | 56 | 0 | 100 | 0 | 2025-09-18 | 2026-08-11 |
| google-security | 58 | 58 | 0 | 0 | 54 | 4 | 2025-01-16 | 2026-08-11 |
| hamel-husain | 13 | 13 | 0 | 0 | 13 | 0 | 2024-03-27 | 2026-06-29 |
| hugging-face | 731 | 731 | 0 | 481 | 250 | 0 | 2024-11-12 | 2026-08-10 |
| jay-alammar | 10 | 10 | 0 | 0 | 10 | 0 | 2023-03-26 | 2025-11-03 |
| langchain | 92 | 92 | 0 | 0 | 92 | 0 | 2023-10-16 | Wed, 22 Ju |
| lastwhisper | 22 | 22 | 0 | 0 | 22 | 0 | 2025-01-10 | 2026-07-10 |
| lilian-weng | 53 | 53 | 0 | 0 | 52 | 1 | 2017-06-21 | 2026-07-04 |
| meta-ai | 10 | 10 | 0 | 0 | 10 | 0 | 2026-03-10 | 2026-07-27 |
| meta-engineering | 1084 | 630 | 454 | 130 | 343 | 157 | 2020-01-13 | 2026-08-05 |
| microsoft-research | 13 | 13 | 0 | 0 | 12 | 1 | 2026-06-12 | 2026-08-11 |
| mistral-ai | 49 | 49 | 0 | 0 | 49 | 0 | 2023-09-27 | Wed, 08 Ju |
| moonshot | 9 | 9 | 0 | 0 | 9 | 0 | 2026-04-16 | 2026-08-06 |
| openai | 192 | 192 | 0 | 0 | 191 | 1 | 2016-06-20 | 2026-08-10 |
| qwen | 44 | 44 | 0 | 0 | 44 | 0 | 2022-11-14 | 2025-09-23 |
| sebastian-raschka | 20 | 20 | 0 | 0 | 20 | 0 | 2025-05-10 | 2026-07-18 |
| simon-willison | 16855 | 4971 | 11884 | 4271 | 700 | 0 | 2023-01-09 | 2026-08-11 |
| **总计** | | | | | **2476** | **165** | | |

## 执行中修复的提取/发现缺陷

1. worker/Defuddle 提取层相对图片 URL 未绝对化（qwen 等）——已修复。
2. Defuddle published 逗号拼接双时间戳（github.blog）——取第一段。
3. Next.js `_createdAt` 日期回退（anthropic research 无 meta 日期）。
4. URL 路径日期推断 `url_date_pattern`（simonwillison.net 等，sitemap 无日期）。
5. 抓取后二次日期校验：页面真实日期早于 policy.since 时跳过（meta-engineering 混入 2020 前旧文）。
6. Substack 直播/促销信号检测（dan-koe qualityFilter）。

## 已知限制与后续

- cloudflare sitemap lastmod 全部为 2026（重新生成日期），无法做日期过滤；本轮限量 80 篇最新，历史回填需专门发现机制。
- google-research / google-security RSS 只暴露近期文章（2025 起），2021-2024 段需扩展发现。
- microsoft-research listing 为客户端渲染（HTML 泄漏 `{postPermalink}` 模板锚点，已加通用 `isLikelyArticleUrl` 模板过滤）、服务器忽略 `?page=N` 分页参数（backfill 受限于单页 ~13 篇；增量走 RSS ~10 条/7周不漏）。
- meta-ai `.gz` sitemap 本网络全 UA 403（robots 声明该 URL 有效），管线无 gunzip 解压；增量靠 listing 兜底（~10 篇可抓取），历史回填需 GitHub Actions 出口实测或专门发现机制。
- hugging-face 源共 731 篇，保护阀截断至 250 篇，剩余 481 篇待后续批次。
- simon-willison 2023 至今共 4971 篇，截断至最新 700 篇。
- meta-engineering 保护阀 500，实际 343 篇通过二次日期校验。

## 错误台账

详细错误见 [backfill-errors.md](backfill-errors.md)。

