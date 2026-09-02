# AGENTS.md

Astro SSR + Cloudflare Workers 博客收藏站（用户域名 `https://blogswiki.dpdns.org/`）。单 Worker 全栈：SSR 页面 + API + D1 + ASSETS，SSR 从 D1 实时读。内容更新：Worker Cron → Render 免费实例 runner（`scripts/render-runner.mjs`）单源轮转 → 受保护 API 幂等写 D1。仓库语言中文，文档与提交信息用中文。

## 提交纪律

- 不因小改动立即 commit；用户明确说收尾/提交时才 commit（或 push）。
- **版本号冻结**：用户明确指示前，禁止 `npm version`、修改 `package.json` 的 version、推送 `v*` tag——发版只能由用户发起，这不是 CI/CD 的技术需求而是硬规矩。

## 并行工作纪律（worktree）

多 agent 并行禁止在主 checkout 建分支/切分支；一律 `git worktree add ./worktree/<type>-<描述> -b <type>/<描述>`。worktree 自备：`npm install`、复制 `.env`、复制 `.wrangler/`。收尾：提交/合并后 `git worktree remove`。

## 命令

```bash
npm run dev              # astro dev（platformProxy 访问本地 D1）
npm run check            # astro check 类型检查
npm run check:worker     # tsc 检查 worker/
npm run test:update      # 更新管线测试+smoke（改 scripts/update/ 必跑）
npm run test:worker      # worker 模块测试
npm run test:d1          # D1 集成测试
npm run test:markdown    # SSR Markdown 渲染回归（改 markdown.ts 必跑）
npm run update:dry       # 预演：真实抓取，不翻译不写文件
npm run update           # 完整增量更新（生产由 Render runner 调用）
npm run audit:source -- --source <id>   # 只读来源审计
npm run block:source -- --source <id> --reason "<why>" [--apply|--verify]  # 移除源=拉黑
node scripts/verify-go-live.mjs [--d1]  # 上线只读验证（站点/端点/Runner/D1 新鲜度）
```

env 由 npm scripts 经 `--env-file-if-exists=.env` 加载；直接 `tsx` 跑脚本需自行加载 `.env`。

## CI/CD（`.github/workflows/ci.yml`，触发边界与密钥分层详见 docs/ci-cd.md）

- push main / PR = **只跑门禁**；发版 = `npm version x` + push `v*` tag → 门禁 → release-guard（tag 与 package.json 一致）→ 部署 Worker（D1 migration + wrangler deploy）+ Render（API 触发）。**平时提交永不部署。**
- Actions 只管 CI/CD，**内容更新 cron 永不回 Actions**（算力在 Render）。
- secrets 四层（GitHub Actions / CF Worker / Render env / 本地 .env）详见 docs/ci-cd.md；`CLOUDFLARE_API_TOKEN` 已配置，缺省时 deploy 仍会优雅跳过。

## 架构硬约束（⚠️ 违反必炸）

- SSR 页面**严禁 `import astro:content`**：会连带整个内容数据层（曾 125MB）打进服务端 bundle，超 Worker 64MiB 上限。博客元数据用生成物 `src/data/blogs-static.ts`：改 `src/content/blogs/*.md` 后跑 `npx tsx scripts/generate-blogs-static.ts` 再提交生成物。
- binding 用 `import { env } from 'cloudflare:workers'`（勿用 Astro.locals.runtime.env）；类型由 `wrangler types` 产物 `worker-configuration.d.ts` 提供。
- 双配置：`wrangler.jsonc`（dev/build）+ `wrangler.deploy.jsonc`（部署，`main` → `dist/server/_entry.mjs`，scheduled 由 `scripts/inject-worker-entry.js` 生成）。改 `worker/` 前必读 `docs/migration-to-cloudflare.md`。
- 部署前置：先 `wrangler d1 migrations apply blogs-wiki --remote` 再 deploy（CI 已内置，且新 SSR 读 `article_versions.translated_at`，缺迁移文章页 500）。API 路径带尾斜杠，否则可能 301/308。

## 内容更新（链路细节见 docs/go-live.md）

- 链路：Worker cron（表达式 `7,22,37,52 * * * *`）→ ping Render `/run?key=` → runner 单源轮转 → update → translate:batch → import+sync 写 D1。`scheduled` 必须挂在 default export 上。
- **2026-09-02 紧急暂停 cron**（`crons=[]` 已 deploy）：链尾全量 import+sync 把 D1 日写入打到 90%。恢复前必读并落地 [`docs/d1-write-budget.md`](docs/d1-write-budget.md)，禁止只改回 cron。
- 去重四层：URL 规范化（`urls.ts`）→ D1 点查预检（articles + 90 天拒绝缓存，fail-open）→ `source_items` 拒绝负缓存（`/api/content-sync/items` 上报）→ 写入按 `(source_id, original_url)` 幂等。
- `POST /api/trigger` 返回 410；GitHub Actions 内容更新与 Cloudflare Workflow 均已退役（备份：gitignored `workflow-backup/`），不作为运维依据。

