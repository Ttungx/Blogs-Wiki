/**
 * 翻译模型提供商注册表加载(2026-09-06 用户决策;同日扩展多模型结构)。
 *
 * 文件:model_provider.yaml(敏感文件,已 gitignore,本地经 MODEL_PROVIDER_FILE
 * 显式启用)。生产(Render)拿不到 gitignored 文件,改用 MODEL_PROVIDER_YAML
 * 直接内联 YAML 内容(两变量都未设置时抛错,调用方回落 .env 旧路径)。
 *
 * 结构:providers 是连接条目(base_url/api_key/reasoning_effort/expire 服务商级
 * 共享),models 是该服务商下的模型队列。加载时把全部(服务商, 模型)对扁平化
 * 并按模型级 priority 全局升序排序——每个对是翻译链上的一个客户端:priority
 * 越小越先用,第一个为主翻译,依次向后回退。服务商级 expire 过期则整体剔除。
 *
 * rate_limit(模型级):concurrency / requests_per_minute / requests_per_day
 * 强制执行;tokens_per_minute / tokens_per_day 预留(解析保留暂不强制);
 * 整项 null 或子字段省略 = 不限。必填字段缺失抛错,绝不静默带坏配置。
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AiProviderConfig } from './ai-provider';

/**
 * 速率限制(model_provider.yaml 的 rate_limit 结构);整项 null = 不限,
 * 子字段 null/省略 = 该项不限。tokens_* 为预留字段:当前版本解析保留、
 * 暂不强制(token 计数需响应 usage,后续接入;429 退避仍兜底)。
 */
export interface ProviderRateLimit {
  /** 并发在途请求上限(进程内信号量)。 */
  concurrency?: number;
  /** 每分钟请求数上限(槽位均匀铺开)。 */
  requests_per_minute?: number;
  /** 每日请求数上限(进程内计数、跨天重置;超限抛错,由调用方回退备用服务商)。 */
  requests_per_day?: number;
  /** 每分钟 token 上限(预留)。 */
  tokens_per_minute?: number;
  /** 每日 token 上限(预留)。 */
  tokens_per_day?: number;
}

export interface ModelEntry extends AiProviderConfig {
  /** 所属服务商名。 */
  provider: string;
  /** 模型级全局优先级(越小越先用)。 */
  priority: number;
  /** 定位标签(纯说明,如"主翻译"/"大流量兜底")。 */
  role?: string;
  /** 继承自服务商级的失效日期;null = 长期有效。 */
  expire: string | null;
}

