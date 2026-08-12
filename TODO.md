# 迁移 TODO：Phase 8 完成，Phase 9/10 待做

## 当前状态

迁移主链路已打通：更新管线已接 Repository interface（Phase 5）、Worker fetch path 已验证（Phase 6）、Cloudflare Workflow 已实现但不再作为生产更新入口（Phase 7）、网站已上线并全量 SSR 从 D1 实时读取（Phase 8）。生产更新改为 GitHub Actions → Worker `/api/content-sync` → D1。

测试全绿：`check:worker` ✅、`test:worker` 85/85 ✅、`test:d1` 44/44 ✅、`test:update` ✅、`astro check` 0 errors ✅。

## 本轮已完成（2026-08-12）

- ✅ 内容更新架构切换：GitHub Actions 执行发现、Defuddle 抓取、翻译与本地临时产物生成；受保护 `/api/content-sync` 分片接收并幂等写入 D1。
- ✅ Action 支持定时与手动运行，失败报告归档；正文不进入 git 或 artifact。
- ✅ 生产 wrangler 配置移除 Workflow binding；`/api/trigger` 返回 410，避免误触发旧生产路径。
- ✅ opencode-free 免费翻译通道经 ocx 网关接入（`TRANSLATION_PROVIDER=free` 默认；paid 回退 secrets）。

- ✅ 文章页 500 修复并上线验证：根因是 `src/lib/server/content.ts` 的 `listArticlesByBlog` 把 snake_case 行直接强转 `ArticleListItem`，`relatedArticle.publishedAt` undefined → `toISOString()` 抛 RangeError。已加 `ArticleListRow` + `.map()` 映射；本地 `wrangler dev` 与生产 `/articles/anthropic/building-effective-agents/`（含 `/en/`）均 200。
- ✅ SEO canonical/og:url 修复：`astro.config.mjs` 的 `site` 缺省回退生产域名（原回退 localhost:4321）；生产 HTML 已验证。
- ✅ SSR 防御加固：`parseDateSafe`（非法/缺失日期不再整页 500）、markdown 高亮初始化失败降级、单代码块高亮失败隔离、`[lang]` 语言白名单兜底。
- ✅ 清理残留 `wrangler dev`/`workerd` 进程（两个 dev 会话，端口 8795/8796），修复 dist 被锁导致的构建静默失败。

## 已完成摘要（Phase 3-8）

- **Phase 3**：D1 schema + migrations（0001-0005：initial schema / seed categories / seed sources / drop source_runs FK / articles 拆分 article_versions）✅
- **Phase 4**：D1Repository（ArticleRepository / SourceStateRepository，44/44 测试）✅
- **Phase 5**：管线接 repository interface（Node 默认 `STORAGE_BACKEND=file`，Worker `env.DB` → D1 repository 注入）✅
- **Phase 6**：Worker-compatible fetch path（`FETCH_BACKEND=node|worker`，注入式 curl 回退）✅
- **Phase 7**：Workflow 运行时 ✅ —— UpdateWorkflow 代码保留，但生产 binding 已停用；生产内容更新由 GitHub Actions 负责
- **Phase 8**：Astro 切 D1 ✅ —— 网站上线 https://blogs-wiki.1323593614.workers.dev；首页/博客页/文章页 SSR 从 D1 实时读取；`/api/health` `/api/sources` 可用，`/api/trigger` 已停用并返回 410

## 剩余任务（按优先级）

1. 🟨 在 GitHub 仓库配置 `CONTENT_SYNC_TOKEN` Secret、`CONTENT_SYNC_URL` Variable；`TRANSLATION_PROVIDER`（默认 free）；付费回退时再配 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL`
2. 🟨 首跑真实更新验证：workflow_dispatch（`dry-run=false`、单源、`limit=1`）核验 opencode-free → 分片同步 → 线上 D1 文章数增长
3. ⬜ Phase 9：搜索切 FTS5 —— Pagefind → D1 FTS5（Pagefind 在 Windows 有路径问题，构建脚本已临时移除，Phase 9 彻底替换）
4. ⬜ Phase 10：删除旧文件 backend —— FileRepository / persist.ts / processed-urls.json / .gitignore 清理
5. 🟨 清理：`worker/index.ts` 已不再作为入口（API 迁移到 `src/pages/api/`），`worker-runtime.test.ts` 需适配新架构
6. 🟨 Phase 8 收尾（SEO）：sitemap 动态化（server 模式下 sitemap-index.xml 不含动态文章 URL，Phase 9 一并处理）

# 文章渲染 TODO：

- [x] 段间距优化
- [x] 代码块优化
- [x] markdown渲染优化（标题层级、表格横滑、相对图片 URL 规范化）

# 内容更新架构 TODO：

- [x] 调整为 Cloudflare Worker + GitHub Actions 组合架构（`.github/workflows/content-update.yml` 落地，opencode-free 免费翻译通道经 ocx 网关接入）
- [x] Cloudflare Worker 保留线上站点、API 与 D1 访问职责
- [x] GitHub Actions 承担内容更新管线执行职责
- [x] 暂不启用 Cloudflare Workflow 承担重计算内容管线
- [ ] 首跑真实更新验证：workflow_dispatch（`dry-run=false`、单源、`limit=1`）+ 配置 `CONTENT_SYNC_*` 后 `/api/content-sync` 导入 D1
