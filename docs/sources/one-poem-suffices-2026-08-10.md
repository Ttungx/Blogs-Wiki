# One Poem Suffices 核验报告

核验日期：2026-08-10。状态：**受阻**（已知阻碍：无机器可读日期，与 2026-08-09 记录一致）。

## 证据

- `npm run audit:source -- --source one-poem-suffices --samples 3`：rss 未配置（站点无 RSS，见 08-09 适配记录）、sitemap ok（27 raw / 22 候选）、listing ok（22 候选），合并 22。
- 3/3 样本均 `missing-published-date`：
  - `prompt-caching`（zh，markdown 11341，图片 6）
  - `model-context-protocol`（zh，markdown 45013，图片 13）
  - `multi-agent-system`（zh，markdown 15116，图片 9）
- 语言为中文原文（lang=zh），符合「官方中文优先、不重复翻译」；en 版未进 sitemap。
- 图片抽查：`./assets/*.webp|png` 相对路径，同站原链。需在持久化前确认相对路径被解析为绝对 URL（站点为 `/One-Poem-Suffices/` 子路径部署，解析基准要正确）。

## 建议的 sources.json 配置修正

- 配置本身无需改；阻碍在日期来源：sitemap 无 `lastmod`、文章页无日期 meta/JSON-LD。需确认日期来源（Git 提交历史或正文日期解析）后，在管线层为无日期文章补充日期，否则无法生成文章。

## 可否转 active

暂不可。无日期是硬阻碍（管线要求发布日）；日期来源方案落地后方可转 active。
