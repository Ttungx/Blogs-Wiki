/**
 * Cloudflare Workflow —— 博客更新管线编排器（Phase 7）。
 *
 * 替代已删除的 `.github/workflows/pages.yml`（原 02:17 UTC 定时触发）。
 * 每个来源一个 step.do()，单来源失败不阻塞其他来源（手册 §19）。
 * source_runs 表记录运行级 observability（手册 §20）。
 *
 * Workflow 是执行器，不是业务容器（手册 §8）：
 * 业务逻辑在 `worker/runtime/update-orchestrator.ts`（可独立单元测试），
 * 这里只做 step.do() 包装 + retry/timeout 配置 + 运行记录。
 */

import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { createWorkerRepositories } from '../runtime/repositories.ts';
import { loadActiveSources } from '../runtime/source-config.ts';
import {
  aggregateResults,
  createTranslator,
  processSource,
  type OrchestratorEnv,
  type SourceUpdateResult,
  type UpdateOptions,
} from '../runtime/update-orchestrator.ts';

/** 每来源 step 的重试策略。 */
const STEP_RETRIES = {
  limit: 2,
  delay: '30 seconds',
  backoff: 'exponential',
} as const;

/** 每来源 step 的超时（覆盖发现+抓取+翻译+持久化全链路）。 */
const STEP_TIMEOUT = '5 minutes' as const;

export class UpdateWorkflow extends WorkflowEntrypoint<OrchestratorEnv, UpdateOptions> {
  async run(event: WorkflowEvent<UpdateOptions>, step: WorkflowStep) {
    const payload = event.payload ?? {};
    const repos = createWorkerRepositories(this.env);

    // ── Step 1：创建运行记录 ──────────────────────────────
    const runId = await step.do('create-run', async () => {
      const run = await repos.sourceRuns.create({
        sourceId: payload.sourceId ?? 'all',
        trigger: event.schedule ? 'cron' : 'manual',
      });
      return run.id;
    });

    // ── Step 2：准备依赖（非 step，纯内存） ──────────────
    const sources = loadActiveSources(payload.sourceId);
    const translate = createTranslator(this.env, payload.dryRun ?? false);

    if (sources.length === 0) {
      await step.do('finalize-empty', async () => {
        await repos.sourceRuns.update(runId, {
          status: 'completed',
          finishedAt: new Date().toISOString(),
        });
      });
      return { sources: [], discovered: 0, pending: 0, processed: 0, failed: 0 };
    }

    // ── Step 3：逐来源处理（每个来源一个 durable step） ──
    const results: SourceUpdateResult[] = [];
    for (const source of sources) {
      const result = await step.do(
        `update-${source.id}`,
        { retries: STEP_RETRIES, timeout: STEP_TIMEOUT },
        async function (): Promise<SourceUpdateResult> {
          return processSource(repos, source, {
            limit: payload.limit,
            translate,
          });
        },
      );
      results.push(result);
    }

    // ── Step 4：汇总 + 关闭运行记录 ──────────────────────
    const summary = await step.do('finalize-run', async () => {
      const agg = aggregateResults(results);
      await repos.sourceRuns.update(runId, {
        status: agg.failed > 0 ? 'partial' : 'completed',
        finishedAt: new Date().toISOString(),
        discovered: agg.discovered,
        pending: agg.pending,
        processed: agg.processed,
        failed: agg.failed,
        ...(agg.failed > 0
          ? { errors: JSON.stringify(results.flatMap((r) => r.errors).slice(0, 50)) }
          : {}),
      });
      return agg;
    });

    return summary;
  }
}
