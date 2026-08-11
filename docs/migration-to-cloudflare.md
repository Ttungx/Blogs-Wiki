# Blogs Wiki → Cloudflare 迁移路线图

> 配套文档：`BLOGS_WIKI_CLOUDFLARE_MIGRATION_PHILOSOPHY.md`（迁移哲学手册，底层原则）。
> 本文件是该手册 Phase 21「Agent 重构纪律」的可执行路线图：每个 Phase 的目标、涉及文件、完成标准、回滚策略。

## 一句话哲学

> 先解耦，再迁移；先数据，后运行时；先保证幂等和状态，再追求自动化；内容更新不等于代码部署；Cloudflare 是执行平台，不是架构本身。

## 当前状态

| Phase | 状态 | 说明 |
|---|---|---|
| 1. domain types + repository interfaces | ✅ 完成 | `worker/domain/`、`worker/repositories/` 接口定义 |
| 2. FileRepository（与旧行为字节对齐） | ✅ 完成 | `worker/repositories/file/`，46 个 Node 测试全绿 |
| 3. D1 schema + migrations | ✅ 完成 | `worker/migrations/0001_initial_schema.sql` + `0002_seed_categories.sql`，本地数据库当前无待应用迁移 |
| 4. D1Repository | ✅ 完成 | `D1ArticleRepository` / `D1SourceStateRepository`，真实 Miniflare D1 binding 测试 18/18 通过 |
| 5. 管线接 repository interface | 🟨 Node File + Worker D1 注入已接线，Workflow 编排待补 | `runUpdate()` 已从 CLI 参数解析中抽出并支持依赖注入；File/D1 后端保持可替换；更新 Workflow 仍属 Phase 7 |
| 6. Worker-compatible fetch path | 🟨 本地 Worker runtime 已验证，真实来源对照待补 | `FETCH_BACKEND=node|worker` 已接入 Node 管线；Miniflare D1 测试覆盖 `/extract`、`/storage/health`、健康检查和 404；仍需独立 `wrangler dev` 与 Tier A Node/Worker A/B 证据 |
| 7. Workflow 运行时 | ⬜ | Cloudflare Workflow 编排 + Cron Trigger |
| 8. Astro 切 D1 | ⬜ | getCollection → ArticleRepository，SSR |
| 9. 搜索切 FTS5 | ⬜ | Pagefind → D1 FTS5 |
| 10. 删除旧文件 backend | ⬜ | 移除 FileRepository / persist.ts / Pagefind |

---

## 接下来开发顺序

按以下门禁推进，不跨层并行修改：

1. **先收口 Phase 6**：本地 Worker runtime smoke 已纳入 D1 测试；剩余门禁是在 `wrangler dev` 下验证 `/extract` 与 `/storage/health`，对 Tier A 来源做 Node / Worker A/B 抓取对照，并记录正文、元数据、公式和耗时证据。
2. **再做 Phase 7**：先解决远程 D1 `database_id` 与 Cloudflare Secrets 注入方案，再补 `source_items` 状态机与 `source_runs` 运行记录；随后实现 discover → fetch → translate → persist 的 Workflow steps，最后接 Cron，保留手动触发和 Node 回滚路径。
3. **然后做 Phase 8**：Cloudflare adapter + hybrid/SSR，只迁移文章列表、来源页、阅读页和计数；先保持静态资源与旧构建链路可回滚。
4. **最后做 Phase 9/10**：D1 FTS5 查询稳定后再移除 Pagefind；确认 D1 唯一真相、Workflow 可恢复、SSR 可读、搜索实时后，才删除 File backend 和文件状态产物。

当前最近的唯一主线是 **Phase 6 验证 → Phase 7 Workflow**。Phase 8 之前不改 Astro 数据读取，Phase 9 之前不删除 Pagefind。

---

## 架构原则摘要（手册 §0-2）

**核心判断标准**（每引入一个新 Cloudflare 服务都要过这 6 条）：

1. 是否降低长期复杂度？
2. 是否让失败边界更清楚？
3. 是否让内容更新与代码发布分离？
4. 是否让本地开发和测试仍然简单？
5. 是否方便未来接入 X Articles、Substack 等新 Source Adapter？
6. 是否可以替换底层实现，而不破坏上层业务？

**D1、Workflows、Static Assets 是核心。Queues、Browser、R2 等按需求出现，不提前堆。**

**第一版目标**：1 Worker app + 1 D1 + 1 Workflow + 1 codebase。复杂度必须由真实瓶颈购买（手册 §16）。

---

## Phase 详解

### Phase 1：domain types + repository interfaces ✅

**目标**：在业务逻辑与持久化之间建立接口防火墙（手册 §5：Repository 是迁移的第一道防火墙）。

