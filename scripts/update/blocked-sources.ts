/**
 * 已移除源的永久拉黑（tombstone）门禁。
 *
 * 语义：一个源一旦被登记进 src/data/blocked-sources.json，即使有人把同 id
 * 或同域名（含子域/父域、extra_domains）重新写回 src/data/sources.json，
 * loadSources 也必须**报错拒绝加载**——把"移除一个源"变成持久、自约束、
 * 显式可解除的一等操作，而非"删掉配置条目、指望它不再被碰到"。
 *
 * 只读文件用 fs.readFile（绝不 import）：src/data/*.json 里 sources.json 会
 * 打包进 Worker（AGENTS.md bundle 纪律），本文件与 blocked-urls.json 只允许被
 * Node 侧 scripts/update/ 消费，绝不能进入 Worker/SSR bundle。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { domainsIntersect } from './urls';
import type { SourceConfig } from './types';

export interface BlockedSource {
  id: string;
  name?: string;
  /** 原 source.domain，完全同形拉黑（禁止归并到注册域）。 */
  domain: string;
  /** 原 source.extra_domains（若有），一并纳入相交判定。 */
  extra_domains?: string[];
  /** YYYY-MM-DD。 */
  blocked_at: string;
  reason: string;
  /** 与 blocked-urls.json 的一致性由 smoke 测试校验，不参与拦截。 */
  url_count?: number;
  /** 决策记录锚点（docs/blog-source-registry.md 小节）。 */
  registry?: string;
}

export interface BlockedRegistry {
  version: number;
  updated_at?: string | null;
  blocked: BlockedSource[];
}

const BLOCKED_FILE = path.join('src', 'data', 'blocked-sources.json');

/**
 * 读取拉黑登记表。
 * - 文件不存在 → [] （向后兼容：临时测试目录 / 老 clone 不误伤）。
 * - 文件存在但 JSON 非法 / schema 不合 → **抛错**（fail-closed：门禁文件损坏
 *   绝不能退化成"全部放行"）。
 */
export async function loadBlockedSources(rootDir: string): Promise<BlockedSource[]> {
  const file = path.join(rootDir, BLOCKED_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`无法读取拉黑登记表 ${BLOCKED_FILE}：${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${BLOCKED_FILE} 不是合法 JSON（请用 git 恢复：git checkout -- ${BLOCKED_FILE}）：` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const registry = parsed as Partial<BlockedRegistry>;
  if (!registry || !Array.isArray(registry.blocked)) {
    throw new Error(`${BLOCKED_FILE} schema 非法：缺少 blocked 数组（请用 git 恢复该文件）`);
  }
  registry.blocked.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${BLOCKED_FILE} blocked[${index}] 必须是对象`);
    }
    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      throw new Error(`${BLOCKED_FILE} blocked[${index}].id 必填且非空`);
    }
    if (typeof entry.domain !== 'string' || !entry.domain.trim()) {
      throw new Error(`${BLOCKED_FILE} blocked[${index}].domain 必填且非空`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`${BLOCKED_FILE} blocked[${index}].reason 必填且非空`);
    }
    if (entry.extra_domains !== undefined && !Array.isArray(entry.extra_domains)) {
      throw new Error(`${BLOCKED_FILE} blocked[${index}].extra_domains 必须是数组`);
    }
  });
  return registry.blocked;
}

export interface BlockedConflict {
  source: SourceConfig;
  blocked: BlockedSource;
  matched_by: 'id' | 'domain' | 'extra_domains';
  detail: string;
}

/** 纯判定：给定源列表与拉黑表，返回全部冲突（不抛错，供 block-source 安全阀复用）。 */
export function findBlockedConflicts(
  sources: SourceConfig[],
  blocked: BlockedSource[],
): BlockedConflict[] {
  if (!blocked.length) return [];
  const conflicts: BlockedConflict[] = [];
  for (const source of sources) {
    for (const entry of blocked) {
      if (source.id === entry.id) {
        conflicts.push({
          source,
          blocked: entry,
          matched_by: 'id',
          detail: `id "${entry.id}"（拉黑域 ${entry.domain}）`,
        });
        continue;
      }
      const sourceDomains = [source.domain, ...(source.extra_domains ?? [])];
      const blockedDomains = [entry.domain, ...(entry.extra_domains ?? [])];
      let hitDomain = '';
      let viaExtra = false;
      for (const sd of sourceDomains) {
        for (const bd of blockedDomains) {
          if (domainsIntersect(sd, bd)) {
            hitDomain = `${sd} ↔ ${bd}`;
            viaExtra = (source.extra_domains ?? []).includes(sd);
            break;
          }
        }
        if (hitDomain) break;
      }
      if (hitDomain) {
        conflicts.push({
          source,
          blocked: entry,
          matched_by: viaExtra ? 'extra_domains' : 'domain',
          detail: `域名 ${hitDomain}`,
        });
      }
    }
  }
  return conflicts;
}

function formatConflict(conflict: BlockedConflict): string {
  const { source, blocked, detail } = conflict;
  const lines = [
    `  ✗ ${source.id}`,
    `      命中：${detail}`,
    `      拉黑时间：${blocked.blocked_at ?? '未知'}`,
    `      原因：${blocked.reason}`,
  ];
  if (blocked.url_count !== undefined) {
    lines.push(
      `      URL 留痕：${blocked.url_count} 条，见 src/data/blocked-urls.json → records["${blocked.id}"]（请勿删除）`,
    );
  }
  if (blocked.registry) {
    lines.push(`      决策记录：${blocked.registry}`);
  }
  return lines.join('\n');
}

/**
 * 若任一现存源命中拉黑表，一次性抛出全部冲突（不 first-hit 抛，避免用户改
 * 一处又撞第二处反复试）。无冲突则静默通过。
 */
export function assertNotBlocked(
  sources: SourceConfig[],
  blocked: BlockedSource[],
): void {
  const conflicts = findBlockedConflicts(sources, blocked);
  if (conflicts.length === 0) return;

  const body = conflicts.map(formatConflict).join('\n\n');
  const ids = [...new Set(conflicts.map((c) => c.blocked.id))].join('、');
  throw new Error(
    `Blocked source violation: 源配置被拒绝加载——以下 ${conflicts.length} 个源命中已永久拉黑（tombstone）的源，` +
    `管线不允许再次发现或抓取它们。\n\n${body}\n\n` +
    `如确需重新启用，必须显式解除拉黑（三者缺一不可）：\n` +
    `  1) 从 src/data/blocked-sources.json 的 blocked[] 删除对应条目（${ids}）——` +
    `URL 账本 src/data/blocked-urls.json 保留，它是历史决策留痕、不参与拦截；\n` +
    `  2) 在 docs/blog-source-registry.md「已移除源（拉黑 / tombstone）」节把该源移回适配表并写明重新纳入的理由；\n` +
    `  3) 跑 npm run test:update —— 其中「拉黑域与现存源零冲突」的回归断言会先替你确认不误伤活跃源。\n` +
    `机制说明见 AGENTS.md「已移除源的拉黑机制（tombstone）」。`,
  );
}
