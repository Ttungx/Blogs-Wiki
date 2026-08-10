/**
 * Remark plugin that routes remote article images through the local image
 * proxy during `astro dev`. Production builds keep the original remote URLs.
 */
export function remarkImageProxy({ dev, base }) {
  if (!dev) return () => {};

  const basePath = (base || '/').endsWith('/') ? base || '/' : `${base}/`;
  const endpoint = `${basePath}__image_proxy`;

  function rewrite(node) {
    if (node?.type === 'image' && /^https?:\/\//i.test(node.url)) {
      node.url = `${endpoint}?url=${encodeURIComponent(node.url)}`;
    }
    if (Array.isArray(node?.children)) {
      for (const child of node.children) rewrite(child);
    }
  }

  return () => (tree) => rewrite(tree);
}
