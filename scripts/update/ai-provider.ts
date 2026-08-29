/**
 * AI 服务商选择：用 .env 的总选择器 AI_PROVIDER 在 3 个 OpenAI 兼容槽位间切换。
 *
 * 环境变量约定：
 *   AI_PROVIDER=1|2|3                 总选择器；设置后启用对应槽位
 *   AI_PROVIDER_<n>_BASE_URL          OpenAI 兼容端点，如 https://api.deepseek.com/v1
 *   AI_PROVIDER_<n>_API_KEY           该服务商的 API key
 *   AI_PROVIDER_<n>_MODEL             模型名
 *   AI_PROVIDER_<n>_REASONING_EFFORT  可选；缺省回落全局 MODEL_REASONING_EFFORT
 *
 * 未设置 AI_PROVIDER 时回落平铺变量 OPENAI_API_KEY / OPENAI_BASE_URL /
 * TRANSLATION_MODEL（+ 全局 MODEL_REASONING_EFFORT），即既有行为；
 * Render 生产 env 只注入平铺变量，因此不受本选择器影响。
 */

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 发送到 chat/completions 顶层 reasoning_effort；空则不发。 */
  reasoningEffort?: string;
}

/** 仅读字符串环境变量的窄类型，便于测试传字面量对象。 */
export type AiProviderEnv = Readonly<Record<string, string | undefined>>;

const SLOT_IDS = ['1', '2', '3'] as const;
export type AiProviderSlotId = (typeof SLOT_IDS)[number];

function trimmed(value: string | undefined): string {
  return (value ?? '').trim();
}

/** 缺省 reasoning_effort：槽位级优先，其次全局。 */
function resolveReasoningEffort(env: AiProviderEnv, slot: AiProviderSlotId): string | undefined {
  return trimmed(env[`AI_PROVIDER_${slot}_REASONING_EFFORT`])
    || trimmed(env.MODEL_REASONING_EFFORT)
    || undefined;
}

/**
 * 读取指定槽位并强制齐全：任一必填项缺失即抛错，
 * 避免带着半截配置静默打到错误端点。
 */
function readSlot(env: AiProviderEnv, slot: AiProviderSlotId): AiProviderConfig {
  const prefix = `AI_PROVIDER_${slot}`;
  const baseUrl = trimmed(env[`${prefix}_BASE_URL`]);
  const apiKey = trimmed(env[`${prefix}_API_KEY`]);
  const model = trimmed(env[`${prefix}_MODEL`]);

  const missing: string[] = [];
  if (!baseUrl) missing.push(`${prefix}_BASE_URL`);
  if (!apiKey) missing.push(`${prefix}_API_KEY`);
  if (!model) missing.push(`${prefix}_MODEL`);
  if (missing.length > 0) {
    throw new Error(`AI_PROVIDER=${slot} selected but missing config: ${missing.join(', ')}`);
  }

  return { apiKey, baseUrl, model, reasoningEffort: resolveReasoningEffort(env, slot) };
}

/**
 * 解析生效的服务商配置。
 *
 * - 设置了合法的 AI_PROVIDER → 返回该槽位（必填项缺失抛错）。
 * - AI_PROVIDER 为非法值 → 抛错。
 * - 未设置 → 回落平铺变量；字符串可能为空，由调用方按原有口径校验
 *   （保持 runner/batch-translate 现有报错文案与 dry-run 行为不变）。
 */
export function resolveAiProvider(env: AiProviderEnv = process.env): AiProviderConfig {
  const selector = trimmed(env.AI_PROVIDER);

  if (selector === '') {
    return {
      apiKey: env.OPENAI_API_KEY ?? '',
      baseUrl: env.OPENAI_BASE_URL ?? '',
      model: env.TRANSLATION_MODEL ?? '',
      reasoningEffort: trimmed(env.MODEL_REASONING_EFFORT) || undefined,
    };
  }

  if (!(SLOT_IDS as readonly string[]).includes(selector)) {
    throw new Error(`AI_PROVIDER must be ${SLOT_IDS.join(', ')}, got "${selector}"`);
  }
  const slot = selector as AiProviderSlotId;
  return readSlot(env, slot);
}
