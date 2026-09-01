/**
 * 修复标题中撇号后的异常空格（翻译产物常见 "we' re" / "don' t"）。
 * 仅收窄到英文缩写后缀（re/ll/ve/m/t/d/s + 词边界），避免误伤
 * "students' books" 这类合法所有格空格；撇号字符（直/弯）原样保留。
 */
const APOSTROPHE_GAP = /([A-Za-z])(['\u2019]) (?=(?:re|ll|ve|m|t|d|s)\b)/gi;

export function fixTitleSpacing(title: string): string {
  return title.replace(APOSTROPHE_GAP, '$1$2');
}
