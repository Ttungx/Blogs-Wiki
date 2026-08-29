# 发现层清点报告（2026-08-28）

上线前对全部 active 来源做的一次发现层清点（census）：**只枚举文章 URL 统计数量，不抓正文、不翻译、不入库**。工具：`scripts/update/census.ts`（可重复执行：`npx tsx --env-file-if-exists=.env scripts/update/census.ts`，增量断点续跑）。

## 统计口径

- 范围：`update_mode: "active"` 的 22 个源（dry-run-only 的 6 源未纳入）。
- **个人作者**（`type: "personal"`）：不限时间，全部候选计入；日期未知的也计入（真实日期在抓取正文层再取）。
- **非个人作者**：只计入发布日期 >= 2019-01-01 的候选；日期未知单独列出，无法判定是否在范围内。
- **源级 `min_published_year`** 可覆盖上述口径（对两类都生效，且日期未知不再计入）。当前仅 `simon-willison` 配 `2019`（用户指令：simonwillison.net 限 2019 及之后）。
- 日期来源：发现层 `publishedAt`（RSS pubDate / sitemap lastmod / listing 提取），缺失时回退 `url_date_pattern` 从 URL 推断。⚠️ sitemap lastmod 是最后修改时间，可能晚于真实发布日期。
- 发现层固有局限：RSS 通常只含最近 10~20 条；listing 页只有第一页。**无 sitemap 的源，此处数量远小于历史全量**。本表反映的是"当前发现层能枚举到的量"，不是站点的历史文章总量。

## 数量总表（修复后，2026-08-28）

| 来源 | 类型 | 发现候选 | 计入范围 | 日期未知 | 备注 |
| --- | --- | ---: | ---: | ---: | --- |
| simon-willison | personal | 16900 | 7851 | 53 | ✅ `min_published_year: 2019` 生效，2019 前约 9049 篇不再计入 |
| dan-koe | personal | 87 | 87 | 0 | |
| sebastian-raschka | personal | 76 | 76 | 0 | |
| hamel-husain | personal | 57 | 57 | 0 | |
| lilian-weng | personal | 55 | 55 | 1 | |
| andrej-karpathy | personal | 31 | 31 | 18 | ✅ 修复：18 → 31（bearblog sitemap 14 篇 + github.io legacy listing） |
| jay-alammar | personal | 10 | 10 | 0 | Substack 窗口限制（见 P2） |
| lastwhisper | personal | 22 | 22 | 22 | ⚠️ 全部无日期：站内 sitemap 无日期，需 git_date（抓取层）兜底 |
| microsoft-research | company | 1768 | 640 | 0 | ✅ 修复：~10 → 640（接入 Yoast sitemapindex 的 post-sitemap） |
| openai | company | 207 | 197 | 10 | ✅ 修复：0 → 197（census 补 curl 回退注册，见 P0-1 根因更正） |
| hugging-face | company | 740 | 738 | 2 | ✅ 口径澄清 + 语言聚合页排除，见 P1- hf |
| langchain | company | 460 | 460 | 0 | |
| google-deepmind | company | 378 | 378 | 0 | |
| github-engineering | company | 169 | 148 | 6 | 2019 前 15 篇已按口径排除 |
| anthropic | company | 168 | 168 | 0 | |
| cursor | company | 116 | 114 | 2 | |
| google-security | company | 57 | 57 | 0 | |
| mistral-ai | company | 51 | 51 | 0 | |
| eleuther-ai | company | 50 | 50 | 0 | |
| qwen | company | 44 | 44 | 0 | |
| moonshot | company | 9 | 0 | 9 | ✅ 修复：0 → 发现 9 篇；listing 无日期故 census 计 0，生产链路靠正文日期 |
| meta-ai | company | 10 | 0 | 10 | ❌ sitemap 403（站方限制），listing 兜底 10 条全部无日期 |

**合计（计入范围）**：**11 234** 篇（个人作者 8 189 + 非个人作者 3 045）。

修前基线：19 443（个人 17 225 + 公司 2 218）；降幅主要来自 simon-willison 的 2019 限制（-9 049）与 openai/moonshot/msr 的修复回补。

## 修复记录（2026-08-28 第二轮）

### P0-1 `openai` —— 已修复（根因与首轮结论不同）

首轮报告认为根因是 "`article_paths: ["/index"]` 为旧站形态、`sources.json` 缺分类白名单"。**复核后不成立**：`sitemap_include_paths`（research/engineering/safety/security 4 分类）与 `article_paths: ["/index"]` 早已在配置中，且前缀匹配 `/index/<slug>/` 有效；生产 update 链（runner → fetch-backend）行为正常。

真实根因链（三层叠加，全部在 census 侧）：

