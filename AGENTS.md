# AGENTS.md

Astro + Pagefind 博客收藏站（Demo/MVP）。内容发现、抓取、翻译、分类、持久化管线在 `scripts/update/`，由 tsx 直接运行，不经 Astro 构建。仓库语言为中文，文档与提交信息用中文。

## 命令

要求 Node.js 24 + npm。

```bash
npm run check         # astro check（类型检查 src/）
npm run check:worker  # tsc 类型检查 worker/（迁移奠基模块）
npm run test:update   # 离线冒烟测试更新管线，无需密钥/网络，改 scripts/update/ 后必跑
npm run test:worker   # worker/ 模块测试（domain 纯函数 + FileRepository）
npm run build         # astro build + pagefind --site dist
npm run update:dry    # 预演更新：真实网络发现+抓取，不翻译、不写任何文件
npm run update        # 完整增量更新，写文章与状态
npm run update -- --source openai --limit 5
npm run audit:source -- --source langchain   # 只读来源审计，不写文件
```

env 由 npm scripts 经 `--env-file-if-exists=.env` 加载；直接 `tsx` 跑脚本时需自行加载 `.env`。

## 内容更新规则（易错）

- 当前处于未上线开发阶段，`src/content/articles/` 与 `src/data/processed-urls.json` 在 `.gitignore` 中，不入库：是管线产物，不要手工编辑后指望提交；改逻辑在 `scripts/update/`。
- 来源必须显式声明 `update_mode`：`"active"` 进完整更新，`"dry-run-only"` 只参与 dry-run（配置校验门禁，见 `scripts/update/config.ts`）。新增来源一律先 `dry-run-only`，人工核验后再改 `active`。
- 完整更新按 `src/data/processed-urls.json` 增量处理，每源默认 3 篇（`--limit`）。无发布日期的来源（如 Paul Graham）无法生成文章，不要加入自动更新来源。
- 翻译必填 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`；`OPENAI_BASE_URL` 可到版本根或完整端点。本地网络受限时 `USE_PROXY=true` + `PROXY_URL`（默认 `http://127.0.0.1:7897`）。个别站点（openai.com）拦截 Node TLS 指纹，抓取自动回退系统 `curl`。
- 更新失败不阻塞其他来源与退出码；仅配置错误/来源不存在时非零退出。

## 路书（docs/，先读再动手）

- `docs/blog-source-registry.md`：所有来源的适配状态登记表 + 当前推进顺序，唯一权威。改来源适配、审核候选来源前必读。
- `docs/update-pipeline-v2.md`：V2 管线设计（官方中文优先、AST 保护翻译、审计门槛）。官方中文/原生中文直通与分类解耦已接线；分块翻译执行器用 `TRANSLATION_PIPELINE=v2` 显式启用，默认仍 V1。
- `docs/migration-to-cloudflare.md`：Cloudflare Workers/Workflows/D1 迁移路线图（10 阶段，当前 Phase 1-4 完成，Phase 5/6 部分完成）。底层哲学见仓库根 `BLOGS_WIKI_CLOUDFLARE_MIGRATION_PHILOSOPHY.md`。改 `worker/` 前必读。
- `docs/sources/`：逐站验证报告（如 `scaffold-validation-2026-08-09.md`）。

## 管线结构

`scripts/update/index.ts` 编排入口；`discovery.ts`（RSS→Sitemap→列表页三级）、`fetch.ts`（Readability+Turndown）、`translate.ts`、`classify.ts`（分类只能从 `src/config/categories` 预定义集合选）、`persist.ts`（文章+状态）、`audit.ts`（只读审计）、`smoke.ts`（离线测试）。`src/pages/` 为站点页面，`src/content/blogs/` 为博客元数据（可提交），`articles/` 为管线产物（不提交）。

## Cloudflare 迁移（进行中）

项目正从 GitHub Actions + 静态站点迁移到 Cloudflare Workers / Workflows / D1。`worker/` 是迁移奠基模块，当前与 `scripts/update/` 老管线并存：

- `worker/domain/`：领域模型（camelCase）+ 纯函数（articleIdFromUrl / buildArticleFrontmatter 等，与 persist.ts 字节对齐）。
- `worker/repositories/`：接口防火墙（`ArticleRepository` / `SourceStateRepository`），业务层只依赖接口，不感知 File / D1 差异。
- `worker/repositories/file/`：文件后端实现，行为与 `scripts/update/persist.ts` 一致，过渡期读写同一目录不冲突。
- `worker/__tests__/`：46 个 Node 测试 + 18 个 D1 测试，含锚定老管线的黄金输出。

**当前进度**：Phase 1-4 完成；Phase 5 已让 Node 更新管线走 Repository interface，并完成 Worker `env.DB` → D1 repository 注入；Node 默认 `STORAGE_BACKEND=file`，完整更新编排留到 Phase 7 Workflow；Phase 6 已接入 `FETCH_BACKEND=node|worker` 抽象，真实来源对照与生产运行时验证仍待补。详见 `docs/migration-to-cloudflare.md`。改 `worker/` 前必读该路线图与哲学手册；一次只改一个架构层（手册 §21）。

## CI

> 注：`.github/workflows/pages.yml` 已删除（迁移到 Cloudflare Workflows + Cron Triggers，见上）。下方描述为历史状态，将在 Phase 7 重建为 Cloudflare Workflow。

原 `pages.yml`：更新 job 以 bot 身份 commit 并 push 后，构建 job 检出该精确 commit。三个翻译 Secrets 缺失时自动跳过更新但照常部署。定时 `02:17 UTC`，手动运行默认 `run_update=false`。
