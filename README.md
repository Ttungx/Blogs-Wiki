# Blogs Wiki

Blogs Wiki 是以博客书架为入口、持续收录优质博客文章并提供统一翻译阅读体验的数字馆藏。

当前阶段是 Demo / MVP。产品链路限定为：博客书架、博客文章收集册、统一文章阅读页、Pagefind 搜索、增量内容更新、GitHub Pages 部署。暂不加入登录、收藏、评论、推荐、排行榜、AI 问答、RAG、知识图谱或复杂 CMS。

## 当前状态

仓库采用 Astro、自定义页面与 Pagefind。页面、演示内容与增量更新管道（发现、抓取、翻译、分类、持久化）均已实现，并通过本地 dry-run 真实网络验证与离线冒烟测试。GitHub Pages workflow 已配置，但只有在仓库启用 Pages 并真实运行 Actions 后，才能确认线上部署成功。

文章正文（`src/content/articles/`）与更新状态（`src/data/processed-urls.json`）暂不入库：仓库只保留项目代码，文章由更新管道在本地或 Actions 中生成。恢复入库时删除 `.gitignore` 中对应两行即可。

## 本地运行

要求 Node.js 24 和 npm。

```bash
npm ci
npm run dev
```

常用命令：

```bash
npm run check       # Astro / TypeScript 检查
npm run test:update # 离线冒烟测试更新管线（无需密钥与网络）
npm run build       # 构建 Astro，并在 dist/ 生成 Pagefind 索引
npm run update:dry  # 预演内容更新，不应持久化结果
npm run update      # 执行完整增量更新，可能写入内容和状态文件
```

`npm run update` 支持参数：

```bash
npm run update -- --source openai --limit 5   # 只更新指定来源，每源最多 5 篇
npm run update -- --limit 0                   # 每源不限制数量
```

`--dry-run` 只做发现与抓取：真实访问 RSS / Sitemap / 列表页与文章页并打印提取结果，但不调用翻译模型、不写任何文件。完整更新按来源增量处理未记录的 URL，每源默认最多 3 篇新文章（`--limit` 可调）；无新文章时不会调用模型。

以下情况文章会被跳过并计入失败：抓取或提取失败、缺少标题、正文过短、页面与发现结果都没有发布日期（如 Paul Graham 这类无日期元数据的来源）、翻译模型返回空正文。单来源失败只记录错误，不影响其他来源与整体退出码；仅在配置无法读取或来源不存在时命令以非零退出。

## 环境变量

复制 `.env.example` 为 `.env`，不要提交密钥。

| 变量 | 用途 | 本地要求 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI-compatible 翻译服务密钥 | 执行真实更新时必填 |
| `OPENAI_BASE_URL` | OpenAI-compatible API 基础地址 | 执行真实更新时必填；示例为 OpenAI 地址 |
| `TRANSLATION_MODEL` | 实际翻译模型标识，并写入文章元数据 | 执行真实更新时必填 |
| `SITE_URL` | 站点 origin | 可选；本地默认 `http://localhost:4321` |
| `BASE_PATH` | 部署路径前缀 | 可选；本地默认 `/` |
| `USE_PROXY` | 设为 `true` 时所有抓取与模型请求走 `PROXY_URL` | 可选；需要代理访问来源站或模型服务时开启 |
| `PROXY_URL` | HTTP 代理地址，如 `http://127.0.0.1:7897` | `USE_PROXY=true` 时使用；缺省同示例地址 |

GitHub Actions 使用同名 Repository Secrets：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`TRANSLATION_MODEL`。任一缺失时，workflow 会跳过更新，但仍继续构建并部署仓库已有内容。

`OPENAI_BASE_URL` 兼容两种写法：仅到版本根（如 `https://api.openai.com/v1`）或直接到完整端点（如 `https://api.openai.com/v1/chat/completions`）。代理配置只影响本地运行，GitHub Actions 环境不需要 `USE_PROXY`。

本地网络受限时设置 `USE_PROXY=true` 并指向本地 HTTP 代理（如 Clash 的 `http://127.0.0.1:7897`），发现、抓取与翻译请求都会走该代理。少数站点（如 openai.com）会拦截 Node 的 TLS 指纹并返回 403，抓取模块会自动回退到系统 `curl` 二进制重试一次；`curl` 在 Windows / macOS / Linux 均随系统提供。

## 目录

博客来源的适配状态、审核队列和逐站接入流程统一记录在 [`docs/blog-source-registry.md`](docs/blog-source-registry.md)。

