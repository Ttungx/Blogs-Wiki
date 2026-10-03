# Blogs Wiki

> [!IMPORTANT]
> **本项目已停止开发与运营。** 若你需要「博客聚合 + AI 翻译 + RSS 订阅」这类功能，推荐使用 **[qiaomu-ai-rss](https://github.com/joeseesun/qiaomu-ai-rss)**（作者 joeseesun）。本仓库仅作归档保留，线上服务与自动更新均已关闭，不再接受 issue 与功能请求。

[![CI/CD](https://github.com/Ttungx/Blogs-Wiki/actions/workflows/ci.yml/badge.svg)](https://github.com/Ttungx/Blogs-Wiki/actions/workflows/ci.yml)

收录低频、高质量、值得长期阅读，但因为语言和分散发布而容易被错过的博客，并提供统一翻译阅读体验的数字馆藏。

> 原线上站点 [https://blogswiki.dpdns.org/](https://blogswiki.dpdns.org/) 已下线，服务已关闭。
>
> 已归档，不再维护。

## 特色

- **精选书架**：覆盖 AI、工程、研究与个人成长等领域的高质量博客，公司博客与个人作者分列呈现
- **统一翻译阅读**：官方中文优先，其余由模型翻译，保留原文标题、链接与翻译模型溯源
- **多语言切换**：每篇文章支持原文与中文版本自由切换
- **持续更新（目标架构）**：GitHub Actions 定时发现、Defuddle 抓取与翻译，再经受保护 `/api/content-sync` 写入 D1（生产首跑门禁见 `TODO.md`）
- **实时发布**：新文章写入数据库后立即可访问，无需重新构建或部署

## 技术栈

Astro（SSR）· Cloudflare Workers · D1 · GitHub Actions

## 本地开发

```bash
npm ci
npm run dev
```

Agent / 架构约定见 `AGENTS.md`；迁移进度见 `TODO.md` 与 `docs/migration-to-cloudflare.md`。

## 声明

仓库收录的文章版权归原作者与来源网站所有；译文可能存在错误，请以原文为准。
