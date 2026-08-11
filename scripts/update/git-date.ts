/**
 * GitHub 提交日期解析纯函数 —— 与抓取实现（jsdom 等）解耦。
 *
 * 从 fetch.ts 提取：resolveGitDate / resolveGitFilePath / normalizeDate /
 * USER_AGENT 不依赖 Node-only 模块，Node 与 Worker 共用。fetch.ts 保留
 * 自身抓取逻辑并 re-export 本模块保持调用方不破坏。
 *
 * 零 Node-only 导入，Worker 打包安全。
 */

import type { FetchLike, SourceConfig } from './types';

export const USER_AGENT = 'BlogsWikiBot/0.1 (+https://github.com; article fetch)';

/** 规范化日期字符串为 YYYY-MM-DD 或 ISO 8601；无法解析返回 null。 */
export function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 把文章 URL 解析为 git 仓库内的源文件路径（见 SourceConfig.git_date）。 */
export function resolveGitFilePath(
  articleUrl: string,
  gitDate: NonNullable<SourceConfig['git_date']>,
): string {
  let pathname = new URL(articleUrl).pathname;
  if (gitDate.path_prefix && pathname.startsWith(gitDate.path_prefix)) {
    pathname = pathname.slice(gitDate.path_prefix.length);
  }
  pathname = pathname.replace(/^\/+|\/+$/g, '');
  const slug = pathname.split('/').filter(Boolean).at(-1) ?? 'article';
  return gitDate.path_template
    .replace(/\{pathname\}/g, pathname)
    .replace(/\{slug\}/g, slug);
}

/**
 * 从 GitHub 提交历史取文章首次提交日期。适用于页面无任何机器可读日期的
 * GitHub Pages 博客（如 keli-wen.github.io）。best-effort：失败返回空串。
 */
export async function resolveGitDate(
  source: SourceConfig,
  articleUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const gitDate = source.git_date;
  if (!gitDate) return '';
  const filePath = resolveGitFilePath(articleUrl, gitDate);
  const apiUrl = new URL(`https://api.github.com/repos/${gitDate.repo}/commits`);
  apiUrl.searchParams.set('path', filePath);
  apiUrl.searchParams.set('per_page', '100');
  if (gitDate.branch) apiUrl.searchParams.set('sha', gitDate.branch);

  try {
    const response = await fetchImpl(apiUrl.toString(), {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': USER_AGENT,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return '';
    const commits = (await response.json()) as Array<{ commit?: { committer?: { date?: string } } }>;
    // 列表按最新在前，最早的提交（文章创建）在最后。
    const first = commits.at(-1)?.commit?.committer?.date;
    return first ? normalizeDate(first) ?? '' : '';
  } catch {
    return '';
  }
}
