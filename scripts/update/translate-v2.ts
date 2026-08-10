import { categoryPrompt, normalizeCategories } from './classify';
import { createTranslationPlan } from './translation-plan';
import {
  ModelJsonError,
  parseModelJson,
  requestChatCompletion,
} from './translate';
import type {
  ChatMessage,
} from './translate';
import type {
  ExtractedArticle,
  FetchLike,
  TranslateArticle,
  TranslationResult,
} from './types';

export interface TranslateV2Options {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Optional separate model for classification (decoupled). Defaults to `model`. */
  classifyModel?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  /** Token cap per body chunk passed to the planner (default 6000). */
  maxChunkTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;
const RETRY_JSON_HINT =
  '\n\nYour previous response was not valid JSON. You MUST output only valid JSON matching the required shape, with no extra text.';

function endpointFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')}/chat/completions`;
}

function buildTranslateSystemPrompt(): string {
  return [
    'You are a professional translator for a Chinese-language blog wiki covering AI, machine learning, philosophy, and personal growth.',
    'Translate the provided Markdown chunk into fluent, natural Simplified Chinese. Preserve the author\'s original intent; do not rewrite or editorialize.',
    'Rules:',
    '- Preserve the Markdown structure exactly: heading levels, code blocks, inline code, links, images, blockquotes, tables, lists.',
    '- Tokens like {{BW:url:1}} or {{BW:code:2}} are placeholders for protected content. They MUST appear in the output exactly as given, in the same positions.',
    '- Do not translate, modify, add, or remove any placeholder token.',
    '- Keep URLs, image paths, code, and technical identifiers unchanged.',
    '- Terminology retention (critical for this wiki\'s audience of technical readers):',
    '  • Keep domain terminology in English when it is the standard term of art: model and method names (chain-of-thought, in-context learning, reinforcement learning, retrieval-augmented generation, fine-tuning, RLHF, scaling laws), system and framework concepts (Harness, Context Engineering, agent, prompt, embedding, transformer).',
    '  • Always keep in English: proper nouns, product names, model names, and acronyms (Claude Code, GPT-4, RSI, MCE, STOP, GEPA, MCP, LLM).',
    '  • On first occurrence of an acronym you MAY add a Chinese gloss in parentheses, e.g. "递归自我改进（RSI）"; use the bare acronym thereafter.',
    '  • Heading-level structural labels stay in English when the source uses them as labels: e.g. "Pattern 1", "Pattern 2", not "模式一".',
    '  • Every sentence must read as complete, grammatical Chinese. Never leave English connective phrases untranslated mid-sentence. Translate all connective, descriptive, and narrative prose to Chinese; only the technical terms themselves remain in English.',
    '',
    'Respond with valid JSON only, using exactly this shape:',
    '{"content_markdown": string}',
  ].join('\n');
}

function buildClassifySystemPrompt(categories: readonly string[]): string {
  return [
    'You are a content categorizer for a technology blog wiki.',
    'Choose one or more categories for the article from the allowed list.',
    categoryPrompt(categories),
    'Respond with valid JSON only, using exactly this shape:',
    '{"categories": string[]}',
  ].join('\n');
}

async function classifyArticle(
  options: TranslateV2Options,
  endpoint: string,
  article: ExtractedArticle,
  categories: readonly string[],
): Promise<string[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildClassifySystemPrompt(categories) },
    {
      role: 'user',
      content: JSON.stringify({
        url: article.url,
        original_title: article.title,
        content_markdown: article.contentMarkdown.slice(0, 30_000),
      }, null, 2),
    },
  ];
  const body = {
    model: options.classifyModel ?? options.model,
    messages,
    response_format: { type: 'json_object' },
  };
  const raw = await requestChatCompletion(options.fetchImpl ?? fetch, endpoint, options.apiKey, body, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let parsed: Record<string, unknown>;
  try {
    parsed = parseModelJson(raw);
  } catch (error) {
    if (!(error instanceof ModelJsonError)) throw error;
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: RETRY_JSON_HINT },
    ];
    const retryRaw = await requestChatCompletion(options.fetchImpl ?? fetch, endpoint, options.apiKey, { ...body, messages: retryMessages }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    parsed = parseModelJson(retryRaw);
  }
  return normalizeCategories(parsed.categories, categories);
}

