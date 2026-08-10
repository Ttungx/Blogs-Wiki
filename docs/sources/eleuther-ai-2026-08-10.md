# 来源核验报告：eleuther-ai（2026-08-10）

状态：通过（1 项依赖提示：超长文翻译需分块）

## 命令与入口

`npm run audit:source -- --source eleuther-ai --samples 3`

- rss: ok，51 candidates（存活）
- sitemap: ok，62 raw → 51 candidates
- listing: ok，51 candidates

## 三篇样本

| URL | 标题 | 日期 | 语言 | markdown | 图片 |
|---|---|---|---|---|---|
| /dynamical-models-of-ai-governability | A Dynamical Model of AI Governability | 2026-07-13 | en | 128691 | 9 |
| /reward-hacking-indicators | Early Indicators of Reward Hacking via Reasoning Interpolation | 2026-04-15 | en | 37008 | 2 |
| /reward_hacking | Reward Hacking Resarch Update（站点原标题即拼写错误） | 2025-10-07 | en | 7062 | 3 |

全部 PASS。

## 逐项核验

- 官方中文 alternate：无 `hreflang="zh*"`，符合登记表"无已知官方中文"。
- 图片原链：相对路径（`/images/blog/...`），管线 absolutize 为 blog.eleuther.ai 原链，保留不下载。
- 日期：Hugo 站点，页面含 `datePublished` / `published_time`，与 RSS 双重来源，完整。
- RSS 存活：是。

## 建议的 sources.json 配置修正

- 保持现有配置，无需新增字段。
- 注意：首篇 markdown 达 128,691 字符，转 active 前翻译分块与恢复机制需就绪（登记表已列为依赖）。

## 可否转 active

可以。发现（RSS+Sitemap+listing 三入口全命中）、日期、图片、正文均通过；受"翻译分块/恢复"能力依赖约束。
