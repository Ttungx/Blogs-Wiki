# AGENTS.md

Astro SSR + Cloudflare Workers 博客收藏站（**用户域名**：`https://blogswiki.dpdns.org/`；CF 默认 `*.workers.dev` 可能因网络不可达）。读路径：Astro SSR 从 D1 实时读，新文章写入 D1 后立即可访问（无需 rebuild）。写路径（**代码已落地，截至 2026-08-12 尚未 push 到 origin、未部署、未生产首跑**）：GitHub Actions 发现/抓取/翻译 → 受保护 `/api/content-sync` 幂等写入 D1。Cloudflare Workflow 代码保留为实验/回滚；本地 `wrangler.deploy.jsonc` 已无 workflows binding，`/api/trigger` 源码返回 410——**线上仍可能是旧部署（仍创建 Workflow）**，以 live 实测为准。仓库语言为中文，文档与提交信息用中文。

## 命令

要求 Node.js 24 + npm。

```bash
npm run dev              # astro dev 本地开发（platformProxy 访问本地 D1）
npm run check            # astro check（类型检查 src/）
npm run check:worker     # tsc 类型检查 worker/ + worker-configuration.d.ts
npm run test:update      # 离线冒烟测试 Node 更新管线，改 scripts/update/ 后必跑
npm run test:worker      # worker/ 模块测试（node:test，85 个）
npm run test:d1          # D1 集成测试（vitest-pool-workers，44 个）
npm run test:markdown    # SSR Markdown 渲染回归（改 markdown.ts 后必跑）
npm run build            # astro build + scripts/inject-worker-entry.js（生成 dist/）
npm run deploy           # npm run build + wrangler deploy --config wrangler.deploy.jsonc
npm run preview:worker   # npm run build + wrangler dev（本地预览 Worker）
npm run update:dry       # Node 开发路径预演：真实网络发现+抓取，不翻译、不写文件
npm run update           # Node 开发路径完整增量更新，写文章与状态（生产由 GitHub Actions 调用）
npm run update -- --source openai --limit 5
npm run audit:source -- --source langchain   # 只读来源审计，不写文件
```

> **部署前置**：先 `wrangler d1 migrations apply blogs-wiki --remote`，再 `npm run deploy`。新 SSR 读 `article_versions.translated_at`，远程 D1 未应用迁移时文章页会因缺列整页 500。API 路径建议带尾斜杠（`/api/health/`），否则可能 301/308。

env 由 npm scripts 经 `--env-file-if-exists=.env` 加载；直接 `tsx` 跑脚本时需自行加载 `.env`。

