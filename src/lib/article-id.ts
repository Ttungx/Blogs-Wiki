/**
 * 文章 collection entry id 形如 `blogId/lang/slug`。
 * 路由层只用 slug（去掉 blogId 与语言段）作为 article 参数。
 */
export function slugFromId(id: string): string {
  const parts = id.split('/');
  return parts.slice(2).join('/') || parts[0];
}

/**
 * 跨语言把同一篇文章的不同语言版本归到一组：`blogId/lang/slug` → `blogId/slug`。
 */
export function groupArticleKey(id: string): string {
  const parts = id.split('/');
  return `${parts[0]}/${parts.slice(2).join('/')}`;
}