**产出**：
- `worker/domain/types.ts` —— 领域模型（全 camelCase）：`SourceConfig`、`RawArticle`、`TranslationResult`、`ArticleRecord`、`SaveArticleInput`、`ProcessedStateSnapshot` 等。
- `worker/domain/article.ts` —— 纯函数：`articleIdFromUrl`、`buildArticleFrontmatter`、`parseArticleFrontmatter`、`excerptFromMarkdown`。
- `worker/repositories/article-repository.ts` —— `ArticleRepository` 接口：`getById` / `getByOriginalUrl` / `listBySource` / `listAll` / `save` / `exists`。
- `worker/repositories/source-state-repository.ts` —— `SourceStateRepository` 接口：`hasSeen` / `markProcessed` / `listProcessed` / `loadAll` / `reconcile`。

**完成标准**：纯类型/接口，零运行时依赖，Workers / Node 通用。

**回滚**：删除 `worker/` 目录即可，对老管线零影响。

---

### Phase 2：FileRepository（与旧行为字节对齐） ✅

**目标**：实现接口的文件后端，行为与 `scripts/update/persist.ts` + `index.ts:106-135 reconcileProcessed` 逐字节对齐。过渡期与老管线并存，读写同一目录不冲突。

**产出**：
- `worker/repositories/file/file-article-repository.ts` —— `FileArticleRepository`，幂等 save（复刻 persist.ts:152-165）、slug 冲突解决、无 publishedAt 抛错、目录扫描读方法。
- `worker/repositories/file/file-source-state-repository.ts` —— `FileSourceStateRepository`，新版 `{version,updated_at,blogs}` 与旧版扁平 `{blogId:[urls]}` 兼容（复刻 persist.ts:19-43）、幂等 markProcessed、reconcile 语义复刻 index.ts:106-135。
- `worker/repositories/file/paths.ts` —— 路径常量（与 persist.ts:11-13 一致）。
- `worker/__tests__/` —— 46 个 Node Worker 测试：纯函数黄金输出（锚定与 persist.ts 字节一致）+ Repository 与 fetch backend 覆盖。

**关键纪律**：
- `scripts/update/` 零改动（git diff 该目录为空）。
- `npm run test:update` 输出与本次工作前完全一致。
- 纯函数复制（article.ts 复刻 persist.ts/urls.ts）——过渡期允许重复实现，不允许失去退路（手册 §15）。Phase 5 接线后消除重复。

**完成标准**：
- `npm run check:worker` 类型检查通过。
- `npm run test:worker` 46 测试全绿。
- `npm run test:update` 老管线 smoke 全绿（零回归）。

**回滚**：删除 `worker/repositories/file/` + `worker/__tests__/` 即可。

---

### Phase 3：D1 schema + migrations ✅

**目标**：把"文件不是数据库"（手册 §4）落到 D1。设计 articles / source_items / source_runs 表 + migrations + wrangler.toml 脚手架。不接 Worker/Workflow 运行时，不碰前端。

**关键设计**：
- `articles` 表：字段映射自 `ArticleRecord`（Phase 1 已定义）。`UNIQUE(source_id, original_url)` 作为幂等不变量（手册 §18）。
- `source_items` 表：把"处理过没有"升级为状态机（手册 §6）——`discovered` / `fetching` / `fetched` / `translating` / `published` / `skipped` / `failed`。至少含 `id` / `source_id` / `original_url` / `published_at` / `discovered_at` / `status` / `attempt_count` / `last_error` / `article_id` / `updated_at`。
- `source_runs` 表：observability（手册 §20）——每次更新周期的成功/失败/阶段统计。
- `categories` 配置表：受控集合（现 `src/config/categories.ts`）。
- `sources` 表：合并 `src/data/sources.json`（管线配置）与 `src/content/blogs/*.md`（站点展示）两份冗余注册表。

**Schema 原则**：为未来留空间但不造字段森林（手册 §17）。平台特有信息进 `metadata JSON`，直到成为真实查询需求。

**涉及文件**：`worker/migrations/*.sql`、`wrangler.toml`（或 `wrangler.jsonc`）。

**完成标准**：`wrangler d1 migrations apply --local` 通过；schema 经团队评审。

**回滚**：migrations 是新增，不破坏现有文件 backend。

---

### Phase 4：D1Repository ✅

**目标**：实现 D1 后端的 Repository。业务层零改动——调用方只依赖 interface（Phase 1 已建立）。

**产出**：
- `worker/repositories/d1/d1-article-repository.ts` —— 实现 `ArticleRepository`，全部用 D1 prepared statements + upsert。
- `worker/repositories/d1/d1-source-state-repository.ts` —— 实现 `SourceStateRepository`（source_items 表的简化视图）或扩展为状态机接口。

**关键约束**：
- 所有写操作 upsert / transaction（手册 §18 幂等原则）。
- `UNIQUE(source_id, original_url)` 保证同一原文只收录一次。
- 翻译 step 重试不能多插记录。

