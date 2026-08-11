# AGENTS.md

Astro SSR + Cloudflare Workers 博客收藏站（**已上线**：`https://blogs-wiki.1323593614.workers.dev`）。内容发现、抓取、翻译、分类、持久化由 Cloudflare Workflow 在边缘运行并写入 D1；网站由 Astro SSR 从 D1 实时读取，新文章写入 D1 后立即可访问（无需 rebuild）。仓库语言为中文，文档与提交信息用中文。

## 命令

要求 Node.js 24 + npm。

```bash
npm run dev              # astro dev 本地开发（platformProxy 访问本地 D1）
npm run check            # astro check（类型检查 src/）
npm run check:worker     # tsc 类型检查 worker/ + worker-configuration.d.ts
npm run test:update      # 离线冒烟测试 Node 更新管线，改 scripts/update/ 后必跑
npm run test:worker      # worker/ 模块测试（node:test，66 个）
npm run test:d1          # D1 集成测试（vitest-pool-workers，28 个）
npm run build            # astro build + scripts/inject-worker-entry.js（生成 dist/）
npm run deploy           # npm run build + wrangler deploy --config wrangler.deploy.jsonc
npm run preview:worker   # npm run build + wrangler dev（本地预览 Worker）
npm run update:dry       # Node 开发路径预演：真实网络发现+抓取，不翻译、不写文件
npm run update           # Node 开发路径完整增量更新，写文章与状态（生产走 Workflow，见下）
npm run update -- --source openai --limit 5
npm run audit:source -- --source langchain   # 只读来源审计，不写文件
```

env 由 npm scripts 经 `--env-file-if-exists=.env` 加载；直接 `tsx` 跑脚本时需自行加载 `.env`。生产 Secrets（`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`）用 `npx wrangler secret put` 注入。

## 架构（已上线）

单 Worker 全栈：**Astro SSR 页面 + API 路由 + UpdateWorkflow + D1 + ASSETS 静态资源**，一个入口服务全站。

```
访客 → Cloudflare Worker (blogs-wiki)
  ├─ ASSETS binding → 静态文件（CSS/JS/404/搜索页）
  ├─ Astro SSR 页面（prerender=false）→ 首页/博客收集册/文章阅读页，从 D1 实时读取
  │    ├─ 单篇文章 = 身份（articles 表）+ 多语言版本（article_versions 表）
  │    └─ 博客元数据 = 静态 Astro collection（src/content/blogs/，可提交）
  ├─ /api/* 路由 → health / sources / trigger
  └─ UpdateWorkflow → discover → fetch → translate → persist（写入 D1）
```

- **SSR 页面访问 binding**：`import { env } from 'cloudflare:workers'`（Astro v6+ 已移除 `Astro.locals.runtime.env`）。binding 类型由 `worker-configuration.d.ts`（`wrangler types` 生成）提供。
- **双 wrangler 配置**：`wrangler.jsonc`（dev/build，无 workflows binding 与 main——adapter 构建期会校验 main 存在且 Miniflare 要求 binding 的类导出）；`wrangler.deploy.jsonc`（部署，含 workflows binding，`main` → `dist/server/_entry.mjs`）。
- **构建管线**：`astro build` 生成 `dist/client`（静态）+ `dist/server/entry.mjs`（Worker）；`scripts/inject-worker-entry.js` 生成 `dist/server/_entry.mjs`（re-export Astro handler + `UpdateWorkflow` 导出）；`wrangler deploy --config wrangler.deploy.jsonc` 打包部署。
- **改架构层的纪律**：一次只改一个架构层（`BLOGS_WIKI_CLOUDFLARE_MIGRATION_PHILOSOPHY.md` §21）；改 `worker/` 前必读路线图与哲学手册。

## 内容更新（两条路径）

**生产路径（Cloudflare Workflow）**：`POST /api/trigger`（body：`{ sourceId?, limit?, dryRun? }`）或 Cron schedules 触发 `UpdateWorkflow` → per-source `step.do()`（retry + timeout）→ `worker/runtime/update-orchestrator.ts` 编排 discover → fetch → translate → persist。单文章/单来源失败不拖垮全局，状态记录在 `source_runs`（运行级）+ `source_items`（文章级状态机）。

**Node 开发路径（scripts/update/）**：`npm run update` / `update:dry` / `audit:source`，用于开发、审计、预演。生产内容以 D1 为准，Node 路径的 `src/content/articles/` 与 `src/data/processed-urls.json` 是本地产物（`.gitignore`），不要手工编辑后指望提交。

**来源配置**（`src/data/sources.json`，打包进 Worker）：
- 来源必须显式声明 `update_mode`：`"active"` 进完整更新，`"dry-run-only"` 只参与 dry-run。新增来源一律先 `dry-run-only`，人工核验后再改 `active`。
- 每源默认 3 篇（`--limit` 可调）。无发布日期的来源（如 Paul Graham）无法生成文章，不要加入自动更新来源。
- 分类只能从 `src/config/categories` 预定义集合选。
- 翻译必填三个 Secrets；本地网络受限时 `USE_PROXY=true` + `PROXY_URL`（默认 `http://127.0.0.1:7897`）。个别站点（openai.com）拦截 Node TLS 指纹，抓取自动回退系统 `curl`（Node 侧通过 `worker/fetch/curl-runner.ts` 注册，Worker 运行时无 curl 则跳过回退）。

## 路书（docs/，先读再动手）

- `docs/blog-source-registry.md`：所有来源的适配状态登记表 + 当前推进顺序，唯一权威。改来源适配、审核候选来源前必读。
- `docs/update-pipeline-v2.md`：V2 管线设计（官方中文优先、AST 保护翻译、审计门槛）。官方中文/原生中文直通与分类解耦已接线；分块翻译执行器用 `TRANSLATION_PIPELINE=v2` 显式启用，默认仍 V1。
- `docs/migration-to-cloudflare.md`：Cloudflare 迁移路线图（10 阶段，Phase 1-8 完成，Phase 9/10 待做）。改 `worker/` 前必读。
- `docs/sources/`：逐站验证报告（如 `scaffold-validation-2026-08-09.md`）。

## Cloudflare 迁移状态

**已完成（Phase 1-8）**：领域模型 + 接口防火墙 → FileRepository → D1 schema（0001-0005，含 articles/article_versions 拆分）→ D1Repository → Node 管线接 repository interface → Worker-compatible fetch（Defuddle 提取器）→ Workflow 运行时（dry-run 端到端验证）→ Astro SSR 从 D1（网站上线）。

**待办（Phase 9/10 + 收尾）**：
- 注入生产 Secrets 并全量运行 Workflow（真实翻译，D1 填充文章）。
- 启用 Cron schedules（`wrangler.deploy.jsonc` 的 workflows binding 加 `"schedules": ["17 2 * * *"]`，对应原 CI 的 02:17 UTC）。
- Phase 9：Pagefind → D1 FTS5 搜索（Pagefind 目前在 Windows 构建有路径问题，已从 build 脚本移除）。
- Phase 10：删除旧文件 backend（FileRepository / persist.ts / processed-urls.json）。
- 清理：`worker/index.ts` 已不再作为 Worker 入口（API 已迁移到 `src/pages/api/`）；`worker/__tests__/d1/worker-runtime.test.ts` 仍测旧 HTTP handler，需适配新架构。

详见 `docs/migration-to-cloudflare.md` 与 `TODO.md`。
