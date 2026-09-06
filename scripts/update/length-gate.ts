/**
 * 原文长度前置硬门禁 —— 先于质量评分模型（2026-09-05 用户决策，阈值由
 * 生产语料调研反推，非拍脑袋）。
 *
 * 调研依据（生产 D1 published=1 共 1700 篇，en 1531 / zh 169）：
 * - 质量评分模型（字符 n-gram）系统性偏爱短文：短公告 qMed 0.13-0.35，
 *   全库中位 0.033；en <500 词集合 91% 会被模型放过 → 长度门必须前置。
 * - EN 300 词 ≈ 全库 p5（296）：拦下 Demo placeholder（17 词）、Circuits
 *   Updates 周更清单（72 词）、微型公告、论文摘要桩，将拒仅 5%；400/500
 *   起开始成批误杀 karpathy/deepmind 等 300-500 词真实文章。
 * - ZH 1500 CJK 字符：拦下 Cursor 公告主体（44/79）与 9 篇 CJK≈0 的抓取
 *   噪声（中文源残留英文原文），将拒 42.6%；2000 起误杀 Qwen2-VL/QwQ 等
 *   有货发布稿，高质量子集损失超 74%。
 * - "短而有货"（hamel FAQ 等）不靠降阈值保——降到 120 词也无法与 17-73 词
 *   的占位/公告区分；需要时按源豁免（`length_gate: "off"`）。
 */

export const LENGTH_GATE_MIN_EN_WORDS = 300;
export const LENGTH_GATE_MIN_ZH_CJK_CHARS = 1500;

/** 质量扫描 verdict 里长度门拒绝的 modelVersion 标记。 */
export const LENGTH_GATE_MODEL_VERSION = 'length-gate@1';

/** runner/backfill 永久拒绝复用的完整性错误码（不在可重试白名单内）。 */
export const LENGTH_GATE_CODE = 'original-too-short';

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

export interface LengthGateVerdict {
  ok: boolean;
  /** 实际度量：非中文原文 = 空白切分词数；中文原文 = CJK 字符数。 */
  metric: number;
  threshold: number;
  message: string;
}

/**
 * 判定原文是否通过长度前置门。语言按原文 original_language 判定：
 * zh 开头（zh / zh-cn / zh-Hans）用 CJK 字符数，其余语言用空白切分词数。
 * CJK 计数天然免疫 markdown 语法与英文残留——中文源里整篇英文的文章
 * （original_language 误标 zh）计 0 字符，同样被拦。
 */
export function checkOriginalLength(
  language: string,
  contentMarkdown: string,
  options: { disabled?: boolean } = {},
): LengthGateVerdict {
  if (/^zh/i.test(language.trim())) {
    const cjk = (contentMarkdown.match(CJK_PATTERN) ?? []).length;
    return {
      ok: options.disabled === true || cjk >= LENGTH_GATE_MIN_ZH_CJK_CHARS,
      metric: cjk,
      threshold: LENGTH_GATE_MIN_ZH_CJK_CHARS,
      message: `zh original ${cjk} CJK chars (min ${LENGTH_GATE_MIN_ZH_CJK_CHARS})`,
    };
  }
  const trimmed = contentMarkdown.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    ok: options.disabled === true || words >= LENGTH_GATE_MIN_EN_WORDS,
    metric: words,
    threshold: LENGTH_GATE_MIN_EN_WORDS,
    message: `non-zh original ${words} words (min ${LENGTH_GATE_MIN_EN_WORDS})`,
  };
}
