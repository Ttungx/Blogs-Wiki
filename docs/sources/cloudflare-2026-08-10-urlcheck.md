# Cloudflare 来源 URL 边界核验（2026-08-10）

## 结论

结构性问题是本地化重复：sitemap-posts.xml 共 7755 条，英文根路径 3575 条（46%），20 个本地化前缀 4180 条（54%）。英文侧全部为单段 slug 文章，无独立二级栏目，但博客本身技术文章与产品发布公告混排（如 FedRAMP Class D 认证公告），属该源固有形态。

## 证据

- `sitemap.xml` 是索引，仅指向 `sitemap-posts.xml`（无其他子 sitemap）。
- sitemap-posts.xml：7755 条 `<loc>`；英文根 3575（全部 `/<slug>/` 单段形态，无 /press-releases/ 等二级路径）；本地化前缀分布：zh-cn 742、ja-jp 733、fr-fr 484、de-de 483、ko-kr 452、es-es 437、zh-tw 405、pt-br 105、nl-nl 62、id-id 56、it-it 53、th-th 51、es-la 45、ru-ru 27、pl-pl 22、vi-vn 10、ar-ar 5、he-il 4、sv-se 3、tr-tr 1。
- RSS `/rss/`：仅 20 条（最近文章），全英文无本地化 URL，覆盖不全，不能作主源。

## 建议的 sources.json 配置

- 保留 `sitemap_url: https://blog.cloudflare.com/sitemap.xml`（索引→posts 单文件，无需 sitemap_include_paths）。
- `exclude_paths` 精确列出 20 个本地化前缀（见上），只留英文 3575 条。
- `use_rss` 不用（20 条覆盖不足）。
- 保持 active，英文量 3575 靠每源 --limit 增量控制。

## mixedIssues

- 技术内容与产品发布公告混排（无独立栏目可切分），公司公告无法用路径排除，只能靠内容过滤。
