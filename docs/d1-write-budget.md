# D1 日写入配额：调查与实施方案

> 状态：**调查完成，管线代码尚未改。** 2026-09-02 已紧急把 Worker cron 置空并 deploy，停止 15 分钟全量 sync。恢复 cron 必须先落地本文方案，禁止只打开 `crons`。
> 免费档硬顶：日写入 **100,000 行**、日读取 5,000,000 行、存储 5 GB。今日邮件「用量 90%」是 **rows written**，不是 56MB 库体积。

## 1. 紧急处置（已落地）

| 动作 | 结果 |
| --- | --- |
| `wrangler.deploy.jsonc` `"crons": []` | 已 deploy（Version `16e2b9ce-cb95-46bc-b1e7-fcfb2fc39a1c`，触发器列表不再含 schedule） |
| Render | 不再被 ping；若当时有一条链在跑，允许它自然结束（最多再一轮全量） |
| 手动 `import`/`sync`/`wrangler d1 execute` | **暂停**，直到增量 sync 落地 |

站点 SSR 只读，继续服务。内容不再自动更新。

## 2. 配额口径

Cloudflare D1 Free（[定价页](https://developers.cloudflare.com/d1/platform/pricing/)）：

| 指标 | 免费额 | 今日 90% 含义 |
| --- | ---: | --- |
| rows written / 日 | 100,000 | ≈ 写了 9 万行 |
| rows read / 日 | 5,000,000 | SSR 远够用 |
| 存储 | 5 GB | 现网 ~57 MB，无关 |

写入按 **SQLite 实际改动的行** 计。`db.batch()` 里每条 INSERT/UPDATE/DELETE，命中行都算。`ON CONFLICT DO UPDATE SET updated_at=datetime('now')` 即使正文没变也算一次写。

## 3. 根因

不是「文章太多」，是 **每次同步都把整库当新数据重放**。

### 3.1 链尾无条件全量

`scripts/render-runner.mjs` `buildChainScript`（约 L99–107）每 15 分钟：

```
update（单源，默认 3 篇）
→ translate:batch（该源本地缺译）
→ quality-scan（扫容器内全部 md）
→ import-local-articles（walk 全部 md → JSON）
→ sync-local-articles（全部分片 POST /api/content-sync）
```

第 1 步是增量；**第 4–5 步是全库**。`RUNNER_BACKFILL=true` 只换第 1 步，链尾仍全量。

cron `7,22,37,52 * * * *` → 一天最多 96 轮。忙碌保护只挡同一进程重叠，挡不住「每轮都全量写」。

### 3.2 服务端无变更检测

`worker/runtime/content-sync.ts` `prepareSyncWrite` 对 payload 里 **每一篇**：

| 步骤 | 语句 | 无条件？ |
| --- | ---: | --- |
| 预清理 | 4～5 条 DELETE（source_items / id 碰撞 / 旧版本 / 旧分类） | 是 |
| 身份 | 1 条 `articles` upsert | 是，且 `updated_at=now` |
| 版本 | 每语言 1 条 upsert | 是，且 `updated_at=now` |
| 分类 | 1 条 DELETE + 每类 2 条 INSERT | payload 带 `categories` 就整表重建；import 永远带 |

现网约 2461 篇、3806 版本、3520 分类：

- 每篇约 **15 条语句**（5 预清理 + 1 身份 + 2 版本 + 7 分类）
- 一轮全量 ≈ **3.7 万条语句**、**至少 0.6～1.3 万行写入**（DELETE 命中再加倍）
- 占日配额 **7～37% / 轮**

一天 96 轮 × 1 万行 ≈ **百万级写入**，免费档撑不住几小时。

### 3.3 2026-09-02 实测

- 本地两次全量 sync（排查后 2455 updated；补翻后 2461 updated）
- 15:37 cron 恢复后 Render 开始轮转（github-engineering / dan-koe / anthropic…），链尾再全量
- `articles.updated_at` 集中在 07:53–07:54 UTC（2455 行）= 一轮全量烙印
- 加上 09-01 全量重建（articles created 2311），两天内把日写入打到 90%

SSR 读（首页 `GROUP BY`、列表子查询）走 **rows read**，不是这次邮件的主因。

### 3.4 现成指纹没用在 sync 上

`article_versions.rendered_hash`（迁移 0009）只给 SSR 渲染缓存失效。sync **从不读它**。本地也没有 mtime/etag 过滤。

## 4. 目标预算

假设生产每天真正新/改 **≤ 60 篇**（20 active 源 × 每源 3 篇，多数轮次 new=0）：

| 模式 | 日写入量级 | 占 10 万 |
| --- | ---: | ---: |
| 现状：15 min 全量 | 60 万～350 万 | 爆 |
| 只停 cron、偶尔手动全量 | 1～3 万 / 次 | 一次就 10～30% |
| **目标：只写变化篇** | **约 300～1,000** | **&lt; 1%** |

目标：**正常日写入 &lt; 5,000**（余量给手动回填、check 读、分类重建）。全量 sync 降为 **显式运维命令**，默认关闭。

## 5. 方案（分三层，必须按序）

原则：cron 可以继续 15 分钟发现+翻译；**禁止 15 分钟全库 upsert**。

### 阶段 A — 链尾改为「本轮产物」（最大杠杆，先做）

**改 `scripts/render-runner.mjs`**

- 链尾不再 `import` 全部 md。
- update / translate:batch 已经把本源新文件写进 `src/content/articles/<sourceId>/`。
- import/sync 加过滤：`--source <id>` 且 **只收本次 run 新写或 mtime 在 `startedAt` 之后的文件**。
- `quality-scan` 同样限制到本源，禁止每轮扫 3806 个文件。

效果：每轮最多几十篇，即使服务端仍无条件 upsert，日写入从百万降到千级。

**验收**：Render 日志出现 `Synced chunk 1/1: N articles` 且 N ≪ 200；D1 面板该 15 分钟窗口 rows written &lt; 500。

### 阶段 B — sync 跳过未变内容（挡住手动全量）

即使有人再跑全量 import，服务端也不该重写 2461 篇。

**B1. 内容指纹**

- 用现成 `rendered_hash` 或新增 `content_sha256`（title + markdown + published + categories）。
- import 在 payload 带上 hash。
- `prepareSyncWrite` 先点查 `(article_id, language) → hash`（或 `updated_at` + 长度不够，必须内容哈希）。
- **hash 相同：整篇 skip**（不预清理、不 upsert、不重建分类）。
- hash 不同：走现在的 upsert。

**B2. upsert 条件更新**

`ON CONFLICT DO UPDATE SET ... updated_at=datetime('now')` 改成只在字段变化时更新，或 skip 路径根本不发这条 SQL。

**B3. 分类 diff**

不要每次 `DELETE 全部 + INSERT 全部`。先读现有分类，集合相等则不动。

**B4. 预清理收窄**

`articleIdentityPreClean` 的 4～5 条 DELETE 是为改名/id 漂移。稳定路径（id 与 URL 都未变）应 **整段跳过**。只在 check 发现 id 碰撞时才预清理。

**验收**：对同一 `.tmp-import-articles.json` 连跑两次 sync，第二次 `created=0, updated=0, skipped=2461`，D1 rows written ≈ 0（仅 check 读）。

### 阶段 C — 运维闸门

- 全量 sync 只允许显式：`npm run sync:all`（新脚本或 `--full`），文档标明「一次 ≈ 1～2 万行写入」。
- `sync-local-articles.mjs` 默认拒绝 &gt; 200 篇，除非 `--full`。
- check 端点可扩：返回已有 hash，让客户端本地过滤后再 POST（少传正文、少占 Worker CPU）。非必须，B 落地后即可。
- 禁止把 `quality-scan` 的全库打分绑在 15 分钟链上；stage 打分改每日一次或仅本源。

## 6. 实施顺序（你点头后再写代码）

1. **A**：runner `--source` + mtime/本轮文件列表 → 单测或 smoke：mock 3 篇新文件，断言 sync payload 只有这 3 篇。
2. **B1+B4**：content-sync skip 未变篇 + 稳定路径不预清理。补 `worker/__tests__/d1/content-sync*.test.ts`：重复提交同 payload 不增加 `updated_at`。
3. **B2+B3**：条件 upsert 与分类 diff。
4. **C**：CLI 闸门 + 文档。
5. **恢复 cron**：`wrangler.deploy.jsonc` 写回 `["7,22,37,52 * * * *"]` → deploy → `wrangler tail` 等一个槽位，确认 `scheduled ping -> HTTP 202` 且该轮 D1 写入 &lt; 500。
6. 观察 24h D1 面板 rows written，目标 &lt; 5,000。

不要并行先开 cron 再做 B。A 单独也可以先恢复 cron（风险：手动全量仍贵，但 15 分钟不再爆）。

## 7. 涉及文件（实施时）

| 文件 | 阶段 | 改什么 |
| --- | --- | --- |
| `scripts/render-runner.mjs` | A | 链尾按 source / 本轮文件 sync |
| `scripts/import-local-articles.mjs` | A, C | `--source`、mtime/`--since`、可选 `--full` |
| `scripts/sync-local-articles.mjs` | C | 默认拒超大 payload |
| `worker/runtime/content-sync.ts` | B | skip 未变、收窄预清理、分类 diff |
| `worker/__tests__/d1/content-sync.test.ts` | B | 幂等第二次零写 |
| `scripts/update/smoke.ts` | A/B | 链契约 |
| `wrangler.deploy.jsonc` | 最后 | 恢复 cron |
| `docs/go-live.md` / `AGENTS.md` | C | 日写入预算与恢复闸门 |

**不改**：D1 schema 可先不迁（复用 `rendered_hash` 或 payload 内带 hash 点查现有正文）。若 hash 不想与 SSR 缓存耦合，再加列，那是 B 的可选项。

## 8. 明确不做

- 不升付费 D1 来掩盖全量 sync。
- 不把 cron 调到 1 小时却仍全量 sync（只是爆得慢一点）。
- 不在 Worker 里跑翻译/抓取来「少一次 sync」（CPU 免费档更紧）。
- 不删历史文章减存储（存储不是问题）。

## 9. 恢复 cron 检查单

- [ ] 阶段 A 已上线（每轮 sync 篇数 ≈ 本源本轮 processed）
- [ ] 阶段 B 已上线（同一 payload 重放 skipped=全量、写入≈0）
- [ ] 本地 `npm run test:update && npm run test:d1`
- [ ] 无正在跑的手动全量 sync
- [ ] 用户明确说恢复
- [ ] deploy 后 tail 一个 cron 槽位 + D1 面板该小时写入

未勾完之前，`crons` 必须保持 `[]`。
