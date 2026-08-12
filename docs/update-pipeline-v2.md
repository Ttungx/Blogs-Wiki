# 博客发现与翻译管线 V2

状态：核心能力已接线。官方中文 / 原生中文直通、翻译与分类解耦已进入生产路径；V2 分块翻译执行器（`translate-v2.ts`）已实现并通过离线测试。默认 V1 整篇一次（`routeTranslator`）；`TRANSLATION_PIPELINE=v2` 显式启用分块；单篇 >100K 字符自动兜底 V2。

## 目标

单站适配不再靠反复试错。先运行来源审计，得到每种发现入口、样本提取、日期、语言、图片和翻译规划报告；满足门槛后才显式启用完整更新。

核心顺序：

1. 配置校验：每个来源必须显式声明 `active` 或 `dry-run-only`，新增来源默认不能进入翻译和持久化。
2. 多入口诊断：审计 RSS / Atom、Sitemap、列表页各自的命中数、耗时与错误；生产发现仍沿用首个成功入口。
3. 官方中文优先：抓取层探测 `rel=alternate` + `hreflang` / `hrefLang`（openai 用驼峰拼写，优先级 `zh-Hans-CN`、`zh-CN`、`zh-Hans`、`zh-SG`、`zh`），命中则抓取中文页并标记 `contentSource: 'official-zh'`，跳过模型翻译。openai 实测已直通官方中文原文。
4. 原生中文直通：`lang=zh` 或中文比例达门槛时直通，仅分类不翻译。
5. 结构化翻译：Markdown AST 保护 URL、图片 URL、代码和 HTML，再按标题与顶层结构块分块。模型返回后严格核对并恢复占位符；保证语义与目标值不变，不承诺 Markdown 字节级格式不变。
6. 图片只引用远程原链：解析 `src`、`srcset`、`data-src`、`data-lazy-src`、`data-original`，不下载图片。

## 已落地接口

| 模块 | 用途 | 是否进入生产写入 |
| --- | --- | --- |
| `config.ts` | 来源 schema 校验、显式更新模式 | 是，仅配置门禁 |
| `network.ts` | 更新与审计共用代理 / `NO_PROXY` 路由 | 是 |
| `discovery.ts#diagnoseSourceDiscovery` | 跑完全部发现入口并输出诊断 | 否，仅审计 |
| `audit.ts` | 只读来源审计与样本报告 | 否 |
| `fetch.ts#fetchArticleWithLocalization` | 官方中文 alternate 优先抓取（`prefer_official_zh`） | 是 |
| `localization.ts` | 官方中文 alternate 解析与选择 | 是（经 fetch 调用） |
| `translate-v2.ts` | V2 执行器：AST 分块翻译 + 分类解耦 | 是（`TRANSLATION_PIPELINE=v2`） |
| `translation-plan.ts` | AST 保护、分块、中文判断和翻译规划 | 是（经 translate-v2） |
| `persist.ts` | frontmatter 增加 `translation_status` / `original_zh_url` | 是 |

## 使用方式

```bash
# 校验所有来源配置，不访问网络
npm run audit:source -- --config-only

# 审计一个来源，默认抽取 3 篇；不翻译、不落盘
npm run audit:source -- --source langchain

# 机器可读报告
npm run audit:source -- --source cursor --samples 3 --json
```

审计通过不等于自动激活。必须人工检查三篇样本，确认日期、正文、代码块、表格、图片原链和中文策略，再把 `update_mode` 改为 `active`。

```bash
# 启用 V2 分块翻译执行器（默认仍为 V1）
TRANSLATION_PIPELINE=v2 npm run update
```

## 翻译质量与成本策略

- 固定系统提示与 schema 放在请求前部，文章块放后部，利于提供方提示缓存。
- 翻译和分类拆成两个阶段；原生中文、官方中文只分类，不翻译。
- 每块使用稳定内容摘要，为后续 checkpoint 复用提供键；单块失败只重试该块。
- 429、5xx 和网络错误做有上限的指数退避；结构或占位符不完整视为失败，不将坏结果写入文章。
- 术语表按正文命中频率选取少量条目，标题术语单独维护，避免把整份术语表重复塞进每次请求。

## V2 启用门槛

1. 离线测试覆盖 URL / 代码往返、GFM 表格不拆分、中文阈值、官方中文优先级。
2. 对至少 10 篇长短和图文混合文章执行 V1 / V2 双跑，人工抽检无结构损坏。
3. 报告调用次数、输入输出 token、缓存命中、失败重试和每篇成本。
4. 先对一个 `dry-run-only` 来源启用 V2；连续运行稳定后再逐来源迁移。
5. V2 进入生产前保留 `TRANSLATION_PIPELINE=v1` 回退开关。

## 后续阶段

- 将官方中文解析接入抓取，并记录 `original_zh_url` 与内容生成方式。
- 实现块级 checkpoint、术语表与独立分类客户端。
- 增加按域名有界并发、速率限制、条件请求（ETag / Last-Modified）和运行报告。
- 用专用 XML parser 替换正则 Feed / Sitemap 解析前，先建立真实站点 fixture，避免一次性回归。
