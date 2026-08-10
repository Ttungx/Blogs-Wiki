# 来源核验报告：google-deepmind（2026-08-10）

状态：通过（1 项非阻塞警示：sitemap 抓取偶发失败，RSS 兜底可靠）

## 命令与入口

`npm run audit:source -- --source google-deepmind --samples 3`

- rss: ok，100 candidates（存活）
- sitemap: failed；raw=0 candidates=0（fetch failed）。直连探测 `https://deepmind.google/sitemap.xml` 返回 200 且为有效 urlset（84KB），判定为抓取偶发失败/限流，而非 URL 失效
- listing: ok 但 0 候选（列表页为 JS 渲染，依赖 RSS 是正确做法）

## 三篇样本

| URL | 标题 | 日期 | 语言 | markdown | 图片 |
|---|---|---|---|---|---|
| /blog/weathernext-... | AI model achieves breakthrough in forecasting cyclones | 2026-08-06 | en | 11482 | 4 |
| /blog/gemini-robotics-er-2-... | Introducing Gemini Robotics ER 2 | 2026-07-30 | en | 10135 | 6 |
| /blog/were-launching-lyria-35-... | Lyria 3.5 in Google Flow Music… | 2026-07-29 | en | 865 | 0 |

全部 PASS，标题/日期/语言/正文/图片均正常。

## 逐项核验

- 官方中文 alternate：无。页面无任何 `hreflang="zh*"`；不需要 `prefer_official_zh`。
- 图片原链：管线 `absolutizeUrls` 保留原链，不下载（headImage + 内容图）。
- 日期来源：页面无 meta/JSON-LD 日期（仅有可见文本 "August 6, 2026"），audit 日期来自 RSS pubDate；RSS 存活则日期完整。
- 抓取稳定性：curl 直连被 TLS 指纹拦截（status=000）；管线 undici fetch 正常（status=200, 159KB），与 openai.com 同类问题，已有回退机制覆盖。

## 建议的 sources.json 配置修正

- 保留现有 `rss_url` / `sitemap_url`（URL 均有效）；sitemap 失败不影响主链路，RSS 兜底即可。
- 无需新增字段。

## 可否转 active

可以。发现入口（RSS）可靠、三篇样本全通过、日期/图片/正文完整。前提：接受 sitemap 偶发失败由 RSS 兜底。
