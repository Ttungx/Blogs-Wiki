# 当前 TODO（2026-08-27）

## 现役架构（已上线）

**站点**：Cloudflare Worker（Astro SSR + D1 + ASSETS）
**写路径（Worker Cron → Render runner 全链路 2026-08-27 验证）**：Worker Cron（每小时 :07）→ ping Render 免费 runner `/run` → 单源更新链（发现 → D1 去重预检 → 抓取 → 翻译 → content-sync 幂等写 D1）
**已退役**：GitHub Actions 路径（备份 `workflow-backup/`，gitignored）；Cloudflare Workflow（实验/回滚代码）；`POST /api/trigger` → 410

## 2026-08-27 实测证据（Render 上线日）

| 检查 | 结果 |
|---|---|
| Render 服务创建 | ✅ MCP 创建 `blogs-wiki-updater`（free/node/oregon），env 五件套注入，首次构建 76s live |
| 单源实跑 | ✅ `POST /run?key=…&source=anthropic&limit=1` → 202 → 55s 链条 ok |
| 新文翻译入库 | ✅ `anthropic/nuclear-safeguards-for-ai`（发布 08-26）translated_at 2026-08-27T08:40:38Z，线上文章页 200 |
| RUNNER_URL 接通 | ✅ 填入 wrangler.deploy.jsonc 并 deploy（版本 08ff4d21），cron :07 生效 |
| 读路径回归 | ✅ health/首页/新文章页全 200；「访问原博客」外链修复后恢复 |

## 2026-08-24 实测证据

| 检查 | 结果 |
|---|---|
| D1 远程迁移 | ✅ 全部应用（No migrations to apply） |
| Worker 部署 | ✅ 版本 3d1457ab；cron `7 * * * *` 注册成功；`RUNNER_URL` 暂空（安全跳过） |
| 服务端 bundle | ✅ 139MB → 14MB（SSR 全面退出 astro:content，search 改读 D1） |
| live 页面 | ✅ 首页/搜索/博客页/文章页/health 全 200 |
| check 端点 | ✅ live 200，Bearer 认证生效，返回已存在子集 |
| E2E 单源首跑 | ✅ anthropic limit=1：remote dedupe 过滤 4 URL → 新文翻译入库 → 线上文章页与搜索可见 |

## 开放任务（按优先级）

1. ✅ **Render Blueprint 创建（2026-08-27 完成）**：服务 `blogs-wiki-updater.onrender.com` 已建好接 env；`RUNNER_URL` 已填入并 deploy。
2. 🟨 **首个自动 cron tick 观察**：整点 :07 看 Worker 触发日志与 D1 增长（手动等价链路已全绿；幂等设计漏跑/重复跑无害）。
3. ✅ **本地 corpus 清理（2026-08-24 完成）**：2646→237 文件（45MB→5.3MB），现为 D1 精确镜像；历史积压 40MB 归档于 gitignored `.corpus-archive/2026-08-24/`（确认可弃后整目录删除）；顺带修复：D1 孤儿行 paul-graham（无 FK 时期残留）已删、4 处 URL 漂移本地对齐 D1；**全量 import 已验证可用（138 篇 2 chunks 通过）**
4. ⬜ Phase 9：Pagefind → D1 FTS5（现搜索 = D1 轻量清单 + 客户端过滤）
5. ⬜ Phase 10：删 FileRepository / persist.ts / processed-urls.json（search 已切 D1）。注意非纯删除：生产链仍有「本地持久化 → import-local-articles → sync」文件中转，实质是改为管线直调 content-sync（D1 直写）
6. 🟨 收尾：`worker-runtime.test.ts` 适配新 API 入口；sitemap 动态化
7. ✅ **工作区整理提交（2026-08-27 完成）**：49729e2（写链 render-runner/dedupe/content-sync/cron 配置）、11b1958（SSR 全面读 D1 + 博客元数据静态化 + 生成器 camelCase 修复线上 blogUrl/logoScale 静默取空）、a1a4b58（docs 对账）；已 rebase 远端 README 小改后推送（fb1eac7）

## 已知坑

- **SSR 严禁 import astro:content**：会连整个数据层存储（曾达 125MB）打进 bundle → 64MiB 超限。博客元数据编辑流程：改 `src/content/blogs/*.md` → `npx tsx scripts/generate-blogs-static.ts`
- 线上 POST API 测试须带 `Content-Type: application/json`（裸表单被 Astro checkOrigin 拦成 403，非应用层响应）
- API 路径带尾斜杠，否则 301/308
- SSH 到 github.com 常被墙，git 远端操作走代理或 gh HTTPS API
