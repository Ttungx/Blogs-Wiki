# One Poem Suffices（keli-wen）适配记录

核验日期：2026-08-09。状态：`dry-run-only` 脚手架（正在适配，完整适配被日期阻碍）。

## 判定

非传统博客引擎：仓库 [keli-wen/One-Poem-Suffices](https://github.com/keli-wen/One-Poem-Suffices)
是 Markdown + TeX 内容库（language: TeX），经 GitHub Pages 渲染成静态站点
[https://keli-wen.github.io/One-Poem-Suffices/](https://keli-wen.github.io/One-Poem-Suffices/)。
无 RSS / Atom（`/index.xml`、`/atom.xml`、`/rss.xml`、`/feed.xml` 均 404），但
`/sitemap.xml` 有效（200，标准 urlset），故通用网页发现器的 sitemap 路径可用，予以纳入。

## 证据

- 仓库描述：`"One Poem Suffices" Blog Series about LLM / Agentic System`；`has_pages: true`；默认分支 `master`。
- Pages 站点 200，`<title>欢迎 - One Poem Suffices</title>`；hreflang zh / en 双语。
- Sitemap 27 个 URL = 根页 + 4 个系列索引页 + 22 篇文章（one-poem-suffices 6、thinking-in-context 2、zen-of-harness-engineering 4、scaling-thoughts 10）。
- 单篇抽查 `one-poem-suffices/prompt-caching/` 200，中文原题「Prompt caching，一篇就够了。」。
- 文章页无 `article:published_time` / `datePublished` / `meta[name=date]` 等机器可读日期，sitemap 亦无 `lastmod`。

## 配置

`sources.json` 使用 `update_mode: dry-run-only`，`sitemap_url` 指向 Pages sitemap，
`article_paths` 限定四个中文系列前缀以排除系列索引页与根页。

## 阻碍

1. 无 RSS / Atom：只能依赖 sitemap + 列表页。
2. 无机器可读日期：sitemap 无 `lastmod`，文章页无日期 meta / JSON-LD，样本审计会报
   `missing-published-date`。完整适配前需确认日期来源（如 Git 提交历史或正文日期）。

## 本地化

中文原文，站点自带 en 英文版（未进 sitemap）。按「官方中文优先、不重复翻译」处理。
