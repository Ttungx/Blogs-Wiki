/**
 * 翻译模型提供商注册表加载(2026-09-06 用户决策)。
 *
 * 文件:model_provider.yaml(敏感文件,已 gitignore,经 MODEL_PROVIDER_FILE
 * 显式启用;未设置时返回 null,调用方回落 .env 旧路径——Render 生产不受影响)。
 * 结构见文件头注释:name/priority/base_url/api_key/model 必填,
 * reasoning_effort/rate_limit(每分钟请求数,null=不限)/expire(失效日期
 * YYYY-MM-DD,null=长期有效)可选。
 *
 * 语义:priority 越小优先级越高,排序后第一个为主服务商、第二个为回退;
 * 已过期条目自动跳过(失效日当天仍有效);必填缺失抛错,绝不静默带坏配置。
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AiProviderConfig } from './ai-provider';

export interface ModelProviderEntry extends AiProviderConfig {
  name: string;
  priority: number;
  /** 失效日期 YYYY-MM-DD;null = 长期有效。 */
  expire: string | null;
}

export interface ModelProviderFile {
  path: string;
  /** 按 priority 升序、剔除已过期的有效提供商。 */
  providers: ModelProviderEntry[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** MODEL_PROVIDER_FILE 解析出的绝对路径;未设置返回 null(文件模式未启用)。 */
export function modelProviderFilePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const configured = (env.MODEL_PROVIDER_FILE ?? '').trim();
  if (!configured) return null;
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export function loadModelProviders(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ModelProviderFile {
  const path = modelProviderFilePath(env);
  if (!path) throw new Error('MODEL_PROVIDER_FILE is not set');
  if (!existsSync(path)) throw new Error(`MODEL_PROVIDER_FILE=${env.MODEL_PROVIDER_FILE} not found at ${path}`);

  const doc = parseYaml(readFileSync(path, 'utf8')) as { providers?: unknown } | null;
  const raw = Array.isArray(doc?.providers) ? doc.providers : [];
  const errors: string[] = [];
  const providers: ModelProviderEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  raw.forEach((item, index) => {
    const where = `providers[${index}]`;
    if (typeof item !== 'object' || item === null) {
      errors.push(`${where}: must be a mapping`);
      return;
    }
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    const baseUrl = typeof rec.base_url === 'string' ? rec.base_url.trim() : '';
    const apiKey = typeof rec.api_key === 'string' ? rec.api_key.trim() : '';
    const model = typeof rec.model === 'string' ? rec.model.trim() : '';
    for (const [field, value] of [['name', name], ['base_url', baseUrl], ['api_key', apiKey], ['model', model]] as const) {
      if (!value) errors.push(`${where}: missing ${field}`);
    }
    if (!name || !baseUrl || !apiKey || !model) return;

    const priority = typeof rec.priority === 'number' ? rec.priority : Number(rec.priority);
    if (!Number.isFinite(priority)) {
      errors.push(`${where}: priority must be a number`);
      return;
    }
    const expireRaw = rec.expire === undefined || rec.expire === null ? null : String(rec.expire).trim() || null;
    if (expireRaw && !DATE_PATTERN.test(expireRaw)) {
      errors.push(`${where}: expire must be YYYY-MM-DD or null, got "${expireRaw}"`);
      return;
    }
    // 失效日当天仍有效(日期粒度);已过期条目跳过并留痕。
    if (expireRaw && expireRaw < today) {
      console.warn(`[model-providers] ${name} 已过期(expire=${expireRaw}),跳过`);
      return;
    }
    const rateRaw = rec.rate_limit === undefined || rec.rate_limit === null ? undefined : Number(rec.rate_limit);
    if (rateRaw !== undefined && (!Number.isFinite(rateRaw) || rateRaw <= 0)) {
      errors.push(`${where}: rate_limit must be a positive number or null`);
      return;
    }
    const reasoningEffort = typeof rec.reasoning_effort === 'string' && rec.reasoning_effort.trim()
      ? rec.reasoning_effort.trim()
      : undefined;

    providers.push({
      name,
      priority,
      baseUrl,
      apiKey,
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(rateRaw !== undefined ? { rateLimitRpm: rateRaw } : {}),
      expire: expireRaw,
    });
  });

  if (errors.length > 0) {
    throw new Error(`model provider 文件 ${path} 配置错误:\n  ${errors.join('\n  ')}`);
  }
  providers.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  if (providers.length === 0) {
    throw new Error(`model provider 文件 ${path} 没有有效提供商(全部缺失字段或已过期,今天 ${today})`);
  }
  return { path, providers };
}
