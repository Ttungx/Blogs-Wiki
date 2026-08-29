# CI/CD 与密钥分层

> 一句话：**push main = 只跑门禁；发版本（push `v*` tag）= 门禁 → 自动部署 Worker + Render**；PR = 只跑门禁。
> 本仓库为 **PUBLIC**，Actions 日志公开可见——密钥只进加密 secrets，严禁出现在代码、文档、日志、commit 信息中。

## 触发边界（.github/workflows/ci.yml）

| Job | 触发 | 内容 |
|---|---|---|
| `gate` | PR → main、push → main、push tag `v*`（`docs/**`、`**.md` 改动跳过） | astro check + tsc + test:update/worker/d1/markdown 全量门禁 |
| `release-guard` | 仅 tag `v*` push 或 workflow_dispatch | 校验 tag 与 `package.json` version 一致（防版本漂移） |
| `deploy-worker` | 仅版本发布（tag 或手动），gate + guard 通过后 | `d1 migrations apply --remote`（幂等）→ `astro build` → `wrangler deploy` |
| `deploy-render` | 仅版本发布（tag 或手动），gate + guard 通过后 | Render API 触发部署（锚定 tag 所指 commit） |

**平时提交不部署**——main 上的任何 push 只触发门禁测试。部署是一个显式的"发版"动作：

```bash
npm version patch   # 或 minor / major：bump package.json + 自动 commit + 打 v* tag
git push origin main --follow-tags
# → gate → release-guard（tag vs package.json）→ deploy-worker + deploy-render
```

手动逃生门：Actions 页面 `CI/CD → Run workflow`（workflow_dispatch）可部署当前 main，不校验版本——仅用于紧急热修，常规发版走 tag。

- 并发控制：PR push 取消旧 run；main/tag push 的部署排队不取消。
- **内容更新 cron 不在 Actions**：内容抓取/翻译算力在 Render runner（GitHub Actions 版已于 2026-08 退役，备份在本地 gitignored `workflow-backup/`）。Actions 只管 CI/CD，这条边界不许打破——Workers 免费 10ms CPU 跑不动 Defuddle，别把重活搬回来。
- 密钥未配置时对应 deploy job **优雅跳过**（notice 提示，不红），便于密钥没配齐时先享受 CI。

## 密钥分层（勿混用，值一律不进仓库）

| 层 | 项 | 配置位置 | 用途 |
|---|---|---|---|
| **GitHub Actions secrets** | `CLOUDFLARE_API_TOKEN` | repo Settings → Secrets（或 `gh secret set`） | CI 部署 Worker + D1 migration |
| | `CLOUDFLARE_ACCOUNT_ID` | 同上 | 同上 |
| | `RENDER_API_KEY` | 同上 | CI 触发 Render 部署（webhook 集成失效，已改由 Actions 显式触发） |
| **Cloudflare Worker secrets** | `CONTENT_SYNC_TOKEN` | `wrangler secret put`（本地执行） | content-sync / items / check 认证 + /run ping 鉴权 |
| **Cloudflare Worker vars** | `RUNNER_URL` | `wrangler.deploy.jsonc`（非密，可入库） | Render 服务地址 |
| **Render env（`sync:false`，Dashboard 手填）** | `RUNNER_KEY` / `CONTENT_SYNC_TOKEN` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `TRANSLATION_MODEL` | Render Dashboard | runner 运行时 |
| **本地 `.env`（gitignored）** | 同 Render + 代理 + `CONTENT_SYNC_CHECK_URL` | 本地 | 本地开发 |

Render API key 创建/轮换：Render Dashboard → Account Settings → API Keys。
GitHub secrets 设置：`gh secret set <NAME> --repo Ttungx/Blogs-Wiki`（stdin 传值，勿写入任何文件）。

## 待办：配置 CLOUDFLARE_API_TOKEN（当前缺失，Worker 部署在 CI 中处于跳过状态）

1. Cloudflare Dashboard → 右上角头像 → **My Profile → API Tokens → Create Token**。
2. Custom token 权限最小集：
   - `Account | Workers Scripts | Edit`
   - `Account | D1 | Edit`
3. `gh secret set CLOUDFLARE_API_TOKEN --repo Ttungx/Blogs-Wiki`（粘贴 token 后回车）。
4. 下次 push（或在 Actions 页面 Re-run）即恢复自动部署。

## 非密但公开的字段（确认过，无需处理）

- `wrangler.deploy.jsonc` 中的 D1 `database_id`：无凭证不可用，属常规可提交项。
- `RUNNER_URL` / `CONTENT_SYNC_URL` / service id：本就是公网服务地址。

## 泄密应急

1. 立即到对应平台**轮换**密钥（CF API Token / Render API Key / CONTENT_SYNC_TOKEN 三处同步换）。
2. 若密钥进了 commit 历史：轮换后用 `git filter-repo` 清史 + force push（内容更新管线按 (source_id, url) 幂等，重放安全）。
3. 检查清单：`git log --all --name-only --pretty=format: | sort -u | grep -iE "\.env|secret|token"`（当前唯一命中：`.env.example`，空值模板，安全）。
