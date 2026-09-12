/**
 * 伪数学判定（渲染 / 翻译保护 / 完整性校验三处共用，单一实现防漂移）。
 *
 * remark-math 会把正文中的美元金额对（`$600 ... $7,000`）配对成行内公式：
 * KaTeX 把中间一整段英文渲染成无空格斜体（2026-09-12
 * openai/research-acceleration-view-inside-openai 实证），翻译保护还会把
 * 该句当公式原样保留、阻止翻译。
 *
 * 判定规则：真 TeX 几乎必带信号（反斜杠命令、上下标、花括号、对齐符、
 * 换行符）；金额与普通文本没有。缺信号即伪数学——宁可把 `$x + y$` 显示成
 * 字面文本，也不吞掉一整段正文。
 */
export const TEX_SIGNAL_RE = /\\[a-zA-Z]+|\\\\|[{}^_&]/;

/** 缺 TeX 信号的 math/inlineMath 节点内容 = 伪数学。 */
export function isPseudoMath(value: string | undefined | null): boolean {
  if (!value) return false;
  return !TEX_SIGNAL_RE.test(value);
}
