# 当前 TODO（2026-08-12）

## 现役架构（代码）

**站点**：Cloudflare Worker + Astro SSR + D1  
**内容更新（代码已落地，尚未推远端/未做生产首跑）**：GitHub Actions → 本地产物 → `/api/content-sync` → D1  
**翻译默认**：`TRANSLATION_PROVIDER=free`（opencode-free / ocx）；`paid` 回退 Secrets  
**Workflow**：代码与 orchestrator 保留；`wrangler.deploy.jsonc` 已无 workflows binding；`/api/trigger` 源码返回 410

## 生产 live 核对（2026-08-12）

| 检查 | 结果 |
|---|---|
| 用户域名 `https://blogswiki.dpdns.org/` | 200，Astro v7 SSR |
| `/api/health/` | 200，`backend=d1`，`articleCount=29` |
| `/api/sources/` | 200，24 sources |
| 文章页 `/articles/anthropic/building-effective-agents/` | 200 |
| `POST /api/trigger/` | **仍 200 且创建 Workflow instance**（与本地源码 410 不一致 → 生产未部署含 410 的提交） |
| `*.workers.dev` 本机访问 | 连接失败（环境网络限制；用户域名可用） |
| `origin/main` 是否含 Actions workflow | **否**（本地 `main` 超前 3 commit 未 push） |

结论：**读路径 live 可用；写路径新架构仅本地代码完成，未 push / 未部署 / 未端到端首跑。**

## 开放任务（按优先级）

1. 🟨 **推送 + 部署**：`main` 推 origin；`wrangler d1 migrations apply blogs-wiki --remote`（若 0007 未应用）→ `npm run deploy`；复测 `POST /api/trigger/` 应为 410
2. 🟨 **配置 GitHub**：`CONTENT_SYNC_TOKEN` Secret、`CONTENT_SYNC_URL` Variable；`TRANSLATION_PROVIDER`（默认 free）；paid 回退再配 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`；Worker 侧 `wrangler secret put CONTENT_SYNC_TOKEN`
3. 🟨 **首跑真实更新**：`workflow_dispatch`（`dry-run=false`、单源、`limit=1`）核验 free 通道 → content-sync → D1 文章数增长
4. ⬜ **Phase 9**：Pagefind → D1 FTS5（当前搜索索引缺失/降级）
5. ⬜ **Phase 10**：删 FileRepository / persist.ts / processed-urls.json 文件 backend
6. 🟨 **收尾**：`worker-runtime.test.ts` 适配新 API 入口；sitemap 动态化
7. 🟨 **工作区**：大量未提交改动（阅读页/markdown/carousel、docs/sources 清理、vendors logo 等）需整理提交或丢弃

## 文章渲染（本地 WIP，未 commit）

- [x] 段间距 / 代码块 / markdown 基础增强
- [x] testimonial AST 结构化（替代 CSS `:has`/float hack）
- [x] meta 区字号与对齐微调
- [ ] 提交并部署后在真实文章页验收

## 内容更新架构

- [x] Worker + Actions 组合方案（代码）
- [x] content-sync 幂等写入（代码 + 本地测试）
- [x] opencode-free 翻译通道（代码 + workflow 定义）
- [ ] 推远端 + 部署 + 生产首跑验证
