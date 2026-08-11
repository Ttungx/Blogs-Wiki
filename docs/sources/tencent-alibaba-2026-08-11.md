# 腾讯 / 阿里 AI 博客来源核验报告（2026-08-11）

由 subagent 实测（curl / PowerShell，必要时走代理 127.0.0.1:7897）。

## 腾讯

### 腾讯云开发者社区（推荐主入口）

- 博客索引：**https://cloud.tencent.com/developer/**（Next.js SSR）
- AI 密度高子入口：腾讯技术工程专栏 **https://cloud.tencent.com/developer/column/1283**；混元专区 **https://cloud.tencent.com/developer/zone/tencenthunyuan**
- 无 RSS / 无 Sitemap（主站 sitemap 不含 /developer/article 条目）
- 文章 URL：`https://cloud.tencent.com/developer/article/<数字id>`
- 官方简体中文：是（中文原文；日期随 SSR 输出，`__NEXT_DATA__` 含 publishTime/updateTime）
- 图片：`developer.qcloudimg.com/http-save/<uid>/<hash>.(jpg|png|webp)`，可保留原链
- 建议 article_paths：`^/developer/article/\d+$`；发现入口限定 column/1283 + zone/tencenthunyuan
- 建议 exclude_paths：`/developer/article/write`、`/developer/ask`、`/developer/video`、`/developer/salon`、`/developer/competition`、`/developer/special`、`/developer/learning`、`/developer/mcp`、`/developer/user`、`/developer/search`（robots 禁爬）、`/developer/column`、`/developer/zone`（列表页本身）
- 抓取障碍：正文在 `__NEXT_DATA__` JSON（富文本 content 字段），Readability/Defuddle 需从 JSON 提取而非直接解析 DOM；robots 禁 `?page=` 参数
- 内容方向：中（UGC 混杂，AI 集中在两个子入口）

### 不采用

- `ai.tencent.com` 已重定向到元宝产品页；`ailab.tencent.com` 为 SPA 无内容索引；微信开发者社区有登录墙；`opensource.tencent.com` 非博客。

## 阿里

### 阿里云开发者社区（推荐主入口）

- 博客索引：**https://developer.aliyun.com/**（SSR 首页文章流）；官方博客栏目 **https://developer.aliyun.com/blog/**（客户端渲染壳页）
- AI 专区：百炼 **https://developer.aliyun.com/modelstudio/**（SSR）；AI 分组 `/group/nlp/`、`/group/pai/`、`/group/multimodel/` 等
- 无 RSS（`/blog/rss` 返回 200 但正文是 404 假阳性）；无 Sitemap
- 文章 URL：`https://developer.aliyun.com/article/<数字id>`；`<meta name="date">` 提供机器可读日期
- 官方简体中文：是
- 图片：`img.alicdn.com`、`cdn.nlark.com/yuque/`（语雀图床）
- **关键障碍：文章正文客户端渲染**（84KB 壳 HTML，正文由 JS 加载，疑似语雀渲染），Readability/Defuddle 直抓拿不到正文，需内部接口或 JS 渲染
- 内容方向：中高（官方博客 + 百炼 + AI 分组密度高，但 UGC 混合营销）

### 通义实验室（补充源）

- **https://tongyi.aliyun.com/**（SSR；首页 JSON 内嵌最新动态 + 页脚研究链接）
- 文章 URL：`/news?id=<opaque>&eId=<opaque>`（SSR 全文 + 可见日期 + 语雀 HTML 正文）；无 id 的 `/news` 返回 500
- 无列表索引页，发现只能解析首页 `__NEXT_DATA__` JSON；量少

### 不采用

- `102.alibaba.com`（阿里技术）本网络 TLS 握手失败/502，不可达；`youtu.qq.com` 非博客。

## 接入建议

- 腾讯：cloud.tencent.com 可先行（正文在 `__NEXT_DATA__` JSON，需提取适配）；两个 AI 子入口限定收录范围。
- 阿里：正文客户端渲染是硬障碍，需先打通正文接口或 JS 渲染再谈完整适配。
- 均先 `dry-run-only`。
