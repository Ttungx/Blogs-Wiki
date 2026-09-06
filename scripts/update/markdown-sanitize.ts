/**
 * Markdown 落库前的卫生处理 —— Node fetch（normalizeArticleMarkdown）与
 * Worker 提取器（extractor.ts）共用。零 Node-only 依赖，Worker 打包安全。
 */

/** markdown 图片语法形式：`![alt](data:image/png;base64,...)`。 */
const DATA_URI_IMAGE = /!\[[^\]]*\]\(data:[^)]*\)/g;

/** 残留 HTML 形式（API 直返 markdown 的源可能内嵌 img 标签）。 */
const DATA_URI_IMG_TAG = /<img\b[^>]*\bsrc=["']data:[^"']*["'][^>]*>/gi;

/**
 * 剥离内联 data: URI 图片。Quarto 等站点把配图 base64 内联进页面，转出的
 * 单篇 markdown 可达 MB 级且 99% 是图片负载（maxime-labonne 2026-09-05 抽查
 * 结论）；图片本体不进内容库/D1/构建产物，封面回退 og:image（或无封面）。
 */
export function stripInlineDataUriImages(markdown: string): string {
  return markdown.replace(DATA_URI_IMAGE, '').replace(DATA_URI_IMG_TAG, '');
}