export interface ModelProviderFile {
  path: string;
  /** 全部(服务商, 模型)对,按 priority 升序;已过期服务商整体剔除。 */
  providers: ModelEntry[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RATE_LIMIT_FIELDS = [
  'concurrency',
  'requests_per_minute',
  'requests_per_day',
  'tokens_per_minute',
  'tokens_per_day',
] as const;

/** 注册表来源解析:MODEL_PROVIDER_YAML(内联,生产用)优先于 MODEL_PROVIDER_FILE(本地文件);都未设置返回 null。 */
export function modelProviderSource(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { kind: 'inline'; yaml: string } | { kind: 'file'; path: string } | null {
  const inline = (env.MODEL_PROVIDER_YAML ?? '').trim();
  if (inline) return { kind: 'inline', yaml: inline };
  const configured = (env.MODEL_PROVIDER_FILE ?? '').trim();
  if (!configured) return null;
  return { kind: 'file', path: isAbsolute(configured) ? configured : resolve(process.cwd(), configured) };
}

/** 兼容旧名:文件模式路径;内联模式返回 null。 */
export function modelProviderFilePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const source = modelProviderSource(env);
  return source?.kind === 'file' ? source.path : null;
}

export function loadModelProviders(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ModelProviderFile {
  const source = modelProviderSource(env);
  if (!source) throw new Error('MODEL_PROVIDER_YAML / MODEL_PROVIDER_FILE 均未设置(文件模式未启用)');
  const path = source.kind === 'inline' ? '(MODEL_PROVIDER_YAML)' : source.path;
  if (source.kind === 'file' && !existsSync(source.path)) {
    throw new Error(`MODEL_PROVIDER_FILE=${env.MODEL_PROVIDER_FILE} not found at ${source.path}`);
  }
  const rawYaml = source.kind === 'inline' ? source.yaml : readFileSync(source.path, 'utf8');

  const doc = parseYaml(rawYaml) as { providers?: unknown } | null;
  const raw = Array.isArray(doc?.providers) ? doc.providers : [];
  const errors: string[] = [];
  const entries: ModelEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  raw.forEach((item, pIndex) => {
    const pWhere = `providers[${pIndex}]`;
    if (typeof item !== 'object' || item === null) {
      errors.push(`${pWhere}: must be a mapping`);
      return;
    }
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const baseUrl = typeof rec.base_url === 'string' ? rec.base_url.trim() : '';
    const apiKey = typeof rec.api_key === 'string' ? rec.api_key.trim() : '';
    for (const [field, value] of [['name', name], ['base_url', baseUrl], ['api_key', apiKey]] as const) {
      if (!value) errors.push(`${pWhere}: missing ${field}`);
    }
    if (!name || !baseUrl || !apiKey) return;

    const expireRaw = rec.expire === undefined || rec.expire === null ? null : String(rec.expire).trim() || null;
    if (expireRaw && !DATE_PATTERN.test(expireRaw)) {
      errors.push(`${pWhere}: expire must be YYYY-MM-DD or null, got "${expireRaw}"`);
      return;
    }
    // 失效日当天仍有效(日期粒度);已过期整个服务商跳过并留痕。
    if (expireRaw && expireRaw < today) {
      console.warn(`[model-providers] ${name} 已过期(expire=${expireRaw}),整个服务商跳过`);
      return;
    }
    const providerEffort = typeof rec.reasoning_effort === 'string' && rec.reasoning_effort.trim()
      ? rec.reasoning_effort.trim()
      : undefined;

    const models = Array.isArray(rec.models) ? rec.models : [];
    if (models.length === 0) {
      errors.push(`${pWhere}: models must be a non-empty list`);
      return;
    }
    models.forEach((m, mIndex) => {
      const where = `${pWhere}.models[${mIndex}]`;
      if (typeof m !== 'object' || m === null) {
        errors.push(`${where}: must be a mapping`);
        return;
      }
      const mr = m as Record<string, unknown>;
      const model = typeof mr.model === 'string' ? mr.model.trim() : '';
      if (!model) {
        errors.push(`${where}: missing model`);
        return;
      }
      const priority = typeof mr.priority === 'number' ? mr.priority : Number(mr.priority);
      if (!Number.isFinite(priority)) {
        errors.push(`${where}: priority must be a number`);
        return;
      }
      let rateLimit: ProviderRateLimit | undefined;
      if (mr.rate_limit !== undefined && mr.rate_limit !== null) {
        if (typeof mr.rate_limit !== 'object' || Array.isArray(mr.rate_limit)) {
          errors.push(`${where}: rate_limit must be a mapping or null`);
          return;
        }
        const rl = mr.rate_limit as Record<string, unknown>;
        const parsed: ProviderRateLimit = {};
        for (const field of RATE_LIMIT_FIELDS) {
          const value = rl[field];
          if (value === undefined || value === null) continue;
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0) {
            errors.push(`${where}: rate_limit.${field} must be a positive number or null`);
            return;
          }
          parsed[field] = num;
        }
        if (Object.keys(parsed).length > 0) rateLimit = parsed;
      }
      const effortOverride = typeof mr.reasoning_effort === 'string' && mr.reasoning_effort.trim()
        ? mr.reasoning_effort.trim()
        : undefined;
      const role = typeof mr.role === 'string' && mr.role.trim() ? mr.role.trim() : undefined;
      entries.push({
        provider: name,
        baseUrl,
        apiKey,
        model,
        priority,
        expire: expireRaw,
        ...(effortOverride ?? providerEffort ? { reasoningEffort: effortOverride ?? providerEffort } : {}),
        ...(rateLimit ? { rateLimit } : {}),
        ...(role ? { role } : {}),
      });
    });
  });

  if (errors.length > 0) {
    throw new Error(`model provider 文件 ${path} 配置错误:\n  ${errors.join('\n  ')}`);
  }
  entries.sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  if (entries.length === 0) {
    throw new Error(`model provider 文件 ${path} 没有有效模型(全部缺失字段或已过期,今天 ${today})`);
  }
  return { path, providers: entries };
}
