/**
 * 修复标题中撇号后的异常空格（翻译产物常见 "we' re" / "don' t"）。
 * 仅收窄到英文缩写后缀（re/ll/ve/m/t/d/s + 词边界），避免误伤
 * "students' books" 这类合法所有格空格；撇号字符（直/弯）原样保留。
 */
const APOSTROPHE_GAP = /([A-Za-z])(['\u2019]) (?=(?:re|ll|ve|m|t|d|s)\b)/gi;

export function fixTitleSpacing(title: string): string {
  return title.replace(APOSTROPHE_GAP, '$1$2');
}

/**
 * 净化标题污染：行首 Markdown 标题标记（`# `）、标签状 token
 * （`<title>`、`<think>` 等模型/抓取泄漏）与多余空白。
 * 只删 `<字母…>` 形状的标签，不伤 "a < b" 这类合法尖括号。
 */
const HEADING_PREFIX = /^#{1,6}\s+/;
const TAG_TOKEN = /<\/?[A-Za-z][^<>]*>/g;

export function cleanTitle(title: string): string {
  return title
    .replace(HEADING_PREFIX, '')
    .replace(TAG_TOKEN, '')
    .replace(/\s+/g, ' ')
    .trim();
}
