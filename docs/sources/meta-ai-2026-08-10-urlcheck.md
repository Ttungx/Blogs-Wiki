# URL 边界核验：meta-ai（2026-08-10）

## 入口探测结果

- 列表页 `https://ai.meta.com/blog/`：curl（Chrome/Mac UA）与 node undici 均 HTTP 400（UA/TLS 拦截，非 UA 问题）；管线 undici 默认可 200（199KB，见当日 audit 报告）。属 openai.com 同类 TLS 指纹拦截，curl 回退无效，仅管线原生 undici 可达。
- RSS：`/blog/rss.xml`、`/rss.xml`、`/blog/feed` 均不存在（404）。
- Sitemap：robots.txt 声明 `https://ai.meta.com/sitemap/ai_meta_com_sitemap.xml.gz`，但 curl 与 node fetch 均 403，gz 拿不到。仅能建议配置该 URL 由管线 undici 重试。
- URL 形态：`https://ai.meta.com/blog/<kebab-slug>`（audit 样本确认：muse-spark、assistive-robotics、genesis-mission）。

## 内容判定：无法全量枚举，样本偏研究向

无法绕过 400 拉全列表。audit 三样本：Muse Spark 模型 API（模型发布，技术）、Pittsburgh 助残机器人研究、Genesis Mission 合作项目（偏公告）。判定为 mixed，但受入口限制无法给出完整 exclude 清单。

## 建议

```json
{"article_paths": ["/blog/"], "rss": null,
 "sitemap_url": "https://ai.meta.com/sitemap/ai_meta_com_sitemap.xml.gz",
 "note": "仅管线 undici 可达（curl 400/sitemap 403）；日期缺失是管线能力缺口（无 meta/JSON-LD 日期），非配置可解"}
```
