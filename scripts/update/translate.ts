import { categoryPrompt, normalizeCategories } from './classify';
import { assertMathIntegrity } from './content-integrity';
import { protectMarkdown, restoreMarkdown } from './translation-plan';
import type { ExtractedArticle, FetchLike, TranslateArticle } from './types';

export interface TranslateOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  /** chat/completions 的 max_tokens。思考型模型（如 step-3.7）会把大量
   * 预算用于推理，长文翻译不设上限可能思考到超时；设大预算保证 JSON 输出。 */
  maxTokens?: number;
  fetchImpl?: FetchLike;
  retryOptions?: RetryOptions;
  /**
   * OpenAI/DeepSeek 兼容的 reasoning_effort（如 low/high/max）。
   * 经 ocx 网关透传；DeepSeek V4 Flash 支持 low/high/max。
   */
  reasoningEffort?: string;
}

export interface RetryOptions {
  /** 429 最多重试次数（不含首次请求），默认 2。 */
  maxRetries?: number;
  /** 无 Retry-After 头时的退避间隔，默认 15s。 */
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_TOKENS = 16_000;
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  retryDelayMs: 15_000,
};
/** Retry-After 合成退避的上限，避免单个请求拖垮整轮更新。 */
const MAX_BACKOFF_MS = 60_000;
const RETRY_JSON_HINT =
  '\n\nYour previous response was not valid JSON. You MUST output only valid JSON matching the required shape, with no extra text.';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class ModelJsonError extends Error {
  constructor(content: string) {
    super(`model output is not valid JSON: ${truncate(content, 800)}`);
    this.name = 'ModelJsonError';
  }
}

/** HTTP 429 限流错误：携带上游要求的重试等待时间（毫秒，可能为 null）。 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_BACKOFF_MS);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function buildSystemPrompt(categories: readonly string[]): string {
  return [
    'You are a professional translator and editor for a Chinese-language blog wiki covering AI, machine learning, philosophy, and personal growth.',
    'Translate the article into fluent, natural Simplified Chinese. Preserve the author\'s original intent, tone, and meaning; do not rewrite or editorialize.',
    'Rules:',
    '- Translate the title and the full body text.',
    '- Preserve the original Markdown structure exactly: code blocks, inline code, links, images, blockquotes, tables, lists, and heading levels.',
    '- Keep URLs, image paths, code, and technical identifiers unchanged.',
    '- Do not add, remove, or summarize content.',
    '- Terminology retention (critical for this wiki\'s audience of technical readers):',
    '  • Keep domain terminology in English when it is the standard term of art: model and method names (chain-of-thought, in-context learning, reinforcement learning, retrieval-augmented generation, fine-tuning, RLHF, scaling laws), system and framework concepts (Harness, Context Engineering, agent, prompt, embedding, transformer).',
    '  • Always keep in English: proper nouns, product names, model names, and acronyms (Claude Code, GPT-4, RSI, MCE, STOP, GEPA, MCP, LLM).',
    '  • On first occurrence of an acronym you MAY add a Chinese gloss in parentheses, e.g. "递归自我改进（RSI）"; use the bare acronym thereafter.',
    '  • Heading-level structural labels stay in English when the source uses them as labels: e.g. "Pattern 1", "Pattern 2", not "模式一".',
    '  • Every sentence must read as complete, grammatical Chinese. Never leave English connective phrases untranslated mid-sentence (e.g. do NOT produce "…Harness工程 additionally include 工作流设计…"). Translate all connective, descriptive, and narrative prose to Chinese; only the technical terms themselves remain in English.',
    '',
    'After translating, classify the article and choose one or more categories from the allowed list.',
    categoryPrompt(categories),
    '',
    'Respond with valid JSON only, using exactly this shape:',
    '{"translated_title": string, "categories": string[], "content_markdown": string}',
  ].join('\n');
}

function buildUserMessage(article: ExtractedArticle): string {
  return JSON.stringify({
    url: article.url,
    original_title: article.title,
    author: article.author ?? null,
    published_at: article.publishedAt,
    original_language: article.originalLanguage,
    content_markdown: article.contentMarkdown,
  }, null, 2);
}

/** Extract the first balanced `{...}` block, skipping braces inside strings. */
export function extractFirstJsonBlock(content: string): string | null {
  const start = content.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse model content as a JSON object: full parse, then first JSON block. */
export function parseModelJson(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to block extraction
  }

  const block = extractFirstJsonBlock(content);
  if (block !== null) {
    try {
      const parsed: unknown = JSON.parse(block);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }

  throw new ModelJsonError(content);
}

function extractMessageContent(envelope: unknown): unknown {
  if (envelope === null || typeof envelope !== 'object') return undefined;
  const choices = (envelope as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (first === null || typeof first !== 'object') return undefined;
  const message = (first as Record<string, unknown>).message;
  if (message === null || typeof message !== 'object') return undefined;
  return (message as Record<string, unknown>).content;
}

export async function requestChatCompletion(
  fetchImpl: FetchLike,
  endpoint: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  retryOptions: RetryOptions = {},
): Promise<string> {
  const { maxRetries, retryDelayMs } = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };

  const attempt = async (): Promise<string> => {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const timeoutHint = error instanceof Error && error.name === 'TimeoutError'
        ? ` (timed out after ${timeoutMs}ms)`
        : '';
      throw new Error(`translate request failed (${endpoint}): ${reason}${timeoutHint}`);
    }

    const rawText = await response.text().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`translate response read failed (HTTP ${response.status}): ${reason}`);
    });

    if (!response.ok) {
      const message =
        `translate request failed (${endpoint}): HTTP ${response.status} ${response.statusText} — ${truncate(rawText, 500)}`;
      if (response.status === 429) {
        throw new RateLimitError(message, parseRetryAfter(response.headers.get('retry-after')));
      }
      throw new Error(message);
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(rawText);
    } catch {
      throw new Error(`translate response is not JSON (${endpoint}, HTTP ${response.status}): ${truncate(rawText, 500)}`);
    }

    const content = extractMessageContent(envelope);
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error(
        `translate response has no message content (${endpoint}, HTTP ${response.status}): ${truncate(rawText, 500)}`,
      );
    }
    return content;
  };

  for (let attemptCount = 0; ; attemptCount += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof RateLimitError) || attemptCount >= maxRetries) throw error;
      await sleep(error.retryAfterMs ?? retryDelayMs);
    }
  }
}

