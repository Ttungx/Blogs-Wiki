# Hugging Face 来源 URL 边界核验（2026-08-10）

## 结论

RSS feed.xml 837 条 blog 链接：官方 `/blog/<slug>/` 731 条（87.3%），社区 org 投稿 `/blog/<org>/<slug>/` 106 条（12.7%，约 60+ 个 org）。官方与社区混排，前缀机制无法区分，需 URL 形态过滤。

## 证据

- feed.xml：837 条 blog 链接；org 子路径 Top：nvidia 16、tiiuae 9、ibm-research 7、ServiceNow-AI 6、huggingface 6（HF 自家 org，属官方内容）、open-r1 5、Arm 4、Dharma-AI 4、ibm-granite 4、tngtech 4、allenai 3、amazon 3 等。
- sitemap-blog.xml（835 候选，此前已核）与 RSS 同构，同为官方+org 混排。
- 官方中文：无（`/blog/zh` 仅为界面本地化，文章无 hreflang，此前已核）。

## 如何只收官方 /blog/<slug>/

前缀式 `article_paths`/`exclude_paths` 无法表达「/blog/ 后恰一个段」的形态约束（org 数量多且增长，排除法不可行）。建议：

- 近期（dry-run 阶段）：维持现状，靠每源 --limit 控制翻译成本，人工抽查注意 org 投稿混入。
- 转 active 前：在管线 discovery 增加 URL 形态过滤（`/blog/[^/]+/?$` 恰两段才收），或按 org 白名单（huggingface 官方 org 可并入）。

## mixedIssues

- 社区/第三方投稿与官方技术博客混排（12.7%），且部分 org 文章价值高（nvidia/tiiuae/ibm-research），需明确取舍。
- 候选量 858（RSS+sitemap 去重后），远超其他源，激活前必须收敛。

## 建议的 sources.json 配置

- 字段维持：rss_url / sitemap_url / article_paths `["/blog"]` / dry-run-only。
- 激活前置条件：URL 形态过滤（官方两段规则）落地，否则 org 投稿会周期性漏入。
