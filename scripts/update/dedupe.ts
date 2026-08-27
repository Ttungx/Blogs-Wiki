/**
 * 远端去重预检 —— 无状态运行环境（Render 容器等临时文件系统）下，
 * 本地 processed-urls.json 为空，无法判断「哪些 URL 已处理」。
 * 在翻译前调 /api/content-sync/check 用 D1 的 articles 表过滤，
 * 避免对存量文章重复抓取与翻译（浪费翻译配额与运行时长）。
 *
 * 失败语义：fail-open——预检失败只告警不过滤，照常全量处理；
 * 正确性由 content-sync 的 (source_id, original_url) 幂等写入兜底，
 * 绝不因预检故障阻塞或破坏更新流程。
 */

import type { FetchLike, Logger } from './types';

const CHECK_TIMEOUT_MS = 15_000;

export interface RemoteDedupeOptions {
  /** check 端点完整地址（含尾斜杠，如 https://site/api/content-sync/check/）。 */
  endpoint: string;
  /** Bearer token（与 content-sync 共用 CONTENT_SYNC_TOKEN）。 */
  token?: string;
  sourceId: string;
  urls: string[];
  fetchImpl: FetchLike;
  logger: Logger;
}

/**
 * 查询 D1 已存在的 URL 集合；任何失败都返回空集合并告警（fail-open）。
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
        `[${sourceId}] remote dedupe failed: HTTP ${response.status} (continuing unfiltered)`,
      );
      return known;
    }
    const data = (await response.json()) as {
      existing?: Array<{ sourceId?: unknown; url?: unknown }>;
    };
    if (!data || !Array.isArray(data.existing)) {
      logger.warn(
        `[${sourceId}] remote dedupe: unexpected response shape (continuing unfiltered)`,
      );
      return known;
    }
    for (const item of data.existing) {
      if (item && typeof item.url === 'string') known.add(item.url);
    }
    return known;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[${sourceId}] remote dedupe failed: ${message} (continuing unfiltered)`);
    return known;
  }
}
