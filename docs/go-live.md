# 完整上线 Runbook（go-live）

> 当前状态：**增量 sync 已合并，本次上线恢复 cron**（`crons=["7,22,37,52 * * * *"]`）。
> 调查与写入预算见 [`d1-write-budget.md`](d1-write-budget.md)。push main 即部署 Worker + Render（见 [`ci-cd.md`](ci-cd.md)）。

## 上线两前置（业务决策，非技术）

1. **翻译服务稳定**：免费网关的吞吐/限流/质量确认可长期承载（实测基准见 AGENTS.md 翻译通道节；`translate:batch` 补翻与 429 退避已就位）。
2. **质量门禁就绪**：ML 模型替代/增强规则门禁（`scripts/update/backfill-integrity.ts`）。接缝已预留：门禁产出 `IntegrityIssue{severity, code, message}`，拒绝记录进 `source_items.last_error`（90 天滑动 TTL 负缓存），替换判定逻辑不影响 check/items 契约与管线。

## 已就绪清单（放行前逐项确认仍成立）

| 项 | 验证命令 |
|---|---|
| CI/CD 版本发布制（tag 触发部署） | push main 观察仅 gate 跑 |
| 内容链全绿（发现→去重→抓取→门禁→翻译→补翻→写 D1） | `npm run test:update && npm run test:worker && npm run test:d1` |
| 门禁拒绝负缓存 `/api/content-sync/items` | `node scripts/verify-go-live.mjs`（401 = 在线且受保护） |
| Render runner 健康 | 同上（/healthz ok、/status 20 源） |
| GitHub secrets：`RENDER_API_KEY` / `CLOUDFLARE_ACCOUNT_ID` | `gh secret list` |
| Worker secrets：`CONTENT_SYNC_TOKEN` 等 4 件 | `npx wrangler secret list` |

## 放行步骤

1. **配 `CLOUDFLARE_API_TOKEN`**（若未配）：CF Dashboard → My Profile → API Tokens → Custom（`Workers Scripts: Edit` + `D1: Edit`）→ `gh secret set CLOUDFLARE_API_TOKEN --repo Ttungx/Blogs-Wiki`。
2. **恢复 cron**：`wrangler.deploy.jsonc` 把 `"crons": []` 改回 `["7,22,37,52 * * * *"]`。
3. **发版上线**（需用户明确指示发版）：`npm version <level>` → `git push origin main --follow-tags` → CI 自动门禁 + 双端部署。
4. **盯首跳**（关键——历史上 cron trigger 从未实际生效过，必须 live 验证）：
   ```bash
   npx wrangler tail --format pretty   # 等最近的 :07/:22/:37/:52
   # 期望：scheduled ping -> HTTP 202；Render 日志出现实例唤醒 + "chain ok"
   ```
   排查矩阵：Worker 无任何 scheduled 输出 → trigger 未注册（查 Dashboard Cron Triggers）；`scheduled ping failed` → 网络/DNS；ping 到但 401 → 密钥不一致（RUNNER_KEY vs CONTENT_SYNC_TOKEN）。
5. **落地证据**：首跳后 `node scripts/verify-go-live.mjs --d1`（--d1 查最近 24h 翻译入库数；WARN = 无新文章，属正常安静期）。
6. 24h 复查：D1 增长 + Render 日志抽查（`logs/runs/*.log` 每源一份）。

## 回滚

`wrangler.deploy.jsonc` 恢复 `"crons": []` → 发版或手动 deploy。链路全程幂等（check 预检 + 写入去重 + 拒绝缓存 TTL 自愈），中断/重复无害；回滚不产生脏数据。

## 已知风险

- cron trigger 生效史为零：首跳必须 `wrangler tail` 现场确认，不要默认它已工作。
- 翻译网关限流：免费层 429 已有退避，但放行初期 20 源集中首刷，若大面积 429 属预期，`translate:batch` 会周期性补齐。
- Render 免费实例 750h/月：15 分钟 ping 常驻约 720h，额度刚好——不要再往同账号加常驻服务。
