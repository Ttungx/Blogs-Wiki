# AGENTS.md

Astro SSR + Cloudflare Workers 博客收藏站（用户域名 `https://blogswiki.dpdns.org/`）。读路径：SSR 从 D1 实时读，新文章写入 D1 立即可访问。写路径（代码已落地，截至 2026-08-12 未 push、未部署、未生产首跑）：GitHub Actions 发现/抓取/翻译 → 受保护 `/api/content-sync` 幂等写 D1。Workflow 代码仅作实验/回滚，`wrangler.deploy.jsonc` 已无 workflows binding，`/api/trigger` 源码返回 410——线上可能仍是旧部署，以 live 实测为准。仓库语言为中文，文档与提交信息用中文。

## 提交纪律

不要因小改动立即 commit。只有用户明确表示工作收尾、整理代码库（如"提交一下""收尾""整理后提交"）时才 commit（或 push）；任务中途的更改留在工作区，收尾时一并提交。

## 并行工作纪律（worktree）

多 agent 并行时**不要在主 checkout 上建分支/切分支**（主工作区共享，会互相踩踏未提交改动）。一律用独立工作树，统一放仓库根 `./worktree/`，目录名遵循传统 branch 命名（`<type>-<描述>`，斜杠写作连字符）：

```bash
git worktree add ./worktree/refactor-reader-typography -b refactor/reader-typography
```

- 主 checkout（仓库根目录）固定挂 `main`，作为权威工作区；每任务一个 worktree：独立分支、独立未提交改动，互不干扰。
- 新 worktree 需自备不随 git 走的本地状态：`npm install`、复制 `.env`、复制 `.wrangler/`（本地 D1，platformProxy 依赖）；`.codegraph/` 按需重建。
- 收尾时各自提交/推送/合并，再 `git worktree remove ./worktree/<name>`。

## 命令

要求 Node.js 24 + npm。

```bash
npm run dev              # astro dev（platformProxy 访问本地 D1）
npm run check            # astro check 类型检查
npm run check:worker     # tsc 检查 worker/
npm run test:update      # Node 更新管线冒烟测试（改 scripts/update/ 必跑）
npm run test:worker      # worker 模块测试
npm run test:d1          # D1 集成测试
npm run test:markdown    # SSR Markdown 渲染回归（改 markdown.ts 必跑）
npm run build            # astro build + scripts/inject-worker-entry.js
npm run deploy           # build + wrangler deploy --config wrangler.deploy.jsonc
npm run preview:worker   # build + wrangler dev 本地预览
npm run update:dry       # 预演：真实抓取，不翻译、不写文件
npm run update           # 完整增量更新（生产由 Actions 调用）
npm run audit:source -- --source langchain   # 只读来源审计
```

> **部署前置**：先 `wrangler d1 migrations apply blogs-wiki --remote`，再 `npm run deploy`。新 SSR 读 `article_versions.translated_at`，远程 D1 未应用迁移时文章页整页 500。API 路径带尾斜杠（`/api/health/`），否则可能 301/308。

env 由 npm scripts 经 `--env-file-if-exists=.env` 加载；直接 `tsx` 跑脚本时需自行加载 `.env`。