```text
.
├── .github/workflows/   # 定时、手动更新及 GitHub Pages 部署
├── docs/                # 来源登记、逐站研究与项目文档
├── public/              # 原样复制的静态资源
├── scripts/update/      # 发现、抓取、翻译、分类、持久化业务逻辑
├── src/components/      # 站点组件
├── src/layouts/         # 页面布局
├── src/lib/             # 通用逻辑
├── src/pages/           # 首页、博客页、文章页、搜索页
├── src/styles/          # 全局样式
├── astro.config.mjs     # Astro、站点 URL 与 Pages base path
└── package.json         # 本地与 CI 命令入口
```

`scripts/update/` 是更新命令约定位置；目录是否存在及实现是否完成，以当前分支为准。

## 更新与部署流程

```text
schedule / workflow_dispatch
  -> 可选 npm run update
  -> 有变更时 github-actions[bot] commit 并 push
  -> npm ci
  -> npm run build（Astro + Pagefind）
  -> upload-pages-artifact
  -> deploy-pages
```

- 定时任务每天 `02:17 UTC` 请求一次更新。
- 手动运行默认 `run_update=false`，用于无密钥 fork 或仅重新部署；需要更新时显式开启。
- 更新只调用项目命令 `npm run update`，抓取、翻译、分类与持久化逻辑不写入 workflow YAML。
- 三个翻译 Secrets 齐全且运行 ref 为分支时才执行更新。
- 有内容变化才创建 bot commit；构建 job 会检出该次更新后的精确 commit。
- 全部运行共享单一 concurrency group，避免两个更新或 Pages 部署互相覆盖。

更新管道的业务代码位于 `scripts/update/`：`discovery.ts`（RSS → Sitemap → 列表页三级发现）、`fetch.ts`（Readability + Turndown 提取正文与元数据）、`translate.ts`（OpenAI-compatible 翻译客户端，JSON 输出校验与重试）、`classify.ts`（分类归一化，只能从预定义集合选择）、`persist.ts`（文章写入与 `processed-urls.json` 状态）、`index.ts`（编排入口）。翻译模型与分类在一次模型调用中完成，`translation_model` 来自实际配置并写入每篇文章元数据。

来源列表位于 `src/data/sources.json`，每个来源可配 `rss_url` / `sitemap_url` / `blog_url` 三级发现，以及可选的 `article_paths` 白名单（只收录指定路径前缀下的文章，用于过滤公司站点的产品页、招聘页等）。无任何日期来源的站点（如 Paul Graham 的未标注日期文章）无法生成符合内容模型的文章，不应加入自动更新来源；如需收录，应使用带日期的发现源或人工导入。

待完整适配的来源可设置 `update_mode: "dry-run-only"`：它们参与 `npm run update:dry` 的发现与抓取验证，但完整更新会自动跳过，避免提前调用翻译模型或写入文章。可用 `exclude_paths` 排除位于文章路径下的标签、主题或列表页。

## GitHub Pages 配置

1. 打开仓库 `Settings -> Pages`。
2. 将 `Build and deployment -> Source` 设为 `GitHub Actions`。
3. 在 `Settings -> Secrets and variables -> Actions` 配置三个翻译 Secrets；仅部署可不配置。
4. 确保 Actions policy 允许官方 actions，且需要自动提交时允许 `GITHUB_TOKEN` 写入内容。受保护分支也必须允许该 bot push，否则更新提交会失败。
5. 手动运行 `Update content and deploy Pages`。无密钥或 fork 场景保持 `run_update=false`。

workflow 按 job 分配权限：更新仅获 `contents: write`，构建仅获 `contents/pages: read`，部署仅获 `pages: write` 与 `id-token: write`。Pages 环境名为 `github-pages`；建议只允许默认分支部署。

## 演示数据声明

仓库中的示例来源和文章（如有）只用于验证信息结构、路由、阅读与搜索体验，不代表完整、实时或官方镜像。原文版权归原作者或发布机构；译文可能存在错误，应保留原文链接与实际翻译模型元数据。

## 限制

- Demo 只增量处理未记录的文章 URL，不承诺检测旧文章修改或重译历史内容。
- RSS、Sitemap、来源页面和模型 API 可能变更或限流，自动更新不能保证每次发现全部新文章。
- GitHub 定时任务可能延迟；普通代码 push 不触发此 workflow，需要定时运行或手动运行。
- Pagefind 索引来自静态构建产物，不提供语义搜索。
- 本地构建无法证明 Pages 环境、Secrets、分支保护和线上部署配置正确；必须查看首次 Actions 运行结果。
