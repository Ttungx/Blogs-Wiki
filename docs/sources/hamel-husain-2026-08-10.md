# Hamel Husain 核验报告

核验日期：2026-08-10。状态：**通过**（3/3 样本 PASS）。

## 证据

- `npm run audit:source -- --source hamel-husain --samples 3`：rss ok（13 候选）、sitemap 未配置、listing 0。
- PASS：`eval-smell`（2026-06-29，en，markdown 21902，图片 2）、`revenge`（2026-03-26，en，markdown 12378，图片 27）、`evals-skills`（2026-03-02，en，markdown 4244，图片 1）。
- 无官方中文版本（个人 Hugo 博客，EN）。
- 小瑕疵：提取标题带站点后缀（`– Hamel's Blog`），不影响正文与展示，可在展示层裁剪。

## 建议的 sources.json 配置修正

- 现有配置（rss + `article_paths: ["/blog"]`）无需修改。可选：补 `sitemap_url: https://hamel.dev/sitemap.xml` 以增强发现冗余，非必须。

## 可否转 active

可以。内容与当前方向（Agent / Evals）高度一致，三篇样本全部达标。
