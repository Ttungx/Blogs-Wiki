/**
 * 解析 HTML 中的 immediate meta-refresh 壳页（`content="0; url=X"`）。
 *
 * 部分站点把已迁移的文章留在旧 URL，返回一个仅含
 * `<meta http-equiv="refresh" content="0; url=NEW">` 的壳页（如 deepmind →
 * antigravity.google）。Defuddle/Readability 在壳页上只能提取极少字符，
 * 表现为「内容过短」硬失败。本函数识别这类壳，返回应重抓的目标 URL，
 * 让抓取链自动跟随一次，而非把壳页当作失败文章。
 *
 * 纯函数，Node 与 Worker 抓取链共用。
 */

/**
 * 提取 immediate meta-refresh 的目标 URL。
 * @returns 应重抓的目标绝对 URL；非壳页、延迟刷新、或同 URL 刷新返回 null。
 */
export function extractMetaRefreshUrl(html: string, baseUrl: string): string | null {
  const metaRe = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(metaRe)) {
    const tag = match[0];
    if (!/http-equiv\s*=\s*["']?refresh["']?/i.test(tag)) continue;
    const contentMatch = tag.match(/content\s*=\s*["']?([^"'>]+)/i);
    if (!contentMatch) continue;
    const content = contentMatch[1].trim();
    // 格式 "0; url=X" / "0;URL=X" / "0; url='X'"
    const urlMatch = content.match(/^\s*(\d+)\s*;\s*url\s*=\s*(.+)$/i);
    if (!urlMatch) continue;
    const delay = Number.parseInt(urlMatch[1], 10);
    if (delay > 0) continue; // 延迟刷新（非迁移壳），不跟随
    const rawTarget = urlMatch[2].trim().replace(/^['"]|['"]$/g, '');
    if (!rawTarget) continue;
    try {
      const resolved = new URL(rawTarget, baseUrl).toString();
      if (resolved === baseUrl) continue; // 同 URL 刷新，不跟随
      return resolved;
    } catch {
      continue;
    }
  }
  return null;
}
