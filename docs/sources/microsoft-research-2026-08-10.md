# 来源核验报告：microsoft-research（2026-08-10）

状态：通过

## 命令与入口

`npm run audit:source -- --source microsoft-research --samples 3`

- rss: ok，10 candidates（存活）
- sitemap: 未配置
- listing: ok，138 raw → 13 candidates

## 三篇样本

| URL | 标题 | 日期 | 语言 | markdown | 图片 |
|---|---|---|---|---|---|
| /blog/orchard-... | Orchard: An open framework for scalable agentic AI | 2026-08-04 | en | 12869 | 4 |
| /blog/echoverse-... | Deep, evolving environments for computer-use agents | 2026-07-31 | en | 38144 | 15 |
| /blog/evolib-... | EvoLib: Teaching LLMs to learn from experience | 2026-07-31 | en | 8301 | 4 |

全部 PASS。

## 逐项核验

- 官方中文 alternate：无 `hreflang="zh*"`。
- 图片原链：页面图片为 `wp-content/uploads/...` 绝对原链，管线保留，不下载。
- 日期：页面含 `datePublished` / `published_time` meta + JSON-LD，与 RSS 双重来源，完整。
- RSS 存活：是。

## 建议的 sources.json 配置修正

- 转 active 前建议补充 AI 相关性过滤（登记表备注"需过滤非 AI 研究文章"）；本次 3 篇样本均为 AI 主题，但 listing 达 138 条宽泛研究内容，全量收录会混入非 AI 文章。
- 可选：补充 sitemap_url 以扩大候选面（当前 RSS 仅 10 条 + listing 13 篇）。

## 可否转 active

可以。日期、图片、正文完整；建议先行配置 AI 相关性过滤再激活。
