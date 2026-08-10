# Andrej Karpathy 核验报告

核验日期：2026-08-10。状态：**通过**（3/3 样本 PASS）。

## 证据

- `npm run audit:source -- --source andrej-karpathy --samples 3`：rss ok（10 候选）、sitemap 未配置、listing ok（23 候选）。
- PASS：`microgpt`（2026-02-12，en，markdown 36595，图片 1）、`lecun1989`（2022-03-14，en，markdown 16405，图片 2）、`blockchain`（2021-06-21，en，markdown 84177，图片 0）。
- 无官方中文版本（Jekyll 个人站，EN）。图片为站内资源，原链正常。

## 建议的 sources.json 配置修正

- 现有配置（rss）无需修改。注意 `homepage_url: https://karpathy.ai/` 与 `blog_url: https://karpathy.github.io/` 分属两站，blog 配置正确；可选补 `sitemap_url: https://karpathy.github.io/sitemap.xml`。

## 可否转 active

可以。更新较低频但内容高质量，适合精选；三篇样本全部达标。