**涉及文件**：`worker/repositories/d1/`。

**完成标准**：与 FileRepository 相同的测试套件（适配 D1）全绿；真实 D1 binding 已由 `@cloudflare/vitest-pool-workers` 验证，独立 `wrangler dev` HTTP smoke 留作后续运行时门禁。

**回滚**：D1 后端尚未接入更新管线；继续使用 FileRepository 路径即可。若需撤销本阶段，移除 D1Repository 实现不影响旧管线。

---

### Phase 5：管线接 repository interface 🟨 Node File + Worker D1 已接线，Workflow 编排待补

**目标**：让 `scripts/update/index.ts` 的 `run()` 通过 Repository 接口持久化，不再直接调 `persist.ts` 的 `writeArticle` / `loadProcessedState`。这是消除 Phase 2 纯函数重复的时机。

**涉及文件**：
- `scripts/update/index.ts`：`writeArticle` → `repo.save()`、`loadProcessedState`/`isProcessed`/`markProcessed` → `stateRepo.*`、`reconcileProcessed` → `stateRepo.reconcile()`。
- `scripts/update/repository-factory.ts`：按 `STORAGE_BACKEND` 选择 File/D1；Node CLI 的 D1 路径要求外部注入 `D1Database`。
- `worker/__tests__/repository-factory.test.ts`：验证默认 File、D1 binding 门禁和模型适配。
- `scripts/update/persist.ts`：保留为兼容/黄金测试参考，待后续清理阶段移除。

**关键纪律**：只改持久化调用，不动 discovery/fetch/translate 的任何逻辑。管线仍由 tsx + Node 运行（Phase 7 才迁 Workflow）。

**当前完成标准**：factory 与适配器测试通过；`runUpdate()` 集成测试覆盖 full-run、dry-run 只读、成功后状态标记、已处理 URL 去重和单文章失败隔离；`check:worker`、`test:worker`、`test:d1`、`test:update`、`check` 全绿。Worker runtime factory 与 `/storage/health` 已由 `env.DB` + Miniflare D1 binding 测试验证；独立 `wrangler dev` 留作运行时门禁。

**回滚**：`STORAGE_BACKEND=file` 使用 FileRepository；dry-run 始终使用只读 File 视图，避免误写 D1。

---

### Phase 6：Worker-compatible fetch path 🟨 backend 已接线，运行时验证待补

**目标**：摆脱操作系统依赖（手册 §13）。`fetch.ts` 的 `child_process + curl` 兜底、`jsdom`、`undici ProxyAgent` 在 Workers 上都不可用。

**Fetch Strategy 分层**：
- Tier 1：Worker `fetch()`（默认）。
- Tier 2：specialized HTTP adapter（不同 UA / TLS 指纹）。
- Tier 3：Browser / remote extraction fallback（Cloudflare Browser Rendering，按需引入）。

**HTML 解析替换**：`jsdom + @mozilla/readability` → `parse5` / `linkedom` / Readability.js（纯 JS，Workers 可用）。`turndown` 用浏览器可用版本。

**涉及文件**：新建 `worker/fetch/`（不原地改 scripts/update/fetch.ts，避免破坏 Node 路径）；`node:crypto createHash('sha1')` → Web Crypto `crypto.subtle`（translation-plan.ts 的 chunkId）。

**完成标准**：Workers fetch 路径在 `wrangler dev` 下通过；现有 Tier A 来源（RSS/Sitemap + 普通 HTML）抓取成功率 ≥ Node 路径。当前已完成 Worker extractor 单测、Node 管线 backend 接线和 Miniflare HTTP handler smoke；真实来源 A/B 及独立 `wrangler dev` 尚未完成。

**回滚**：`FETCH_BACKEND=node|worker` 切换。

---

### Phase 7：Workflow 运行时 ⬜

**目标**：业务逻辑可以脱离 Cloudflare 单独测试；Workflow 只负责编排/重试/超时/恢复（手册 §8）。

**产出**：
- `worker/workflows/update-workflow.ts` —— Cloudflare Workflow，步骤化调用 discover → fetch → translate → persist（这些是纯业务函数，已在 Phase 5/6 解耦）。
- Cron Trigger（替代已删除的 `.github/workflows/pages.yml` 的 `02:17 UTC`）。

**关键纪律**：禁止在 `step.do("translate", ...)` 里塞 300 行业务逻辑（手册 §8）。Workflow 是执行器，不是业务容器。

**幂等性**（手册 §18）：每个 step 假设可能被执行两次。`UNIQUE(source_id, original_url)` 是最基础不变量。

**Failure 处理**（手册 §19）：单文章失败不拖垮全局。Article A success / B failed / C success → Workflow completed with recorded failure。失败写 source_items.status + last_error + attempt_count。

