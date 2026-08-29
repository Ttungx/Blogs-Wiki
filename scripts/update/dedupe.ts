/**
 * 远端去重预检 + 门禁拒绝上报 —— 无状态运行环境（Render 容器等临时文件
 * 系统）下，本地 processed-urls.json 为空，无法判断「哪些 URL 已处理」。
 *
 * 读侧（fetchKnownRemoteUrls）：翻译前调 /api/content-sync/check 用 D1 过滤
 *   已存在文章（含 TTL 窗口内的门禁拒绝缓存），避免重复抓取与翻译。
 * 写侧（reportRejectedUrls）：质量门禁拒绝的 URL 上报到 /api/content-sync/items
 *   （source_items.status='skipped' 负缓存），让后续轮次在抓取前即被过滤，
 *   消除容器状态重置后的「重抓 → 再拒」循环。
 *
 * 失败语义：两侧都 fail-open——预检/上报失败只告警不阻塞，照常处理；
 * 正确性由 content-sync 的 (source_id, original_url) 幂等写入兜底。上报
 * 丢失可自愈：URL 下轮重抓 → 再拒 → 再上报。
 */

import type { FetchLike, Logger } from './types';

const CHECK_TIMEOUT_MS = 15_000;
/** 预检瞬时故障（超时/5xx/形状异常）重试次数（含首次）；写侧不重试（见上）。 */
const CHECK_MAX_ATTEMPTS = 2;
const CHECK_RETRY_DELAY_MS = 2_000;

export interface RemoteDedupeOptions {
  /** check 端点完整地址（含尾斜杠，如 https://site/api/content-sync/check/）。 */
  endpoint: string;
  /** Bearer token（与 content-sync 共用 CONTENT_SYNC_TOKEN）。 */
  token?: string;
  sourceId: string;
  urls: string[];
  fetchImpl: FetchLike;
  logger: Logger;
  /** 重试退避（测试注入用）。 */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 查询 D1 已存在的 URL 集合（已发布文章 + TTL 窗口内的门禁拒绝缓存）。
 * 仅返回「确实存在」的 URL；响应形状异常视为失败而非部分成功。
 */
export async function fetchKnownRemoteUrls(
  options: RemoteDedupeOptions,
): Promise<Set<string>> {
  const known = new Set<string>();
  const { endpoint, token, sourceId, urls, fetchImpl, logger } = options;
  if (!endpoint || urls.length === 0) return known;
  if (!token) {
    logger.warn(
      `[${sourceId}] remote dedupe skipped: CONTENT_SYNC_CHECK_URL is set but CONTENT_SYNC_TOKEN is empty`,
    );
    return known;
  }

  const retryDelayMs = options.retryDelayMs ?? CHECK_RETRY_DELAY_MS;
  for (let attempt = 1; attempt <= CHECK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ items: urls.map((url) => ({ sourceId, url })) }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn(
          `[${sourceId}] remote dedupe failed: HTTP ${response.status} (attempt ${attempt}/${CHECK_MAX_ATTEMPTS})`,
        );
      } else {
        const data = (await response.json()) as {
          existing?: Array<{ sourceId?: unknown; url?: unknown }>;
        };
        if (!data || !Array.isArray(data.existing)) {
          logger.warn(
            `[${sourceId}] remote dedupe: unexpected response shape (attempt ${attempt}/${CHECK_MAX_ATTEMPTS})`,
          );
        } else {
          for (const item of data.existing) {
            if (item && typeof item.url === 'string') known.add(item.url);
          }
          return known;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[${sourceId}] remote dedupe failed: ${message} (attempt ${attempt}/${CHECK_MAX_ATTEMPTS})`,
      );
    }
    if (attempt < CHECK_MAX_ATTEMPTS) await sleep(retryDelayMs);
  }

  logger.warn(
    `[${sourceId}] remote dedupe failed after ${CHECK_MAX_ATTEMPTS} attempts (continuing unfiltered)`,
  );
  return known;
}

// ── 写侧：门禁拒绝上报（source_items 负缓存） ──────────

export interface RejectedItem {
  url: string;
  /** 门禁失败代码（如 content-too-short），写入 source_items.last_error。 */
  code: string;
}

export interface ReportRejectionsOptions {
  /** items 上报端点完整地址（如 https://site/api/content-sync/items/）。 */
  endpoint: string;
  token?: string;
  sourceId: string;
  items: RejectedItem[];
  fetchImpl: FetchLike;
  logger: Logger;
}

/**
 * 把质量门禁拒绝的 URL 上报进 D1 负缓存（source_items.status='skipped'）。
 * 单次尝试不重试：上报幂等，丢失可自愈——下轮重抓 → 再拒 → 再上报。
 */
export async function reportRejectedUrls(
  options: ReportRejectionsOptions,
): Promise<void> {
  const { endpoint, token, sourceId, items, fetchImpl, logger } = options;
  if (!endpoint || items.length === 0) return;
  if (!token) {
    logger.warn(
      `[${sourceId}] rejection report skipped: endpoint is set but CONTENT_SYNC_TOKEN is empty`,
    );
    return;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: items.map((item) => ({ sourceId, url: item.url, code: item.code })),
      }),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(
        `[${sourceId}] rejection report failed: HTTP ${response.status} (negative cache missed; will re-report next round)`,
      );
      return;
    }
    logger.info(`[${sourceId}] rejection report: ${items.length} URL(s) cached as rejected`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[${sourceId}] rejection report failed: ${message} (negative cache missed; will re-report next round)`,
    );
  }
}
