# TODO：抓取引擎迁移 Readability → Defuddle

基于 A/B 实测（3 篇代表性文章），Defuddle 在数学公式、脚注、元数据、噪声排除上全面优于 Readability。

## 核心替换

- [ ] `fetch.ts`：`new Readability(document).parse()` → `new Defuddle(document, { markdown: true }).parse()`
  - 注入 turndown 全局：import 前设 `globalThis.document`（jsdom 占位），否则报 `document is not defined`
  - Defuddle 的 `result.content` 在 `defuddle/full` + `markdown:true` 下直接返回 Markdown
- [ ] 删除 6 个手写元数据函数：`metaContent`、`resolveAuthor`、`resolvePublishedAt`、`resolveHeadImage`、`jsonLdDatePublished`、`resolveLanguage`——Defuddle 一次返回 title/author/published/image/language/schemaOrgData/wordCount
- [ ] 删除 `toMarkdown`——Defuddle 内置 turndown + 脚注/公式/代码块标准化

## 评估去留的后处理

逐个验证 Defuddle 是否已覆盖，能删则删：

- [ ] `removeNoiseBlocks`——Defuddle 有 content pattern removal
- [ ] `collapseCarousels`——Defuddle 有低分元素移除
- [ ] `preserveBlockquoteFooters`——Readability 特有 bug 绕过，Defuddle 可能不需要
- [ ] `normalizeArticleMarkdown`——相关阅读裁剪、轮播计数器清理

## 必须保留

与提取引擎无关，不迁移动：

- 网络层：`fetchWithCurl`（TLS 指纹回退）、`proxyUrlFor` + `NO_PROXY`
- `fetchArticleWithLocalization`（官方中文 alternate 探测）
- `resolveImageUrl`（图片懒加载 fallback：data-original / data-src / srcset）
- `directoryBaseUrl`（Jekyll 无尾斜线 URL 补全）
- `absolutizeUrls`（相对路径绝对化）

## 验证

- [ ] 跑 `npm run update -- --source <dry-run-only 来源>` 对比迁移前后正文质量
- [ ] 数学公式：lilian-weng 文章 `$$...$$` 和 `$...$` 完整保留（之前的核心痛点）
- [ ] `npm run test:update` 离线冒烟测试通过

## 可选增强（后续）

Obsidian Clipper 的模板系统（`{{selector:...}}` + 50+ 过滤器 + URL 触发器）可用于按站点定制提取规则，当前不引入。
