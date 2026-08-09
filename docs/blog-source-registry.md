# 博客适配开发登记表

所有博客的审核、适配阶段、阻碍与后续顺序以本表为准。最后更新：2026-08-09。

| ID                       | 适配状态 | 来源                                                                            | 方向                                          | 已验证发现入口     | 中文 / 本地化                  | 备注                                                               |
| ------------------------ | -------- | ------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ | ------------------------------ | ------------------------------------------------------------------ |
| `openai`               | 已适配   | [OpenAI](https://openai.com/news/)                                               | LLM / Agent / Research                        | RSS + Sitemap      | 官方简体中文优先，否则模型翻译 | 需要补通用官方本地化解析                                           |
| `anthropic`            | 已适配   | [Anthropic](https://www.anthropic.com/research)                                  | LLM / Agent / Safety                          | Sitemap            | 模型翻译                       | 已限制文章路径                                                     |
| `cloudflare`           | 已适配   | [Cloudflare Blog](https://blog.cloudflare.com/)                                  | Engineering / Infrastructure                  | RSS + Sitemap      | 模型翻译                       | 当前非扩展重点                                                     |
| `simon-willison`       | 已适配   | [Simon Willison&#39;s Weblog](https://simonwillison.net/)                        | LLM / AI Engineering                          | Atom + Sitemap     | 模型翻译                       | 已进入更新与展示链路                                               |
| `lilian-weng`          | 已适配   | [Lil&#39;Log](https://lilianweng.github.io/)                                     | LLM / Agent / Research                        | RSS + Sitemap      | 模型翻译                       | 已进入更新与展示链路                                               |
| `langchain`            | 正在适配 | [LangChain Blog](https://www.langchain.com/blog)                                 | Agent Framework / Evals / Observability       | RSS + Sitemap      | 无已知官方中文                 | `dry-run-only`；RSS 与页面日期可能不一致；完整适配最高优先级     |
| `cursor`               | 正在适配 | [Cursor Blog](https://cursor.com/blog)                                           | Coding Agent / Model Training / Agent Harness | 列表页             | 有多语言路由，中文质量待核     | `dry-run-only`；RSS 已停更，Sitemap 日期无效；完整适配第二优先级 |
| `hugging-face`         | 正在适配 | [Hugging Face Blog](https://huggingface.co/blog)                                 | 开源 LLM / 模型工具链                         | RSS + Sitemap      | 待逐站核验                     | `dry-run-only`；来源量大，需要增量限制和内容过滤                 |
| `qwen`                 | 正在适配 | [Qwen Blog](https://qwenlm.github.io/blog/)                                      | LLM / 多模态 / Agent                          | Sitemap            | 部分文章有官方简体中文         | `dry-run-only`；官方中文优先，不重复翻译                         |
| `google-deepmind`      | 正在适配 | [Google DeepMind](https://deepmind.google/blog/)                                 | 前沿模型 / AI Safety / Science                | RSS + Sitemap      | 待逐站核验                     | `dry-run-only`；与 Google Research 分开管理                      |
| `microsoft-research`   | 正在适配 | [Microsoft Research](https://www.microsoft.com/en-us/research/blog/)             | LLM / Agent / Research                        | RSS                | 待逐站核验                     | `dry-run-only`；需过滤非 AI 研究文章                             |
| `google-research`      | 正在适配 | [Google Research](https://research.google/blog/)                                 | AI / ML Research                              | RSS                | 待逐站核验                     | `dry-run-only`；Readability 当前会丢失正文图片                   |
| `meta-ai`              | 正在适配 | [Meta AI](https://ai.meta.com/blog/)                                             | Llama / 生成式 AI / Research                  | 列表页             | 待逐站核验                     | `dry-run-only`；缺机器可读日期，完整适配阻塞                     |
| `eleuther-ai`          | 正在适配 | [EleutherAI Blog](https://blog.eleuther.ai/)                                     | 开源 LLM / 可解释性 / Safety                  | RSS + Sitemap      | 无已知官方中文                 | `dry-run-only`；超长文章需要翻译分块与恢复机制                   |
| `mistral-ai`           | 正在适配 | [Mistral AI News](https://mistral.ai/news/)                                      | 开源模型 / 模型研究                           | RSS                | 待逐站核验                     | `dry-run-only`；本地访问依赖代理                                 |
| `amazon-science`       | 正在适配 | [Amazon Science Blog](https://www.amazon.science/blog)                           | AI Research                                   | 列表页             | 待逐站核验                     | `dry-run-only`；当前仅覆盖列表首页约 13 篇                       |
| `chip-huyen`           | 正在适配 | [Chip Huyen](https://huyenchip.com/blog/)                                        | ML Systems / LLM Engineering                  | RSS + Sitemap      | 无已知官方中文                 | `dry-run-only`；更新频率较低，适合精选                           |
| `sebastian-raschka`    | 正在适配 | [Ahead of AI](https://magazine.sebastianraschka.com/)                            | LLM 训练 / 微调 / Research                    | RSS + Sitemap      | 无已知官方中文                 | `dry-run-only`；Substack 页面较长                                |
| `hamel-husain`         | 正在适配 | [Hamel Husain](https://hamel.dev/blog/)                                          | Agent / Evals / AI 产品                       | RSS                | 无已知官方中文                 | `dry-run-only`；与当前方向高度一致                               |
| `eugene-yan`           | 正在适配 | [Eugene Yan](https://eugeneyan.com/)                                             | Applied ML / LLM / 产品实践                   | RSS + Sitemap      | 无已知官方中文                 | `dry-run-only`；必须限制 `/writing` 路径                       |
| `jay-alammar`          | 正在适配 | [Jay Alammar / Language Models &amp; Co.](https://newsletter.languagemodels.co/) | LLM 可视化教育                                | RSS                | 无已知官方中文                 | `dry-run-only`；图片必须保留原链                                 |
| `andrej-karpathy`      | 正在适配 | [Andrej Karpathy](https://karpathy.github.io/)                                   | LLM 教育 / 个人思考                           | RSS                | 无已知官方中文                 | `dry-run-only`；更新较低频，适合精选                             |
| `one-poem-suffices`    | 正在适配 | [One Poem Suffices](https://keli-wen.github.io/One-Poem-Suffices/)               | LLM / Agent / Context Engineering             | Sitemap            | 中文原文，en 双语              | `dry-run-only`；无 RSS；sitemap 无机器可读日期，完整适配阻塞   |
| `github-engineering`   | 计划中   | [GitHub Engineering](https://github.blog/engineering/)                           | Developer Platform / Engineering              | RSS                | 待核验                         | 通用工程来源，后续收录                                             |
| `trail-of-bits`        | 计划中   | [Trail of Bits](https://blog.trailofbits.com/)                                   | Security / Program Analysis                   | RSS 待复核         | 待核验                         | 安全方向，后续收录                                                 |
| `tailscale`            | 计划中   | [Tailscale Blog](https://tailscale.com/blog/)                                    | Networking / Zero Trust                       | RSS                | 待核验                         | 通用工程来源，后续收录                                             |
| `fly-io`               | 计划中   | [Fly.io Blog](https://fly.io/blog/)                                              | Distributed Systems / Infrastructure          | Feed 待复核        | 待核验                         | 通用工程来源，后续收录                                             |
| `meta-engineering`     | 计划中   | [Meta Engineering](https://engineering.fb.com/)                                  | Large-scale Engineering                       | RSS                | 待核验                         | 通用工程来源，后续收录                                             |
| `google-security`      | 计划中   | [Google Security Blog](https://blog.google/security/)                            | Security                                      | RSS                | 待核验                         | 安全方向，后续收录                                                 |
| `mozilla-hacks`        | 计划中   | [Mozilla Hacks](https://hacks.mozilla.org/)                                      | Web Platform                                  | RSS                | 待核验                         | 可能存在 WAF 抓取障碍                                              |
| `datadog-engineering`  | 计划中   | [Datadog Engineering](https://www.datadoghq.com/blog/engineering/)               | Observability / Infrastructure                | RSS                | 待核验                         | 通用工程来源，后续收录                                             |
| `shopify-engineering`  | 计划中   | [Shopify Engineering](https://shopify.engineering/)                              | Backend / Commerce Infrastructure             | Feed 待复核        | 待核验                         | 通用工程来源，后续收录                                             |
| `julia-evans`          | 计划中   | [Julia Evans](https://jvns.ca/)                                                  | Systems / Networking / Learning               | Atom               | 无已知官方中文                 | 内容优秀，但更偏通用工程                                           |
| `mitchell-hashimoto`   | 计划中   | [Mitchell Hashimoto](https://mitchellh.com/writing)                              | Infrastructure / Developer Tools              | RSS                | 无已知官方中文                 | 通用工程来源，后续收录                                             |
| `llama-index`          | 候选     | [LlamaIndex Blog](https://www.llamaindex.ai/blog)                                | Agent / RAG / Document Intelligence           | 待核验             | 待核验                         | 高相关，优先审核                                                   |
| `cognition`            | 候选     | [Cognition Blog](https://cognition.com/blog)                                     | Autonomous Coding Agent                       | Sitemap / 列表待核 | 待核验                         | 需核验技术文章比例                                                 |
| `replit`               | 候选     | [Replit Blog](https://replit.com/blog)                                           | Coding Agent / AI Product                     | 待核验             | 待核验                         | 需过滤产品公告                                                     |
| `together-ai`          | 候选     | [Together AI Blog](https://www.together.ai/blog)                                 | Open Models / Training / Inference            | RSS                | 待核验                         | 模型公司代表，优先审核                                             |
| `fireworks-ai`         | 候选     | [Fireworks AI Blog](https://fireworks.ai/blog)                                   | LLM Inference / Models                        | 待核验             | 待核验                         | 需过滤产品营销                                                     |
| `weights-and-biases`   | 候选     | [Weights &amp; Biases Fully Connected](https://wandb.ai/fully-connected)         | LLM Evals / Training / MLOps                  | 待核验             | 待核验                         | 内容相关，需核验发现入口                                           |
| `replicate`            | 候选     | [Replicate Blog](https://replicate.com/blog)                                     | Open Models / AI Product                      | 待核验             | 待核验                         | 适合精选                                                           |
| `scale-ai`             | 候选     | [Scale AI Blog](https://scale.com/blog)                                          | Evals / Data / AI Research                    | Sitemap / 列表待核 | 待核验                         | 技术文章与市场内容混合，需要严格过滤                               |
| `yohei-nakajima`       | 候选     | [Yohei Nakajima](https://yoheinakajima.com/)                                     | Agent Engineering / AI 产品                   | RSS                | 无已知官方中文                 | BabyAGI 作者，优先审核                                             |
| `jason-liu`            | 候选     | [Jason Liu](https://jxnl.co/)                                                    | Structured Output / Agent / Evals             | 待核验             | 无已知官方中文                 | 技术密度高，需补 Feed 和日期核验                                   |
| `swyx`                 | 候选     | [swyx](https://www.swyx.io/)                                                     | AI Engineering / Learn in Public / 职业成长   | RSS                | 无已知官方中文                 | 同时覆盖 AI 与个人成长                                             |
| `nathan-lambert`       | 候选     | [Interconnects](https://www.interconnects.ai/)                                   | LLM Training / RLHF / Evals                   | RSS                | 无已知官方中文                 | 研究密度高                                                         |
| `sebastian-ruder`      | 候选     | [Sebastian Ruder](https://www.ruder.io/)                                         | NLP / LLM Research / 学习型长文               | RSS                | 无已知官方中文                 | 需核验近期更新频率                                                 |
| `maarten-grootendorst` | 候选     | [Maarten Grootendorst](https://www.maartengrootendorst.com/)                     | LLM / RAG / Agent / 可视化                    | 待核验             | 无已知官方中文                 | 内容相关，需补 Feed 核验                                           |
| `ethan-mollick`        | 候选     | [One Useful Thing](https://www.oneusefulthing.org/)                              | AI 产品方法 / 工作与学习                      | RSS                | 无已知官方中文                 | 偏 AI 实践和成长                                                   |
| `pragmatic-engineer`   | 候选     | [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/)              | AI 工程 / 职业发展                            | RSS                | 无已知官方中文                 | 内容面较宽，后续需按 AI 标签过滤                                   |
| `scott-young`          | 候选     | [Scott H. Young](https://www.scotthyoung.com/blog/)                              | 学习科学 / 个人成长                           | RSS                | 无已知官方中文                 | 非 AI，但符合个人成长方向                                          |
| `ness-labs`            | 候选     | [Ness Labs](https://nesslabs.com/)                                               | 学习 / 心智 / 个人成长                        | RSS                | 无已知官方中文                 | 需评估全文收录边界                                                 |


适配状态说明：

- `已适配`：已进入发现、抓取、语言处理、持久化与前端展示链路。
- `正在适配`：已完成 `dry-run-only` 最简脚手架，正在等待或推进完整适配；不会翻译或写文章。
- `计划中`：用户已认可，但当前 LLM / Agent 主队列完成前不推进。
- `候选`：仅完成初步发现，未经用户审核，不得加入生产来源配置。

## 当前推进顺序

1. 补齐官方中文 / 原生中文优先、图片原链、翻译与分类解耦等共性能力。
2. LangChain 完整适配。
3. Cursor 完整适配。
4. Hugging Face 完整适配。
5. Qwen 完整适配。

17 个正在适配来源的真实 dry-run 结果见 [`docs/sources/scaffold-validation-2026-08-09.md`](sources/scaffold-validation-2026-08-09.md)。
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

- 官方中文 / 原生中文优先，未命中才调用翻译模型。
- 翻译与分类解耦，允许不翻译但仍分类。
- 记录原文 URL、官方本地化 URL 和内容生成方式。
- [脚手架完成] 处理 `src`、`srcset`、`data-src`、`data-lazy-src`、`data-original` 等图片地址并保留原链。
- [脚手架完成] 翻译前保护链接和图片 URL，翻译后严格校验并原样恢复。
- [已完成] 增加来源自动审计命令，输出各发现入口与三篇样本报告。
- 增加有界并发、按域名限速和失败重试。
