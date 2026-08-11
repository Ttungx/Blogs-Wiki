# Google Security / Meta Engineering / GitHub Engineering 来源核验报告（2026-08-11）

由 subagent 实测（curl 跟随重定向，代理 127.0.0.1:7897）。

## Google Security Blog

- 博客索引：**https://blog.google/security/**（`security.googleblog.com` 已 301 到此处）
- RSS：**https://blog.google/security/rss/**（200，20 条纯安全内容）
- Sitemap：https://blog.google/sitemap.xml → 主用 https://blog.google/en-us/sitemap.xml（11504 条，`/security/` 58 条带 lastmod）
- 文章 URL：`/security/<slug>/`，无日期段
- 官方简体中文：无（`/intl/zh-CN/` 404，无 hreflang；需模型翻译）
- 图片：`storage.googleapis.com/gweb-uniblog-publish-prod/images/<name>.max-*.webp`
- 建议：`article_paths: ^/security/`（en-us sitemap 精确过滤）；勿用全局 `/rss/`（全站混合 feed）
- 抓取障碍：低（Google Frontend，无 Cloudflare；Next.js SSR 正文可抓）
- 注意：`blog.google/technology/safety-security/` 会跳转到 `/innovation-and-ai/technology/safety-security/`，是宽泛专题页，不是安全博客列表，不采用。

## Meta Engineering

- 博客索引：**https://engineering.fb.com/**
- RSS：**https://engineering.fb.com/feed/**（200，9 条）
- Sitemap：https://engineering.fb.com/sitemap_index.xml → post-sitemap.xml / post-sitemap2.xml（975 条）
- 文章 URL：`/YYYY/MM/DD/<category>/<slug>/`（含日期段）
- 官方简体中文：无（需模型翻译）
- 图片：`engineering.fb.com/wp-content/uploads/YYYY/MM/<name>.png|jpg`，带 `?w=580&h=326&crop=1` 裁剪参数（可保留原链）
- 建议：`article_paths: ^/20\d\d/\d\d/\d\d/`；可选排除 `meta-tech-podcast` 播客型文章
- 抓取障碍：低（WordPress VIP，无 Cloudflare）

## GitHub Engineering

- 博客索引：**https://github.blog/engineering/**
- RSS：**https://github.blog/engineering/feed/**（200，10 条，Engineering Category Feed）
- Sitemap：https://github.blog/sitemap_index.xml → post-sitemap*.xml（/engineering/ 共 162 条）
- 文章 URL：`/engineering/<slug>/` 或 `/engineering/<subcategory>/<slug>/`；分类 feed 也含跨分类文章（`/ai-and-ml/github-copilot/`、`/security/supply-chain-security/`）
- 官方简体中文：无（需模型翻译）
- 图片：`github.blog/wp-content/uploads/YYYY/MM/<name>.png`，带 `?resize=800%2C425` 参数
- 建议：`article_paths: ^/engineering/`（可追加 copilot/security 跨分类前缀）；`exclude_paths: ^/changelog、^/news-insights/、^/latest/、^/author/、^/category/`
- 抓取障碍：低（WordPress VIP nginx）

## 汇总

三站均无抓取级障碍、无官方简体中文（走模型翻译）、图片保留原链。发现入口：

- Google：`/security/rss/` + en-us sitemap 补充
- Meta：sitemap_index（feed 仅 9 条）
- GitHub：`/engineering/feed/` + post-sitemap

日期来源：Google 依赖 sitemap lastmod（URL 无日期段）；Meta 有日期路径；GitHub 依赖 feed pubDate / sitemap lastmod。
