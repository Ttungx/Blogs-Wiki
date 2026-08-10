# Eugene Yan 核验报告

核验日期：2026-08-10。状态：**受阻**（1/3 样本失败：站外跳转占位页）。

## 证据

- `npm run audit:source -- --source eugene-yan --samples 3`：rss ok（181 候选）、sitemap ok（181 候选）、listing ok（181 候选），三入口合并一致。
- PASS：`cybersecurity-evals`（2026-06-21，en，markdown 27764，图片 11）、`working-with-ai`（2026-05-03，en，markdown 16337，图片 0）。
- FAIL：`/writing/secure-source-code` —— 页面 200 但为 `noindex` 跳转占位（meta refresh + canonical + JS `location=` 指向 `https://claude.com/blog/using-llms-to-secure-source-code`，站外托管），Readability 只提取到 37 字符，报 `extracted content too short`。此为内容已迁移站外的正常结果，非抓取缺陷。
- 图片抽查：`/assets/*.webp` 同域根相对路径，原链正常。无官方中文版本。

## 建议的 sources.json 配置修正

- 候选过滤需处理跳转占位页：跟随 canonical 解析（站外则跳过）或排除 `noindex` / 仅重定向页。可等价于为该 URL 加排除，但更通用的是在抓取层识别 meta-refresh/canonical 跳转。
- `article_paths: ["/writing"]` 保持有效，三入口候选一致。

## 可否转 active

暂不可。跳转占位页会让样本审计持续 FAIL 并可能产出空文章；跳转处理落地后即可转 active。