**涉及文件**：`worker/workflows/`、`wrangler.toml` cron triggers。

**完成标准**：`wrangler dev` + 真实 Workflow invocation 验证；source_runs 表能回答手册 §20 的 observability 问题。

**回滚**：Cron 关闭，手动触发 Node 管线（Phase 5 路径仍可用）。

---

### Phase 8：Astro 切 D1 ⬜

**目标**：Astro 从"静态内容编译器"转成"应用层"（手册 §11）。`getCollection('articles')` → `ArticleRepository.listAll/listBySource`。

**迁移顺序**（不要一次性全 SSR）：
1. 切换 Astro 到 `output: 'hybrid'` + Cloudflare adapter。
2. 文章列表页、阅读页、搜索、计数 → SSR（从 D1 读）。
3. CSS / JS / Logo / Avatar / 固定页面 → 保持静态。

**涉及文件**：`src/pages/index.astro`、`src/pages/articles/[id].astro`、`src/pages/blogs/[id].astro`、`src/pages/search.astro`、`astro.config.mjs`（adapter + output）。

**完成标准**：文章从 D1 实时读取；新文章发布后立即可访问，无需 rebuild。

**回滚**：Astro adapter 移除，回到 static。

---

### Phase 9：搜索切 FTS5 ⬜

**目标**：搜索索引跟随数据源（手册 §12）。Pagefind → D1 FTS5。

**顺序**：先让 D1 成为文章真相（Phase 8 完成）→ 页面从 D1 正确读取 → 再替换搜索 → 最后移除 Pagefind。**不要同时修改数据层、SSR、搜索三条主链路。**

**涉及文件**：`src/components/SearchPanel.astro`、D1 FTS5 虚拟表、Worker search endpoint。

**完成标准**：搜索结果实时反映新文章；Pagefind 构建步骤可移除。

**回滚**：Pagefind 索引保留，搜索降级。

---

### Phase 10：删除旧文件 backend ⬜

**目标**：迁移收尾。移除 FileRepository / `scripts/update/persist.ts` / Pagefind / GitHub Pages remnants。

**前置条件**（手册 §24）：
- GitHub 只保存源码和人工配置。
- 新文章：发现 → 抓取 → 翻译 → D1 → 立即可访问，无需 git commit / Astro rebuild / Pagefind rebuild。
- Workflow 能重试、恢复、记录状态。
- Astro 实时从 D1 获取文章。
- 搜索实时索引新文章。

**完成标准**：`STORAGE_BACKEND=d1` 为唯一路径；`scripts/update/` 缩减为薄封装或删除；`.gitignore` 的 `src/content/articles/` 与 `processed-urls.json` 行移除（已不是运行时数据载体）。

---

## 不变量清单（手册 §23）

无论底层怎么换，以下行为必须保持：

| 不变量 | 当前实现 | 迁移后验证点 |
|---|---|---|
| 同一原文只收录一次 | `processed-urls.json` URL 去重 | D1 `UNIQUE(source_id, original_url)` |
| 发布日期以原文为准 | frontmatter `published_at` | D1 articles.published_at |
| 原文 URL 永远保留 | frontmatter `original_url` | D1 articles.original_url |
| 翻译模型可追踪 | frontmatter `translation_model` | D1 articles.translation_model |
| 分类来自受控集合 | `src/config/categories.ts` | D1 categories 表 + classify 校验 |
| 翻译失败不污染正文 | AST 保护（translation-plan.ts） | 不变（纯函数，跨 backend 复用） |
| 单来源失败不拖垮全局 | index.ts try/catch per item | Workflow step failure 隔离 |
| 来源发现策略可独立测试 | `audit.ts` + smoke.ts | Worker fetch adapter 独立测试 |
| 文章结构不依赖来源平台 | frontmatter 字段固定 | D1 articles schema 固定 |

## 迁移完成定义（手册 §24）

不是 Worker 返回 200。真正完成需同时满足：

- GitHub 只保存源码和人工配置。
- 新文章：发现 → 抓取 → 翻译 → D1 → 立即可访问（无需 git commit / rebuild）。
- Workflow 能重试、恢复、记录状态。
- Astro 实时从 D1 获取文章。
- 搜索实时索引新文章。

做到这些后，Cloudflare 才真正成为 Blogs Wiki 的运行平台。

---

## 心智模型转变

**迁移前**：Blogs Wiki = 一个会自动生成 Markdown 的静态网站。

**迁移后**：Blogs Wiki = 一个持续摄取、翻译、整理并发布文章的内容系统。网站只是它的一个读取界面。

Cloudflare 不是目的。真正的目的是让 Blogs Wiki 从"构建出来的网站"变成"持续运行的内容管线 + 可查询内容库 + 阅读界面"。