1. `canonicalizeUrl` 规范化时剥掉 child sitemap URL 的尾斜杠：`/sitemap.xml/research/` → `/sitemap.xml/research`；
2. openai 的 CDN 对 **Node TLS 指纹 + 无尾斜杠路径**返回 403 challenge（curl 栈拿到的是 308 → 可跟随到带斜杠版本）；
3. census 进程未注册 curl 回退（`worker/fetch/curl.ts` 仅被 `fetch-backend.ts` / `audit.ts` 引入，census 不走 fetch-backend），`fetchText` 的 403 回退静默跳过；`collectSitemapEntries` 的 `Promise.allSettled` 又吞掉 child 抓取异常 → sitemap 通道呈 `ok=true raw=0` 假象。

修复：`census.ts` 顶层 `import '../../worker/fetch/curl'`（与 `audit.ts` 同款先例）。修后 openai 发现 207 候选 / 197 计入（10 条 child sitemap 无 lastmod 记 unknown）。

### P0-2 `moonshot` —— 已修复

- `blog_url` → `https://www.kimi.com/en/blog/`（文章实际在 `/en/blog/<slug>`）；`article_paths` → `^/(en/)?blog/[a-z0-9-]+$`；删除失效的 `sitemap-ug-blog.xml`（站点改版后无博客 sitemap，robots.txt 的 ug-sitemap 仅产品页/帮助中心）。
- census 发现 9 篇、全部无日期（listing 页不暴露日期）→ company 口径计 0。**生产链路不受影响**：增量靠 listing 发现 + check 去重 + 正文日期提取。Kimi 博客本身规模小（~10 篇量级）。

### P1 修复明细

- **`andrej-karpathy`**：接入 `karpathy.bearblog.dev` 三通道（rss `/feed/` + sitemap `sitemap.xml`，14 篇文章 + `/now` 页排除），`blog_url` 保留 `karpathy.github.io`（legacy 老文 listing 23 条）。新增源级字段 **`extra_domains`** 让同一博客的第二域名通过发现层 hostname 校验（`domain: karpathy.bearblog.dev` + `extra_domains: ["karpathy.github.io"]`）。18 → 31 篇（18 条 unknown 为 github.io 老文无日期，personal 口径全部计入）。
- **`microsoft-research`**：加 `sitemap_url`（Yoast sitemapindex，前两个 child `post-sitemap*.xml` 即博客文章，URL 形态 `/en-us/research/blog/<slug>/` 与现有 `article_paths` 前缀匹配）。~10 → 1 768 候选 / 640 计入。
- **`jay-alammar`**：加 `sitemap_url`（newsletter.languagemodels.co/sitemap.xml，13 条）——但 Substack 平台 sitemap 与 RSS 同为近期窗口，**历史全量需 `/archive` 分页方案**，维持 P2 观察。
- **`hugging-face`**：排除语言聚合 hub（`^/blog/(zh|ko|ja|fr|de|es|pt)(/|$)`，修掉 RSS 漏进的 `/blog/zh`）。**口径澄清**（回应"741 虚高"质疑）：`feed.xml` 与 `sitemap-blog.xml` 是同一全站博客池（851 条），其中 `/blog/<作者>/<slug>` 双段形态的 113 条为社区/org 投稿（2025 年起启用），已被 `^/blog/[^/]+$` 单段白名单排除；剩余 738 条单段 URL 经逐条核验**全部为 huggingface 官方博文**（lastmod 从 2020 到 2026 连续分布，无聚合页混入）。org activity 页为 SSR 内嵌数据 + 无 XHR、`?skip=N` 实测不翻页、`/api/blog` 无 org 过滤参数——**官方文章无独立可分页 API**，全站池即官方口径。org activity 页显示的"少量文章"只是该页的近期窗口，不是官方全量。
- **`meta-ai`**：`ai.meta.com/sitemap/ai_meta_com_sitemap.xml.gz` 复测仍 403（站方全 UA 拦截）。维持 listing 兜底 10 条（全无日期，census 计 0）。历史全量方案需专门立项（真浏览器出口或 gunzip 通道）。

### P2 — 口径性限制（非故障）

- **`lastwhisper`**：站内 sitemap 无日期（已知设计），清点层 22 篇全部 unknown；生产链路靠 git_date 兜底，不受影响。
- **`simon-willison`**：53 篇日期未知（非 URL 日期形态的历史条目）；`min_published_year` 生效后这些条目不再计入，生产链路有 `url_date_pattern` 兜底。
- **`github-engineering`**：6 篇日期未知。
- **`openai`**：10 条 child sitemap 无 lastmod。
- **`jay-alammar`**：Substack sitemap/RSS 只覆盖近期窗口。
- sitemap lastmod ≠ 发布日期：对 company 源的 2019 过滤在边界年份可能有少量误差（把老文算成新文），抓取正文层日期校验可纠正。

## 后续动作建议

1. ~~修复 P0-1 / P0-2~~（已完成，本报告即修后数字）。
2. meta-ai 历史全量发现方案单独立项；jay-alammar 的 Substack archive 分页接入可并入同一批"listing 分页"改造（org activity 页同理，若未来需要按 org 窗口收录）。
3. 上线顺序：本轮 22 源 census 全部 ok，可全量放开；moonshot / meta-ai 以"发现少、日期靠正文层"的现实运行。