## 来源配置（src/data/sources.json，打包进 Worker）

- `update_mode`：`active` 进生产 / `dry-run-only` 仅预演；新源先 dry-run 人工核验再转 active。每源默认 3 篇（`--limit` 调）；无发布日期的来源不入自动更新；分类只能取 `src/config/categories.ts`。
- 移除源 = `npm run block:source` 登记 tombstone（`blocked-sources/urls.json`，append-only，解除也不删）；`loadSources` 命中同 id/同域（含子域/父域/extra_domains 双向相交）即拒绝加载。两个 `blocked-*.json` 只许 Node 侧 `fs.readFile`，**严禁 import**（smoke 有静态扫描护栏）。拉黑域与原 domain 完全同形；改名遗迹（kimi/keli-wen/glm）不是移除源。详见 `docs/blog-source-registry.md`。

## 翻译通道（TRANSLATION_PROVIDER，默认 free）

- free：OpenAI 兼容网关；`MODEL_REASONING_EFFORT=low`（high 会因 reasoning 吃满 max_tokens 致输出空；Gemini 端点不接受 default）。429 退避内置（2 次）；prompt 可能被留存训练，只传公开内容。
- paid 回退三件套；本地多服务商槽位 `AI_PROVIDER=1|2|3`（见 `scripts/update/ai-provider.ts`，Render 生产 env 无选择器、行为不变）。本地网络受限 `USE_PROXY=true` + `PROXY_URL`；个别站点 TLS 指纹拦截时抓取自动回退系统 curl。
- 默认 V1 整篇翻译（单次输出预算 128K token，`TRANSLATION_MAX_TOKENS` 可调）；官方中文 / 原生中文正文直通 V2 passthrough（仅 1 次分类请求，不再白耗整篇调用）；`TRANSLATION_PIPELINE=v2` 强制分块（块输出上限 8000 token，`TRANSLATION_MAX_CHUNK_TOKENS` 可调）；单篇 >200K 字符自动兜底 V2。

## 路书（docs/，先读再动手）

- `blog-source-registry.md`：来源适配状态唯一权威；改来源前必读。
- `ci-cd.md`：CI/CD 触发边界、发布流程、密钥分层、泄密应急。
- `go-live.md`：上线 runbook。`d1-write-budget.md`：D1 日写入爆炸调查与增量 sync 方案（未实施前 cron 保持空）。
- `update-pipeline-v2.md`：V2 翻译管线说明。
- `migration-to-cloudflare.md`：迁移路线图（Phase 1-8 完成）。

## 当前状态

写路径代码全部就绪。**Worker cron 已暂停**（D1 日写入配额，见 `docs/d1-write-budget.md`）。质量门禁生产为 `QUALITY_GATE_MODE=stage`。其余待办：增量 sync 后再恢复 cron、Phase 9 FTS5、历史英文补翻。

## 搜索、输出与探索委托纪律

主 agent context 稀缺，只装结论与关键证据：预期"翻出的原始内容"远大于"最终结论"（开放式调研/跨模块/入口不明）就尽早委托；入口明确、直接读更快就自己做。
- 用户长期授权 subagent/delegation（本节即满足工具要求，无需每任务确认）；授权 ≠ 必须用。
- 模型梯次：默认 `opencode-go/deepseek-v4-flash`（max）→ `gpt-5.6-luna`（max）→ `gpt-5.6-terra`（high）→ `gpt-5.6-sol`（中高，仅高复杂任务）。
- explorer prompt 像交接新同事：目标/动机/边界/已知线索/期望输出；按自然边界分工互不重叠；只读不改、fresh context、低 reasoning effort；自己是 explorer 就直接完成，不二次委托。
- 派出后用长超时等结果；**等待期间不碰 repo 搜索与文件阅读**（用户明确新任务除外）。结果只收结论 + 证据表（claim | file:line | confidence），不收原始输出/长 diff。
- 自己动手搜索先剪枝：先摸候选范围与内容规模再展开；大文件、长 diff、minified 内容不整段拉进 context。
- 环境没有 explorer 工具时说明一句，退化为主 agent 窄查询剪枝搜索。