async function translateChunk(
  options: TranslateV2Options,
  endpoint: string,
  source: string,
  headingPath: string[],
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildTranslateSystemPrompt() },
    {
      role: 'user',
      content: JSON.stringify({
        heading_path: headingPath,
        content_markdown: source,
      }, null, 2),
    },
  ];
  const body = {
    model: options.model,
    messages,
    response_format: { type: 'json_object' },
  };
  const run = async (msgs: ChatMessage[]): Promise<Record<string, unknown>> => {
    const raw = await requestChatCompletion(options.fetchImpl ?? fetch, endpoint, options.apiKey, { ...body, messages: msgs }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return parseModelJson(raw);
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = await run(messages);
  } catch (error) {
    if (!(error instanceof ModelJsonError)) throw error;
    parsed = await run([
      ...messages,
      { role: 'user', content: RETRY_JSON_HINT },
    ]);
  }

  const translated = parsed.content_markdown;
  if (typeof translated !== 'string' || translated.trim() === '') {
    throw new Error(`model returned an empty content_markdown for chunk "${headingPath.join(' / ') || '<root>'}"`);
  }
  return translated.trim();
}

/**
 * V2 translation client: AST-aware planning, protected chunks translated
 * independently, classification decoupled into a separate model call.
 *
 * - `translate` mode: chunks are translated (URLs/code/html tokens restored
 *   strictly) and then classified.
 * - `official-zh` / `native-zh` mode: content is already Simplified Chinese;
 *   translation is skipped and only classification runs.
 */
export function createTranslateV2Client(options: TranslateV2Options): TranslateArticle {
  const endpoint = endpointFor(options.baseUrl);

  return async (article, categories): Promise<TranslationResult> => {
    const plan = createTranslationPlan({
      markdown: article.contentMarkdown,
      title: article.title,
      url: article.url,
      sourceLanguage: article.originalLanguage,
      officialZh: article.contentSource === 'official-zh',
      chunk: { maxTokens: options.maxChunkTokens },
    });

    const classified = await classifyArticle(options, endpoint, article, categories);
    if (plan.mode !== 'translate') {
      return {
        translatedTitle: article.title,
        categories: classified,
        contentMarkdown: article.contentMarkdown,
        model: article.contentSource === 'official-zh' ? 'official-zh' : 'native-zh',
        translationStatus: plan.mode,
        ...(article.officialZhUrl ? { originalZhUrl: article.officialZhUrl } : {}),
      };
    }

    const translatedTitle = plan.title
      ? await translateChunk(options, endpoint, plan.title.source, ['<title>'])
      : article.title;

    const translatedBodies: string[] = [];
    for (const chunk of plan.chunks) {
      const translated = await translateChunk(options, endpoint, chunk.source, chunk.headingPath);
      const restored = restoreChunk(translated, chunk.spans.map((span) => span));
      translatedBodies.push(restored);
    }

    return {
      translatedTitle,
      categories: classified,
      contentMarkdown: translatedBodies.join('\n\n'),
      model: options.model,
      translationStatus: 'model',
      ...(article.officialZhUrl ? { originalZhUrl: article.officialZhUrl } : {}),
    };
  };
}

function restoreChunk(text: string, spans: Array<{ token: string; value: string }>): string {
  let restored = text;
  for (const span of spans) {
    const occurrences = restored.split(span.token).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `restore failed: token ${span.token} appears ${occurrences} times after translation, expected exactly 1 (model may have dropped or duplicated protected content)`,
      );
    }
    restored = restored.split(span.token).join(span.value);
  }
  const leftover = restored.match(/\{\{BW:(?:url|code|inline-code|html):\d+\}\}/g);
  if (leftover) {
    throw new Error(`restore failed: unexpected leftover token "${leftover[0]}"`);
  }
  return restored;
}
