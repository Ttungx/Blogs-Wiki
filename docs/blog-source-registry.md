# 博客适配开发登记表

所有博客的审核、适配阶段、阻碍与后续顺序以本表为准。最后更新：2026-08-11。

| ID | 适配状态 | 来源 | 来源地址 | 方向 | 已验证发现入口 | 中文 / 本地化 | 收录文章索引 URL 来源 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `openai` | 已适配 | [OpenAI](https://openai.com/news/) | https://openai.com/news/ | LLM / Agent / Research | Sitemap 分类白名单 | 官方简体中文优先，否则模型翻译 | https://openai.com/news/research/ https://openai.com/news/safety-alignment/ https://openai.com/news/engineering/ https://openai.com/news/security/ (中文: https://openai.com/zh-Hans-CN/news/research/) | 仅收录 research/engineering/safety/security 分类；hrefLang alternate 命中即直通中文原文 |
| `anthropic` | 已适配 | [Anthropic](https://www.anthropic.com/research) | https://www.anthropic.com/research | LLM / Agent / Safety | Sitemap | 模型翻译 | https://www.anthropic.com/research https://www.anthropic.com/engineering | 仅收录 /research 与 /engineering，排除 /news 公司公告 |
| `cloudflare` | 已适配 | [Cloudflare](https://blog.cloudflare.com/) | https://blog.cloudflare.com/ | Engineering / Infrastructure | RSS + Sitemap | 模型翻译 | https://blog.cloudflare.com/ (仅英文) | https://blog.cloudflare.com/ (仅英文，排除 20 个本地化前缀) |
| `simon-willison` | 已适配 | [Simon Willison's Weblog](https://simonwillison.net/) | https://simonwillison.net/ | LLM / AI Engineering | Atom + Sitemap | 模型翻译 | https://simonwillison.net/ | 已进入更新与展示链路 |
| `lilian-weng` | 已适配 | [Lil'Log](https://lilianweng.github.io/) | https://lilianweng.github.io/ | LLM / Agent / Research | RSS + Sitemap | 模型翻译 | https://lilianweng.github.io/ | 已进入更新与展示链路 |
| `langchain` | 已适配 | [LangChain](https://www.langchain.com/blog) | https://www.langchain.com/blog | Agent Framework / Evals / Observability | RSS + Sitemap | 无已知官方中文 | https://www.langchain.com/blog (排除 customers/newsletter) | https://www.langchain.com/blog (排除 customers/newsletter) |
| `cursor` | 已适配 | [Cursor](https://cursor.com/blog) | https://cursor.com/blog | Coding Agent / Model Training / Agent Harness | Sitemap + 列表页 | 官方中文 `/cn/blog/` 直通（hreflang + zh_path_map 双通道） | https://cursor.com/blog | https://cursor.com/blog (sitemap 补充；中文路由 /cn/blog/) |
| `hugging-face` | 已适配 | [Hugging Face](https://huggingface.co/blog) | https://huggingface.co/blog | 开源 LLM / 模型工具链 | RSS + Sitemap | 无官方中文，模型翻译 | https://huggingface.co/blog (仅官方，排除 org 投稿) | https://huggingface.co/blog (仅官方 /blog/<slug>/，排除 org 投稿) |
| `qwen` | 已适配 | [Qwen](https://qwenlm.github.io/blog/) | https://qwenlm.github.io/blog/ | LLM / 多模态 / Agent | Sitemap | 官方简体中文 `/zh/blog/` 直通（zh_path_map 探测） | https://qwenlm.github.io/blog/ | https://qwenlm.github.io/blog/ (中文 /zh/blog/ 近满) |
| `google-deepmind` | 已适配 | [Google DeepMind](https://deepmind.google/blog/) | https://deepmind.google/blog/ | 前沿模型 / AI Safety / Science | RSS + Sitemap | 待逐站核验 | https://deepmind.google/blog/ (排除政企公告) | https://deepmind.google/blog/ (排除政企合作/资助公告) |
| `microsoft-research` | 已适配 | [Microsoft Research](https://www.microsoft.com/en-us/research/blog/) | https://www.microsoft.com/en-us/research/blog/ | LLM / Agent / Research | RSS | 待逐站核验 | https://www.microsoft.com/en-us/research/blog/ | https://www.microsoft.com/en-us/research/blog/ |
| `google-research` | 已适配 | [Google Research](https://research.google/blog/) | https://research.google/blog/ | AI / ML Research | RSS | 无官方中文，模型翻译 | https://research.google/blog/ | https://research.google/blog/ |
| `meta-ai` | 已适配 | [Meta AI](https://ai.meta.com/blog/) | https://ai.meta.com/blog/ | Llama / 生成式 AI / Research | 列表页 | 无官方中文，模型翻译 | https://ai.meta.com/blog/ | https://ai.meta.com/blog/ |
| `eleuther-ai` | 已适配 | [EleutherAI](https://blog.eleuther.ai/) | https://blog.eleuther.ai/ | 开源 LLM / 可解释性 / Safety | RSS + Sitemap | 无已知官方中文 | https://blog.eleuther.ai/ (根 slug) | https://blog.eleuther.ai/ (根 slug，排除 categories) |
| `mistral-ai` | 已适配 | [Mistral AI](https://mistral.ai/news/) | https://mistral.ai/news/ | 开源模型 / 模型研究 | RSS | 待逐站核验 | https://mistral.ai/news/ (排除营销) | https://mistral.ai/news/ (排除消费产品营销/公司新闻) |
| `amazon-science` | 正在适配 | [Amazon Science](https://www.amazon.science/blog) | https://www.amazon.science/blog | AI Research | 列表页 | 待逐站核验 | https://www.amazon.science/blog | https://www.amazon.science/blog (排除非 AI 工程科普) |
| `chip-huyen` | 正在适配 | [Chip Huyen](https://huyenchip.com/blog/) | https://huyenchip.com/blog/ | ML Systems / LLM Engineering | RSS + Sitemap | 无已知官方中文 | https://huyenchip.com/ (日期路径) | https://huyenchip.com/ (日期路径文章 /YYYY/MM/DD/<slug>.html) |
| `sebastian-raschka` | 已适配 | [Ahead of AI](https://magazine.sebastianraschka.com/) | https://magazine.sebastianraschka.com/ | LLM 训练 / 微调 / Research | RSS + Sitemap | 无已知官方中文 | https://magazine.sebastianraschka.com/ (/p/) | https://magazine.sebastianraschka.com/ (/p/<slug>) |
| `hamel-husain` | 已适配 | [Hamel Husain](https://hamel.dev/blog/) | https://hamel.dev/blog/ | Agent / Evals / AI 产品 | RSS | 无已知官方中文 | https://hamel.dev/blog/ | https://hamel.dev/blog/ |
| `eugene-yan` | 正在适配 | [Eugene Yan](https://eugeneyan.com/writing/) | https://eugeneyan.com/writing/ | Applied ML / LLM / 产品实践 | RSS + Sitemap | 无已知官方中文 | https://eugeneyan.com/writing/ | https://eugeneyan.com/writing/ (排除站外跳转占位) |
| `jay-alammar` | 已适配 | [Jay Alammar](https://newsletter.languagemodels.co/) | https://newsletter.languagemodels.co/ | LLM 可视化教育 | RSS | 无已知官方中文 | https://newsletter.languagemodels.co/ (/p/) | https://newsletter.languagemodels.co/ (/p/<slug>) |
| `andrej-karpathy` | 已适配 | [Andrej Karpathy](https://karpathy.github.io/) | https://karpathy.github.io/ | LLM 教育 / 个人思考 | RSS | 无已知官方中文 | https://karpathy.github.io/ (日期路径) | https://karpathy.github.io/ (YYYY/MM/DD/<slug>/) |
| `one-poem-suffices` | 已适配 | [One Poem Suffices](https://keli-wen.github.io/One-Poem-Suffices/) | https://keli-wen.github.io/One-Poem-Suffices/ | LLM / Agent / Context Engineering | Sitemap | 中文原文，en 双语 | https://keli-wen.github.io/One-Poem-Suffices/ | 无 RSS；sitemap 无日期，用 GitHub 提交历史兜底（git_date） |
| `kimi` | 已适配 | [Moonshot](https://www.kimi.com/blog/) | https://www.kimi.com/blog/ | LLM 模型 / Agent / Benchmark | Sitemap | 无官方中文，模型翻译 | https://www.kimi.com/blog/ | sitemap-ug-blog.xml 带 lastmod；9 篇全技术内容 |
| `glm` | 正在适配 | [z.ai](https://www.zhipuai.cn/zh/news) | https://www.zhipuai.cn/zh/news | LLM 模型 / Agent / 公司动态 | 列表页 | 官方简体中文原生 | https://www.zhipuai.cn/zh/news | 正文在 Next.js RSC 流（Payload CMS richText），需专门提取器；排除公司/财经公告 |
| `github-engineering` | 已适配 | [GitHub Engineering](https://github.blog/engineering/) | https://github.blog/engineering/ | Developer Platform / Engineering | RSS + Sitemap | 无官方中文，模型翻译 | https://github.blog/engineering/ | /engineering/feed/ + post-sitemap；排除 changelog/news-insights/author/category |
| `trail-of-bits` | 计划中 | [Trail of Bits](https://blog.trailofbits.com/) | https://blog.trailofbits.com/ | Security / Program Analysis | RSS 待复核 | 待核验 | https://blog.trailofbits.com/ | 安全方向，后续收录 |
| `tailscale` | 计划中 | [Tailscale Blog](https://tailscale.com/blog/) | https://tailscale.com/blog/ | Networking / Zero Trust | RSS | 待核验 | https://tailscale.com/blog/ | 通用工程来源，后续收录 |
| `fly-io` | 计划中 | [Fly.io Blog](https://fly.io/blog/) | https://fly.io/blog/ | Distributed Systems / Infrastructure | Feed 待复核 | 待核验 | https://fly.io/blog/ | 通用工程来源，后续收录 |
| `meta-engineering` | 已适配 | [Meta Engineering](https://engineering.fb.com/) | https://engineering.fb.com/ | Large-scale Engineering | RSS + Sitemap | 无官方中文，模型翻译 | https://engineering.fb.com/ | sitemap_index 仅取 post-sitemap；排除 meta-tech-podcast |
| `google-security` | 已适配 | [Google Security](https://blog.google/security/) | https://blog.google/security/ | Security | RSS + Sitemap | 无官方中文，模型翻译 | https://blog.google/security/ | en-us sitemap /security/ 58 条；勿用全站 /rss/ |
| `tencent-cloud` | 正在适配 | [腾讯云开发者社区](https://cloud.tencent.com/developer/) | https://cloud.tencent.com/developer/ | AI / LLM / 云工程（UGC） | 列表页 | 官方简体中文原生 | https://cloud.tencent.com/developer/ | 正文在 `__NEXT_DATA__` JSON 需提取适配；日期为 Unix 时间戳；限定技术工程专栏/混元专区子入口 |
| `mozilla-hacks` | 计划中 | [Mozilla Hacks](https://hacks.mozilla.org/) | https://hacks.mozilla.org/ | Web Platform | RSS | 待核验 | https://hacks.mozilla.org/ | 可能存在 WAF 抓取障碍 |
| `datadog-engineering` | 计划中 | [Datadog Engineering](https://www.datadoghq.com/blog/engineering/) | https://www.datadoghq.com/blog/engineering/ | Observability / Infrastructure | RSS | 待核验 | https://www.datadoghq.com/blog/engineering/ | 通用工程来源，后续收录 |
| `shopify-engineering` | 计划中 | [Shopify Engineering](https://shopify.engineering/) | https://shopify.engineering/ | Backend / Commerce Infrastructure | Feed 待复核 | 待核验 | https://shopify.engineering/ | 通用工程来源，后续收录 |
| `julia-evans` | 计划中 | [Julia Evans](https://jvns.ca/) | https://jvns.ca/ | Systems / Networking / Learning | Atom | 无已知官方中文 | https://jvns.ca/ | 内容优秀，但更偏通用工程 |
| `mitchell-hashimoto` | 计划中 | [Mitchell Hashimoto](https://mitchellh.com/writing) | https://mitchellh.com/writing | Infrastructure / Developer Tools | RSS | 无已知官方中文 | https://mitchellh.com/writing | 通用工程来源，后续收录 |
| `llama-index` | 候选 | [LlamaIndex Blog](https://www.llamaindex.ai/blog) | https://www.llamaindex.ai/blog | Agent / RAG / Document Intelligence | 待核验 | 待核验 | https://www.llamaindex.ai/blog | 高相关，优先审核 |
| `cognition` | 候选 | [Cognition Blog](https://cognition.com/blog) | https://cognition.com/blog | Autonomous Coding Agent | Sitemap / 列表待核 | 待核验 | https://cognition.com/blog | 需核验技术文章比例 |
| `replit` | 候选 | [Replit Blog](https://replit.com/blog) | https://replit.com/blog | Coding Agent / AI Product | 待核验 | 待核验 | https://replit.com/blog | 需过滤产品公告 |
| `together-ai` | 候选 | [Together AI Blog](https://www.together.ai/blog) | https://www.together.ai/blog | Open Models / Training / Inference | RSS | 待核验 | https://www.together.ai/blog | 模型公司代表，优先审核 |
| `fireworks-ai` | 候选 | [Fireworks AI Blog](https://fireworks.ai/blog) | https://fireworks.ai/blog | LLM Inference / Models | 待核验 | 待核验 | https://fireworks.ai/blog | 需过滤产品营销 |
| `weights-and-biases` | 候选 | [Weights &amp; Biases Fully Connected](https://wandb.ai/fully-connected) | https://wandb.ai/fully-connected | LLM Evals / Training / MLOps | 待核验 | 待核验 | https://wandb.ai/fully-connected | 内容相关，需核验发现入口 |
| `replicate` | 候选 | [Replicate Blog](https://replicate.com/blog) | https://replicate.com/blog | Open Models / AI Product | 待核验 | 待核验 | https://replicate.com/blog | 适合精选 |
| `scale-ai` | 候选 | [Scale AI Blog](https://scale.com/blog) | https://scale.com/blog | Evals / Data / AI Research | Sitemap / 列表待核 | 待核验 | https://scale.com/blog | 技术文章与市场内容混合，需要严格过滤 |
| `yohei-nakajima` | 候选 | [Yohei Nakajima](https://yoheinakajima.com/) | https://yoheinakajima.com/ | Agent Engineering / AI 产品 | RSS | 无已知官方中文 | https://yoheinakajima.com/ | BabyAGI 作者，优先审核 |
| `jason-liu` | 候选 | [Jason Liu](https://jxnl.co/) | https://jxnl.co/ | Structured Output / Agent / Evals | 待核验 | 无已知官方中文 | https://jxnl.co/ | 技术密度高，需补 Feed 和日期核验 |
| `swyx` | 候选 | [swyx](https://www.swyx.io/) | https://www.swyx.io/ | AI Engineering / Learn in Public / 职业成长 | RSS | 无已知官方中文 | https://www.swyx.io/ | 同时覆盖 AI 与个人成长 |
| `nathan-lambert` | 候选 | [Interconnects](https://www.interconnects.ai/) | https://www.interconnects.ai/ | LLM Training / RLHF / Evals | RSS | 无已知官方中文 | https://www.interconnects.ai/ | 研究密度高 |
| `sebastian-ruder` | 候选 | [Sebastian Ruder](https://www.ruder.io/) | https://www.ruder.io/ | NLP / LLM Research / 学习型长文 | RSS | 无已知官方中文 | https://www.ruder.io/ | 需核验近期更新频率 |
| `maarten-grootendorst` | 候选 | [Maarten Grootendorst](https://www.maartengrootendorst.com/) | https://www.maartengrootendorst.com/ | LLM / RAG / Agent / 可视化 | 待核验 | 无已知官方中文 | https://www.maartengrootendorst.com/ | 内容相关，需补 Feed 核验 |
| `ethan-mollick` | 候选 | [One Useful Thing](https://www.oneusefulthing.org/) | https://www.oneusefulthing.org/ | AI 产品方法 / 工作与学习 | RSS | 无已知官方中文 | https://www.oneusefulthing.org/ | 偏 AI 实践和成长 |
| `pragmatic-engineer` | 候选 | [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/) | https://newsletter.pragmaticengineer.com/ | AI 工程 / 职业发展 | RSS | 无已知官方中文 | https://newsletter.pragmaticengineer.com/ | 内容面较宽，后续需按 AI 标签过滤 |
| `scott-young` | 候选 | [Scott H. Young](https://www.scotthyoung.com/blog/) | https://www.scotthyoung.com/blog/ | 学习科学 / 个人成长 | RSS | 无已知官方中文 | https://www.scotthyoung.com/blog/ | 非 AI，但符合个人成长方向 |
| `ness-labs` | 候选 | [Ness Labs](https://nesslabs.com/) | https://nesslabs.com/ | 学习 / 心智 / 个人成长 | RSS | 无已知官方中文 | https://nesslabs.com/ | 需评估全文收录边界 |

适配状态说明：

- `已适配`：已进入发现、抓取、语言处理、持久化与前端展示链路。
- `正在适配`：已完成 `dry-run-only` 最简脚手架，正在等待或推进完整适配；不会翻译或写文章。
- `计划中`：用户已认可，但当前 LLM / Agent 主队列完成前不推进。
- `候选`：仅完成初步发现，未经用户审核，不得加入生产来源配置。

## 当前推进顺序

1. 已完成共性能力：Defuddle 抓取引擎切换（worker backend，图片保留 + fbsbx 误判修复）、可见文本日期解析、zh 路径探测（zh_path_map）、GitHub 提交历史日期兜底（git_date）、发现层 curl 回退、腾讯追踪参数清理。
2. 2026-08-11 已完成适配：cursor、qwen、google-research、meta-ai、hugging-face、one-poem-suffices、kimi、google-security、meta-engineering、github-engineering（10 个，转 active）。
3. 正在适配（有正文提取阻碍，保持 dry-run-only）：glm（Next.js RSC 流正文）、tencent-cloud（`__NEXT_DATA__` JSON 正文 + Unix 时间戳日期）。
4. 已适配来源持续运行增量更新并抽检质量。

2026-08-09 的 17 个正在适配来源 dry-run 结果见 [`docs/sources/scaffold-validation-2026-08-09.md`](sources/scaffold-validation-2026-08-09.md)；2026-08-10 逐站审计与 URL 边界核验报告见 [`docs/sources/`](sources/)；2026-08-11 新源探索报告：GLM/Kimi、腾讯/阿里、Google Security/Meta Engineering/GitHub Engineering。当前 18 个已适配来源。
发现、官方中文、图片和翻译分块的 V2 设计与启用门槛见 [`docs/update-pipeline-v2.md`](update-pipeline-v2.md)。

## 暂缓 / 不纳入

## 单站适配流程

1. 核验官方 URL、RSS / Atom / Sitemap、文章路径和排除路径。
2. 以 `update_mode: dry-run-only` 添加来源配置。
3. 执行 `npm run audit:source -- --source <id> --samples 3`，验证全部发现入口和三篇抓取样本；通过后标记“正在适配”。
4. 完整适配至少抽取三篇文章，检查标题、作者、日期、代码块、表格和图片。
5. 探测官方简体中文或原生中文版本；命中时跳过模型翻译。
6. 检查图片懒加载地址，保留原始远程链接，不下载图片。
7. 记录抓取限制、频率限制和全文收录边界。
8. 添加博客资料，将 `update_mode` 显式改为 `active`，执行更新测试、持久化和构建验证。
9. 全部通过后标记“已适配”；失败则保留脚手架并记录阻碍。

## 共性能力待办

- [已完成] 官方中文 / 原生中文优先：抓取层 alternate 探测（`fetchArticleWithLocalization`），兼容 `hreflang` 与 `hrefLang`（openai），命中即直通中文原文，不调用翻译模型。
- [已完成] 翻译与分类解耦：V2 执行器独立分类调用；中文直通仅分类不翻译。
- [已完成] 记录原文 URL、官方本地化 URL 与内容生成方式：frontmatter `original_url` / `original_zh_url` / `translation_status`。
- [已完成] 来源 URL 边界治理：`article_paths` / `exclude_paths` 支持 `^` 正则；逐源核验技术内容 vs 公告/本地化/社区投稿（见 `*-2026-08-10-urlcheck.md`）。
- [已完成] 增加 zh 路径探测与 en/zh 去重（`zh_path_map`，cursor / qwen 落地）。
- [已完成] 增加可见文本日期解析（meta-ai / one-poem-suffices 落地）。
- [已完成] 修复正文图片丢失（Defuddle 引擎 + fbsbx.com 误判修复；google-research / meta-ai 落地）。
- [已完成] Defuddle 抓取引擎替换 Readability（`FETCH_BACKEND=worker`，worker/fetch/extractor.ts）。
- [已完成] 无日期博客 GitHub 提交历史兜底（`git_date`，one-poem-suffices 落地）。
- [已完成] 发现层 curl 回退（openai.com TLS 指纹拦截）。
- 为 Hugging Face 增加 org 投稿过滤落地（已配置 `^/blog/[^/]+$` 单段过滤，待抽检质量）。
- [脚手架完成] 腾讯云正文 `__NEXT_DATA__` JSON 提取适配。
- [脚手架完成] GLM Next.js RSC 流正文提取适配。
- [脚手架完成] 处理 `src`、`srcset`、`data-src`、`data-lazy-src`、`data-original` 等图片地址并保留原链。
- [脚手架完成] 翻译前保护链接和图片 URL，翻译后严格校验并原样恢复。
- [已完成] 增加来源自动审计命令，输出各发现入口与三篇样本报告。
- 增加有界并发、按域名限速和失败重试。
