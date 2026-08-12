/**
 * 从 URL 路径推断发布日期的纯函数 —— Node fetch 与 Worker fetch 共用。
 *
 * 适用站点：页面无 meta/JSON-LD 日期、sitemap 无 lastmod，但 URL 路径本身
 * 含发布日期（如 simonwillison.net 的 /2026/Jul/9/slug/）。
 * 零 Node-only 依赖，Worker 打包安全。
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * 按 url_date_pattern 从 URL 推断日期，返回 YYYY-MM-DD 或 undefined。
 * 模式必须含年份捕获组（match[1]），可选月（match[2]，Jan-Dec 缩写）与
 * 日（match[3]）捕获组。
 */
export function urlDateFromPattern(
  pattern: string | undefined,
  url: string | undefined,
): string | undefined {
  if (!pattern || !url) return undefined;
  try {
    const match = url.match(new RegExp(pattern));
    if (!match) return undefined;
    const year = Number(match[1]);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return undefined;
    if (match[3] === undefined) return `${year}-01-01`;
    const monthText = match[2]?.toLowerCase().slice(0, 3);
    const month = MONTHS[monthText ?? ''];
    if (month === undefined) return `${year}-01-01`;
    const day = Number(match[3]);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return undefined;
  }
}