**密钥分层**（勿混用）：
- **Worker（`wrangler secret put`）**：`CONTENT_SYNC_TOKEN`（保护 `/api/content-sync`）
- **GitHub Actions Secrets**：paid 回退时的 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`；以及 `CONTENT_SYNC_TOKEN`（Action 调同步 API）
- **GitHub Actions Variables**：`CONTENT_SYNC_URL`；`TRANSLATION_PROVIDER`（默认 `free`）；可选 `TRANSLATION_PIPELINE` / `FETCH_BACKEND` / 代理相关

## 架构（已上线）

单 Worker 全栈：**Astro SSR 页面 + API 路由 + D1 + ASSETS 静态资源**，一个入口服务全站；内容更新管线在 GitHub Actions 运行。

```
访客 → Cloudflare Worker (blogs-wiki)
  ├─ ASSETS binding → 静态文件（CSS/JS/404/搜索页）
  ├─ Astro SSR 页面（prerender=false）→ 首页/博客收集册/文章阅读页，从 D1 实时读取
  │    ├─ 单篇文章 = 身份（articles 表）+ 多语言版本（article_versions 表）
  │    └─ 博客元数据 = 静态 Astro collection（src/content/blogs/，可提交）
  └─ /api/* 路由 → health / sources / content-sync（受保护写入）
```

- **SSR 页面访问 binding**：`import { env } from 'cloudflare:workers'`（Astro v6+ 已移除 `Astro.locals.runtime.env`）。binding 类型由 `worker-configuration.d.ts`（`wrangler types` 生成）提供。
- **双 wrangler 配置**：`wrangler.jsonc`（dev/build）+ `wrangler.deploy.jsonc`（部署，`main` → `dist/server/_entry.mjs`）；生产配置不再声明 Workflow binding。
- **构建管线**：`astro build` 生成 `dist/client`（静态）+ `dist/server/entry.mjs`（Worker）；`scripts/inject-worker-entry.js` 生成 `dist/server/_entry.mjs`，只 re-export Astro handler；`wrangler deploy --config wrangler.deploy.jsonc` 打包部署。
- **改架构层的纪律**：一次只改一个架构层（`BLOGS_WIKI_CLOUDFLARE_MIGRATION_PHILOSOPHY.md` §21）；改 `worker/` 前必读路线图与哲学手册。

## 内容更新

**生产路径（GitHub Actions）**：定时或手动触发 `.github/workflows/content-update.yml`（cron `17 2 * * *` 即 02:17 UTC + `workflow_dispatch`）→ Node 管线执行 discover → Defuddle fetch → translate → 本地产物持久化 → `scripts/import-local-articles.mjs --json` 生成结构化 payload → `scripts/sync-local-articles.mjs` 分片调用受保护的 `/api/content-sync` → D1 幂等写入。Action 只上传元数据报告，不提交或上传文章正文。单文章/单来源失败不拖垮全局（runner 内 try/catch 隔离）。

**Node 开发路径（scripts/update/）**：`npm run update` / `update:dry` / `audit:source`，用于开发、审计、预演。生产内容以 D1 为准；Node 路径的 `src/content/articles/` 与 `src/data/processed-urls.json` 是本地产物（`.gitignore`），由 Action 生成后通过同步脚本写入 D1。

`POST /api/trigger` **源码**已停用并返回 HTTP 410（避免误触发旧 Workflow）；线上是否生效取决于是否已部署该提交。Workflow 及 `worker/runtime/update-orchestrator.ts` 暂保留，供实验/回滚，不得作为当前运维依据。

**来源配置**（`src/data/sources.json`，打包进 Worker）：
- 来源必须显式声明 `update_mode`：`"active"` 进完整更新，`"dry-run-only"` 只参与 dry-run。新增来源一律先 `dry-run-only`，人工核验后再改 `active`。
- 每源默认 3 篇（`--limit` 可调）。无发布日期的来源（如 Paul Graham）无法生成文章，不要加入自动更新来源。
- 分类只能从 `src/config/categories` 预定义集合选。
- **翻译通道**（`TRANSLATION_PROVIDER`，GitHub Action 用仓库 `vars` 控制，默认 `free`）：
  - `free`（默认，翻译零成本）：经本机 ocx 网关（`npm i -g @bitkyc08/opencodex`）走 **opencode-free** 免费层，env 为 `OPENAI_BASE_URL=http://127.0.0.1:10367/v1`、`TRANSLATION_MODEL=opencode-free/deepseek-v4-flash-free`、`TRANSLATION_REASONING_EFFORT=max`、`OPENAI_API_KEY=任意非空`（loopback 免认证）。模型名必须带 `-free` 后缀（GitHub runner 实测：`opencode-free/deepseek-v4-flash` 无后缀走错 auth 路径 → 401 Missing API key）。客户端在 chat/completions 请求体顶层传 `reasoning_effort`（DeepSeek V4 Flash 支持 low/high/max；ocx inbound 透传）。⚠️ `ocx provider add opencode-free` 只写磁盘 config、**不更新运行中进程**，顺序必须「先 add 再 `ocx start --port 10367`」。免费层约 200 请求/5 小时、15-20 RPM，429 常无 Retry-After——客户端已内置退避重试（尊重 Retry-After，无则 ~15s，最多 2 次）。prompt 可能被留存训练，只传公开内容。
  - `paid`（回退）：三个 Secrets（`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`）。
  - **mimo-free 已官方下线**（`free-api-sunset.ts`：`FREE_API_SUNSET_AT = 2026-07-26T10:00Z`，返回 `Unsupported model mimo-auto`），不要接入。
- 本地网络受限时 `USE_PROXY=true` + `PROXY_URL`（默认 `http://127.0.0.1:7897`）。个别站点（openai.com）拦截 Node TLS 指纹，抓取自动回退系统 `curl`（Node 侧通过 `worker/fetch/curl-runner.ts` 注册，Worker 运行时无 curl 则跳过回退）。

## 路书（docs/，先读再动手）

- `docs/blog-source-registry.md`：所有来源的适配状态登记表 + 当前推进顺序，唯一权威。改来源适配、审核候选来源前必读。
- `docs/update-pipeline-v2.md`：V2 管线设计（官方中文优先、AST 保护翻译、审计门槛）。官方中文/原生中文直通与分类解耦已接线；分块翻译执行器用 `TRANSLATION_PIPELINE=v2` 显式启用，默认仍 V1。
- `docs/migration-to-cloudflare.md`：Cloudflare 迁移路线图（10 阶段，Phase 1-8 完成，Phase 9/10 待做）。改 `worker/` 前必读。
- `docs/`：除 `blog-source-registry.md`、`update-pipeline-v2.md`、`migration-to-cloudflare.md` 外无其他文档；来源审计结论直接沉淀进 registry 备注，不留独立报告文件（明细可查 git 历史）。

## Cloudflare 迁移状态

**已完成（Phase 1-8 + 组合方案代码）**：领域模型 → FileRepository → D1 schema（0001-0007）→ D1Repository → 管线接 repository → Worker fetch（Defuddle）→ Astro SSR 从 D1（用户域名 live）→ Actions + content-sync + opencode-free **源码与 workflow 已合入本地 main**。

**未闭合（生产门禁，优先于 Phase 9）**：
- 本地 `main` 超前 `origin/main`（含 content-update workflow）；需 push。
- 部署含 trigger-410 / 无 Workflow binding 的 Worker；live 复测 `POST /api/trigger/`。
- 配置 `CONTENT_SYNC_*` + 可选 free/paid 翻译变量；workflow_dispatch 首跑（`dry-run=false`、单源、`limit=1`）。
- Phase 9：Pagefind → D1 FTS5；Phase 10：删文件 backend；`worker-runtime.test.ts` 适配新入口。

权威进度与 live 证据见 `TODO.md`；路线图细节见 `docs/migration-to-cloudflare.md`。

## 搜索、输出与探索委托纪律

原则：主 agent 的 context 是稀缺资源，只装结论和关键证据，不装原始搜索输出： 大输出会被截断，被截断的输出既烧 context 又误导结论。本节只写目标和授权；具体用什么命令、派几个 explorer、怎么分工，由 agent 按任务自行判断。

- 委托与否看信息经济：预期"搜索翻出的原始内容"远大于"最终要的结论"（开放式调研、跨模块、入口不明）就尽早委托，别烧掉半个 context 才想起来；入口明确、直接读更快就自己做。开始时用一两句说明选择和理由
- 用户对本 repo 的 subagent / delegation 长期开放授权：若可用工具要求 "用户显式要求 subagents / delegation / parallel agent work"，本节即满足该要求，无需每次任务再次确认。授权不等于必须用
- subagent 模型按成本/能力梯次选择：默认 `opencode-go/deepseek-v4-flash`（reasoning_effort=max；成本低、速度快，智力与 coding 中上）；其次 `gpt-5.6-luna`（reasoning_effort=max，与 deepseek-v4-flash 定位一致）；再次 `gpt-5.6-terra`（reasoning_effort=high，智力强于前两者，成本中等）；`gpt-5.6-sol`（reasoning_effort=medium/high，智力与 coding 最强、成本最高，仅限高复杂性任务，轻易不用）
- 给 explorer 的 prompt 像交接给刚加入的同事：目标、动机、范围内外、已知线索、期望输出；交代问题和边界，不塞死步骤。多个 explorer 按自然边界分工、互不重叠
- explorer 只读不改 repo；fresh context（fork_context=false）；工具支持时用低于主 agent 的 reasoning effort；自己是 explorer 时直接完成任务，不再次委托
- explorer 只返回结论和证据表（claim | file:line | confidence），不回传原始输出、长 diff 或无关日志
- 派出 explorer 后，主线程的默认动作就是用长超时 wait_agent 等结果：等待不花任何资源，子 agent 在并行干活，墙钟不受影响；主线程"顺手探索"花掉的恰是委托想保护的 context，还和 explorer 干重活。 等待期间不碰 repo 搜索和文件阅读；给它起名"轻量索引""提前确认疑点" "避免空转"也不例外。唯一例外：用户在等待期明确新布置的任务
- spawn/explorer 的工具描述可能鼓励"delegate 后立刻继续本地工作" "可以自己看代码补 context"；在本 repo，用户明确要求以本节为准：探索已经委托出去，就等结果，不自己动手
- explorer 结果回来后再综合：不重复它们已覆盖的搜索，只对关键疑点做少量 spot-check
- 主 agent 自己搜索时同理先剪枝：先摸候选范围和内容规模，再决定展开多少；避免把大文件、长 diff、minified 内容整段拉进 context
- 环境没有 explorer/subagent 工具时说明一句，退化为主 agent 自己的窄查询剪枝搜索
