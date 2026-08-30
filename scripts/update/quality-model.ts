/**
 * 文章质量模型推理（纯 TypeScript，无生产依赖）。
 *
 * 模型 artifact：ml/artifacts/current/model.json（由 python ml/train.py --final 导出）。
 * 特征规范与训练侧 ml/train.py 严格一致（plan §26）：
 *   text = normalize(NFKC + lowercase + 空白折叠)(title + "\n\n" + body)
 *   特征 = 长度 3-5 的字符 n-gram；value = (1 + ln(count)) × idf；无文档长度归一
 *   score = sigmoid(bias + Σ_kept w_f × value_f)
 *   语义：REJECT = 正类；score >= threshold 时 auto-reject（plan §10/§20/§21）
 *
 * 集成纪律（plan §28/§29）：QUALITY_GATE_MODE 默认 off；shadow 只记录不拦截；
 * enforce 才允许阻塞入库。本模块不得影响默认生产行为。
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type QualityGateMode = 'off' | 'shadow' | 'enforce';

export interface QualityVerdict {
  score: number;
  decision: 'keep' | 'reject';
  modelVersion: string;
  /** 产生该判定时的阈值（供 shadow 记录与审计）。 */
  threshold: number;
}

export interface QualityGateOutcome {
  mode: QualityGateMode;
  verdict: QualityVerdict;
  /** 仅 enforce 模式下 decision === 'reject' 时为 true */
  blocked: boolean;
  /** 命中的确定性 URL 规则名（该簇不依赖模型分数） */
  ruleHit?: string;
}

/**
 * 已确诊的系统性误收簇（2026-08-30 人工复核结论，见 tran/CORRECTION_TASK_HANDOVER.md）：
 * MSR research-focus 周刊为纯聚合页，模型分数漂移（0.35-0.95）无法一致处理，
 * 走确定性规则否决，不依赖模型分数。新增规则须有复核证据支撑。
 */
const URL_REJECT_RULES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'msr-research-focus-weekly', pattern: /\/research-focus-/i },
];

export interface QualityModelArtifact {
  modelVersion: string;
  bias: number;
  threshold: number;
  spec: { charNgram: [number, number] };
  char: Record<string, [number, number]>;
  validation: Record<string, unknown>;
}

const MODEL_PATH = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'ml', 'artifacts', 'current', 'model.json');

let cachedModel: QualityModelArtifact | null = null;

/** 加载模型 artifact（进程内缓存）。文件缺失时抛错——调用方只在 gate 开启时才会走到这里。 */
export function loadQualityModel(): QualityModelArtifact {
  if (!cachedModel) {
    cachedModel = JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as QualityModelArtifact;
  }
  return cachedModel;
}

/** 测试注入用；生产代码不要调用。 */
export function setQualityModelForTest(model: QualityModelArtifact | null): void {
  cachedModel = model;
}

/** 与 Python normalize_text 严格对齐：NFKC → lowercase → 空白折叠。 */
export function normalizeArticleText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 纯打分：不做任何门禁决策。 */
export function scoreArticle(model: QualityModelArtifact, title: string, body: string): number {
  const text = normalizeArticleText(`${title}\n\n${body}`);
  const counts = new Map<string, number>();
  const [lo, hi] = model.spec.charNgram;
  const vocab = model.char;
  for (let n = lo; n <= hi; n += 1) {
    for (let i = 0; i + n <= text.length; i += 1) {
      const g = text.slice(i, i + n);
      const entry = vocab[g];
      if (entry !== undefined) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  let z = model.bias;
  for (const [g, c] of counts) {
    const [idf, w] = vocab[g]!;
    z += w * (1 + Math.log(c)) * idf;
  }
  return 1 / (1 + Math.exp(-z));
}

/** plan §37.4 的生产接口：classifyArticleQuality(article) → {score, decision, modelVersion} */
export function classifyArticleQuality(
  article: { title?: string; contentMarkdown: string },
  model: QualityModelArtifact = loadQualityModel(),
): QualityVerdict {
  const score = scoreArticle(model, article.title ?? '', article.contentMarkdown);
  return {
    score,
    decision: score >= model.threshold ? 'reject' : 'keep',
    modelVersion: model.modelVersion,
    threshold: model.threshold,
  };
}

/** QUALITY_GATE_MODE 解析：缺省/非法值一律 off（fail-safe，plan §21）。 */
export function resolveQualityGateMode(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): QualityGateMode {
  const raw = (env.QUALITY_GATE_MODE ?? '').trim().toLowerCase();
  if (raw === 'shadow' || raw === 'enforce') return raw;
  return 'off';
}

export interface QualityShadowRecord {
  sourceId: string;
  url: string;
  title?: string;
  score: number;
  wouldReject: boolean;
  modelVersion: string;
  threshold: number;
  at: string;
}

/**
 * shadow 观测记录落盘（JSONL，一行一条）。路径由 QUALITY_SHADOW_LOG 指定，
 * 缺省 ml/shadow-scores.jsonl。仅在 shadow/enforce 模式由调用方触发；写失败
 * 只降级为警告，绝不影响抓取主流程。
 */
export function appendShadowRecord(record: QualityShadowRecord, env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): void {
  try {
    const file = resolve(env.QUALITY_SHADOW_LOG ?? 'ml/shadow-scores.jsonl');
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // 观测失败不阻塞业务（plan §29：shadow 只观察）。
  }
}

/**
 * 门禁评估入口（backfill/audit 在完整性门禁之后调用）。
 * off：不计算模型分数，返回占位 verdict，行为与未接入完全一致。
 * shadow：计算并记录 wouldReject，但不拦截。
 * enforce：reject 时 blocked=true，由调用方决定阻塞。
 */
export function evaluateQualityGate(
  article: { title?: string; contentMarkdown: string },
  mode: QualityGateMode,
  options: { log?: (message: string) => void; url?: string } = {},
): QualityGateOutcome {
  if (mode === 'off') {
    return { mode, verdict: { score: 0, decision: 'keep', modelVersion: 'none', threshold: 0 }, blocked: false };
  }
  const model = loadQualityModel();
  const verdict = classifyArticleQuality(article, model);
  const rule = options.url
    ? URL_REJECT_RULES.find((r) => r.pattern.test(options.url!))
    : undefined;
  if (rule) {
    const ruled: QualityVerdict = { ...verdict, decision: 'reject' };
    if (mode === 'shadow') {
      options.log?.(`quality-shadow: rule=${rule.name} wouldReject=true model=${verdict.modelVersion}`);
      return { mode, verdict: ruled, blocked: false, ruleHit: rule.name };
    }
    return { mode, verdict: ruled, blocked: true, ruleHit: rule.name };
  }
  if (mode === 'shadow') {
    options.log?.(`quality-shadow: score=${verdict.score.toFixed(4)} wouldReject=${verdict.decision === 'reject'} model=${verdict.modelVersion}`);
    return { mode, verdict, blocked: false };
  }
  return { mode, verdict, blocked: verdict.decision === 'reject' };
}
