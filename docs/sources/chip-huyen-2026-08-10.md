# Chip Huyen 核验报告

核验日期：2026-08-10。状态：**受阻**（1/3 样本失败，非内容问题）。

## 证据

- `npm run audit:source -- --source chip-huyen --samples 3`：rss ok（10 候选）、sitemap ok（62 raw / 59 候选）、listing ok（58 候选），合并 59。
- PASS：`ai-engineering-pitfalls.html`（2025-01-16，en，markdown 12348，图片 1）、`agents.html`（2025-01-07，en，markdown 52340，图片 8）。
- FAIL：`https://huyenchip.com/google40674044319d01f1.html` —— 页面 200，但为 Google 站点验证占位文件（无标题无正文），提取失败 `no title found`。
- 无官方中文版本；图片均为站点远程资源，无懒加载占位问题。

## 建议的 sources.json 配置修正

- 在发现/候选过滤层排除验证类文件（如 `google*.html`、非文章路径），或为该源增加排除规则（等价于 `exclude_paths: ["/google*.html"]`）。

## 可否转 active

暂不可。验证占位文件会让增量更新产出垃圾候选；过滤规则落地后即可转 active（内容质量与日期均达标）。