**密钥分层**（勿混用）：
- Worker（`wrangler secret put`）：`CONTENT_SYNC_TOKEN`
- Actions Secrets：paid 回退的 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`；`CONTENT_SYNC_TOKEN`
- Actions Variables：`CONTENT_SYNC_URL`；`TRANSLATION_PROVIDER`（默认 `free`）；可选 `TRANSLATION_PIPELINE` / `MODEL_REASONING_EFFORT` / `FETCH_BACKEND` / 代理相关

## 架构（已上线）

单 Worker 全栈：**Astro SSR 页面 + API 路由 + D1 + ASSETS 静态资源**，一个入口服务全站；内容更新管线在 GitHub Actions 运行。

```
访客 → Cloudflare Worker (blogs-wiki)
  ├─ ASSETS binding → 静态文件（CSS/JS/404/搜索页）
  ├─ Astro SSR 页面（prerender=false）→ 首页/收集册/文章页，从 D1 实时读
  │    ├─ 文章 = 身份（articles 表）+ 多语言版本（article_versions 表）
  │    └─ 博客元数据 = 静态 collection（src/content/blogs/）
  └─ /api/* 路由 → health / sources / content-sync（受保护写入）
```

- binding 访问：`import { env } from 'cloudflare:workers'`（Astro v6+ 已移除 `Astro.locals.runtime.env`）；类型由 `worker-configuration.d.ts`（`wrangler types` 生成）。
- 双 wrangler 配置：`wrangler.jsonc`（dev/build）+ `wrangler.deploy.jsonc`（部署，`main` → `dist/server/_entry.mjs`）；生产配置无 Workflow binding。
- 构建管线：`astro build` 生成 `dist/client` + `dist/server/entry.mjs`；`scripts/inject-worker-entry.js` 生成 `_entry.mjs`（re-export Astro handler）；`wrangler deploy` 打包部署。
- 架构纪律：一次只改一个架构层；改 `worker/` 前必读 `docs/migration-to-cloudflare.md`。

## 内容更新

**生产路径（Actions）**：`.github/workflows/content-update.yml`（cron `17 2 * * *` + `workflow_dispatch`）→ discover → Defuddle fetch → translate → 本地持久化 → `scripts/import-local-articles.mjs --json` → `scripts/sync-local-articles.mjs` 分片调 `/api/content-sync` → D1 幂等写。Action 只上传元数据报告。单文章/单来源失败不拖垮全局。

**Node 开发路径（scripts/update/）**：`npm run update` / `update:dry` / `audit:source`。生产内容以 D1 为准；`src/content/articles/` 与 `src/data/processed-urls.json` 是本地产物（`.gitignore`）。

`POST /api/trigger` 源码已停用并返回 410；Workflow 及 `worker/runtime/update-orchestrator.ts` 仅作实验/回滚，不作为运维依据。

**来源配置**（`src/data/sources.json`，打包进 Worker）：
- 来源必须声明 `update_mode`：`"active"` 进完整更新，`"dry-run-only"` 只参与 dry-run；新增来源先 `dry-run-only`，人工核验后转 `active`。
- 每源默认 3 篇（`--limit` 可调）。无发布日期的来源（如 Paul Graham）无法生成文章，不要加入自动更新。分类只能从 `src/config/categories.ts` 预定义集合选。
- **翻译通道**（`TRANSLATION_PROVIDER`，默认 `free`）：
  - `free`（默认）：OpenAI 兼容网关（loopback 或免费层）。env 配 `OPENAI_BASE_URL` / `TRANSLATION_MODEL` / `MODEL_REASONING_EFFORT`（请求体顶层传 `reasoning_effort`；用 `low`——`high` 会因 reasoning 占满 max_tokens 致翻译输出空）。实测 `deepseek-v4-flash` + `low` ≈ 14s/篇（~27000 字符/min）。客户端已内置 429 退避（最多 2 次）。prompt 可能被留存训练，只传公开内容。
  - `paid`（回退）：三个 Secrets（`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`）。
- 本地网络受限时 `USE_PROXY=true` + `PROXY_URL`（默认 `http://127.0.0.1:7897`）。个别站点（openai.com）拦截 Node TLS 指纹，抓取自动回退系统 `curl`（Node 侧经 `worker/fetch/curl-runner.ts`；Worker 运行时无 curl 则跳过）。

## 路书（docs/，先读再动手）

- `docs/blog-source-registry.md`：来源适配状态登记表，唯一权威。改来源适配前必读。
- `docs/update-pipeline-v2.md`：V2 管线（官方中文优先、AST 保护翻译）。默认 V1 整篇一次；`TRANSLATION_PIPELINE=v2` 显式启用分块；单篇 >100K 字符自动兜底 V2。
- `docs/migration-to-cloudflare.md`：迁移路线图（Phase 1-8 完成，9/10 待做）。改 `worker/` 前必读。
- 来源审计结论直接沉淀进 registry 备注，不留独立报告文件（明细可查 git 历史）。

## Cloudflare 迁移状态

**已完成**：Phase 1-8 + Actions + content-sync + opencode-free（已合入本地 main）。权威进度与 live 证据见 `TODO.md`。

**未闭合（生产门禁，优先于 Phase 9）**：
- 本地 `main` 超前 `origin/main`（含 content-update workflow），需 push。
- 部署含 trigger-410 / 无 Workflow binding 的 Worker；live 复测 `POST /api/trigger/`。
- 配置 `CONTENT_SYNC_*` + 翻译变量；workflow_dispatch 首跑（单源、`limit=1`）。
- Phase 9：Pagefind → D1 FTS5；Phase 10：删文件 backend。

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
