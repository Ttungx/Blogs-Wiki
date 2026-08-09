# AGENTS.md

Astro + Pagefind 博客收藏站（Demo/MVP）。内容发现、抓取、翻译、分类、持久化管线在 `scripts/update/`，由 tsx 直接运行，不经 Astro 构建。仓库语言为中文，文档与提交信息用中文。

## 命令

要求 Node.js 24 + npm。

```bash
npm run check       # astro check（类型检查）
npm run test:update # 离线冒烟测试更新管线，无需密钥/网络，改 scripts/update/ 后必跑
npm run build       # astro build + pagefind --site dist
npm run update:dry  # 预演更新：真实网络发现+抓取，不翻译、不写任何文件
npm run update      # 完整增量更新，写文章与状态
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
- `docs/update-pipeline-v2.md`：V2 管线设计（官方中文优先、AST 保护翻译、审计门槛）。当前生产仍 V1，V2 仅审计与纯函数，不写文章。
- `docs/sources/`：逐站验证报告（如 `scaffold-validation-2026-08-09.md`）。

## 管线结构

`scripts/update/index.ts` 编排入口；`discovery.ts`（RSS→Sitemap→列表页三级）、`fetch.ts`（Readability+Turndown）、`translate.ts`、`classify.ts`（分类只能从 `src/config/categories` 预定义集合选）、`persist.ts`（文章+状态）、`audit.ts`（只读审计）、`smoke.ts`（离线测试）。`src/pages/` 为站点页面，`src/content/blogs/` 为博客元数据（可提交），`articles/` 为管线产物（不提交）。

## CI

`.github/workflows/pages.yml`：更新 job 以 bot 身份 commit 并 push 后，构建 job 检出该精确 commit。三个翻译 Secrets 缺失时自动跳过更新但照常部署。定时 `02:17 UTC`，手动运行默认 `run_update=false`。