/**
 * Create an OpenAI-compatible translation + classification client.
 * One model call translates the article and picks categories; the output
 * is validated and normalized before being returned.
 */
export function createTranslateClient(options: TranslateOptions): TranslateArticle {
  const apiKey = options.apiKey;
  // Accept both a base URL (…/v1) and a full endpoint (…/v1/chat/completions).
  const endpoint = `${options.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')}/chat/completions`;
  const model = options.model;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const retryOptions = options.retryOptions ?? {};
  const reasoningEffort = options.reasoningEffort?.trim() || undefined;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (article, categories) => {
    try {
      // TeX/code/URL are opaque: protect before the model sees the body.
      const protectedBody = protectMarkdown(article.contentMarkdown);
      const protectedArticle: ExtractedArticle = {
        ...article,
        contentMarkdown: protectedBody.text,
      };
      const systemPrompt = buildSystemPrompt(categories);
      const userMessage = buildUserMessage(protectedArticle);
      const baseMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];

      const run = async (messages: ChatMessage[]): Promise<Record<string, unknown>> => {
        const body: Record<string, unknown> = {
          model,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
        };
        if (reasoningEffort) body.reasoning_effort = reasoningEffort;
        const content = await requestChatCompletion(fetchImpl, endpoint, apiKey, body, timeoutMs, retryOptions);
        return parseModelJson(content);
      };

      let parsed: Record<string, unknown>;
      try {
        parsed = await run(baseMessages);
      } catch (error) {
        // Retry once (same request, with a "must output valid JSON" hint)
        // when the model output could not be parsed as JSON.
        if (!(error instanceof ModelJsonError)) throw error;
        parsed = await run([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userMessage}${RETRY_JSON_HINT}` },
        ]);
      }

      const rawTitle = parsed.translated_title;
      const translatedTitle = typeof rawTitle === 'string' && rawTitle.trim() !== ''
        ? rawTitle.trim()
        : article.title;

      const rawContent = parsed.content_markdown;
      const protectedContent = typeof rawContent === 'string' ? rawContent : '';
      if (protectedContent.trim() === '') {
        throw new Error('model returned an empty content_markdown');
      }

      const contentMarkdown = restoreMarkdown(protectedContent, protectedBody.spans);
      assertMathIntegrity(article.contentMarkdown, contentMarkdown);

      return {
        translatedTitle,
        categories: normalizeCategories(parsed.categories, categories),
        contentMarkdown,
        model,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`translate failed for ${article.url} (model: ${model}): ${reason}`);
    }
  };
}
