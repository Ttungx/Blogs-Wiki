# 来源核验报告：mistral-ai（2026-08-10）

状态：通过（1 项非阻塞：标题带站点后缀）

## 命令与入口

`npm run audit:source -- --source mistral-ai --samples 3`

- rss: ok，79 candidates（存活）
- sitemap: 未配置
- listing: ok，112 raw → 79 candidates

## 三篇样本

| URL | 标题 | 日期 | 语言 | markdown | 图片 |
|---|---|---|---|---|---|
| /news/shieldstral | Introducing Shieldstral. \| Mistral AI | 2026-08-04 | en | 7027 | 0 |
| /news/manage-prompts-and-skills-in-studio | Version control for prompts & skills in Studio \| Mistral | 2026-07-09 | en | 6641 | 2 |
| /news/robostral-navigate | Robostral Navigate: single-camera AI navigation \| Mistral AI | 2026-07-08 | en | 7128 | 4 |

全部 PASS。

## 逐项核验

- 官方中文 alternate：无 `hreflang="zh*"`。
- 图片原链：图片为相对 Astro 路径（`/_astro/...`），管线 absolutize 为 mistral.ai 原链，保留不下载。
- 日期：页面无 meta 日期，audit 日期来自 RSS pubDate，完整。
- RSS 存活：是；本地访问依赖代理（登记表已记录）。

## 建议的 sources.json 配置修正

- 标题质量：og:title 带 `| Mistral AI` / `| Mistral` 站点后缀，建议标题清理逻辑剥离（非阻塞，可入通用标题规范化）。
- 无需其他字段变更。

## 可否转 active

可以。发现/日期/图片/正文均通过；标题后缀为可选优化项。
