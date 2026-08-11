# TODO：抓取引擎迁移 Readability → Defuddle

## Phase 6 引擎组件：🟨 backend 已接线，运行时验证待补

`worker/fetch/extractor.ts` + `worker/__tests__/extractor.test.ts` 已就位，46 个 Node worker 测试全绿。D1 backend 已由
`@cloudflare/vitest-pool-workers` 的真实 Miniflare Worker runtime 测试验证。

**尚未完成的运行时门禁**：
- `worker/index.ts` 的独立 HTTP 探针尚未在 `wrangler dev` 下完成验证。
- 尚未完成真实来源的 Node / Worker 抓取对照评测。

**技术要点**：
- Defuddle 零 Node 内置依赖，UMD 打包，Workers 兼容。
- linkedom 替代 jsdom（Workers 不可用），有 `linkedom/worker` 入口。
- turndown 需 3 个全局 shim（`window`/`DOMParser`/`document`），必须动态 import defuddle 确保 shim 先于 turndown 初始化。
- `wrangler.jsonc`：`nodejs_compat` flag，`compatibility_date` 2026-02-01。

## 剩余接线（按路线图顺序）

### Phase 3：D1 schema + migrations：✅ 已完成
- [x] `worker/migrations/*.sql`：articles / source_items / source_runs 表 + 受控分类初始化
- [x] `wrangler.jsonc` 加 D1 binding（`d1_databases`）
- [x] `wrangler d1 migrations apply --local` 通过

### Phase 4：D1Repository：✅ 已完成
- [x] `worker/repositories/d1/`：实现 ArticleRepository / SourceStateRepository 接口
- [x] D1 测试套件 18/18 通过

### Phase 5：管线接 Repository interface
- [x] `scripts/update/index.ts`：`writeArticle` → `repo.save()`，状态走 `stateRepo`
- [x] `scripts/update/repository-factory.ts`：默认 File backend；D1 需要注入 D1 binding
- [x] Worker runtime `env.DB` → D1 repositories 注入（Miniflare D1 binding 测试）
- [ ] `/storage/health` 独立 HTTP 探针
- [x] snake_case 管线模型 → camelCase domain 模型适配
- [ ] Phase 7 Workflow 注入 D1 binding，验证完整更新编排
- [x] `FETCH_BACKEND=node|worker` 切换
- [ ] `scripts/update/fetch.ts`：`new Readability().parse()` → `extractArticle()`
- [ ] 删除 6 个手写元数据函数 + `toMarkdown`
- [ ] 评估后处理去留：`removeNoiseBlocks`、`collapseCarousels`、`preserveBlockquoteFooters`
- [ ] `worker/domain/article.ts` 的 `node:crypto` → Web Crypto

### Phase 7：Workflow 运行时
- [ ] `worker/workflows/update-workflow.ts`：Cloudflare Workflow 编排
- [ ] Cron Trigger 替代 GitHub Actions

## 必须保留（与提取引擎无关）

- 网络层：`fetchWithCurl`（TLS 指纹回退）、`proxyUrlFor` + `NO_PROXY`
- `fetchArticleWithLocalization`（官方中文 alternate 探测）
- `resolveImageUrl`（图片懒加载 fallback）、`directoryBaseUrl`、`absolutizeUrls`
