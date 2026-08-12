# 博客适配开发登记表

所有博客的审核、适配阶段、阻碍与后续顺序以本表为准。最后更新：2026-08-12。

## 来源质量原则

收录优先级：**Research / Engineering / Technical / Science / Essays / Writing > 普通 Blog > News / Company News**。

- 企业源优先官方 Research / Engineering / Technical 索引或 Archive；`/news`、`/blog` 需先核验内容密度与过滤边界。模型发布、产品发布不机械排除——只要讲训练方法、架构、推理、eval、安全、系统实现、失败经验、设计取舍就收录；签约、合作、融资、任命、客户案例、活动、奖项、价格调整、市场宣传、纯 availability announcement 一律排除。
- 个人作者：技术、思想、哲学、学习、认知、职业方法、创作方法均可，只要能产生长期学习价值。
- 过滤不能只看标题关键词（`Introducing XXX` / `Launching XXX` 可能是高质量技术文）。真正判断标准：有没有解释 why、architecture、method、experiment / eval、failure / trade-off、implementation detail、可迁移知识（后续在 discovery pipeline 增加 knowledge-value filter）。
- 新增博客时先找 Research / Engineering / Writing / Archive 索引，不能见到 `/news` 或 `/blog` 就直接抓。

| ID | 适配状态 | 来源 | 来源地址 | 方向 | 已验证发现入口 | 中文 / 本地化 | 收录文章索引 URL 来源 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `openai` | 已适配 | [OpenAI](https://openai.com/news/) | https://openai.com/news/ | LLM / Agent / Research | Sitemap 分类白名单 | 官方简体中文优先，否则模型翻译 | https://openai.com/news/research/ https://openai.com/news/safety-alignment/ https://openai.com/news/engineering/ https://openai.com/news/security/ (中文: https://openai.com/zh-Hans-CN/news/research/) | 仅收录 research/engineering/safety/security 分类；hrefLang alternate 命中即直通中文原文 |
| `anthropic` | 已适配 | [Anthropic](https://www.anthropic.com/research) | https://www.anthropic.com/research | LLM / Agent / Safety | Sitemap | 模型翻译 | https://www.anthropic.com/research https://www.anthropic.com/engineering | 保留 Research + Engineering，坚决排除 /news 公司公告；这是目标范式，不换源 |
| `cloudflare` | 已适配 | [Cloudflare](https://blog.cloudflare.com/tag/engineering/) | https://blog.cloudflare.com/tag/engineering/ | Engineering / Infrastructure | RSS + Sitemap | 模型翻译 | https://blog.cloudflare.com/tag/engineering/（主）https://blog.cloudflare.com/tag/reliability/ https://blog.cloudflare.com/tag/security/（辅） | 主入口收 engineering tag，Reliability / Security 辅助；仍排除 20 个本地化前缀；security/reliability 需过滤纯产品文 |
| `simon-willison` | 已适配 | [Simon Willison's Weblog](https://simonwillison.net/entries/) | https://simonwillison.net/entries/ | LLM / AI Engineering | Atom + Sitemap | 模型翻译 | https://simonwillison.net/entries/ | `/entries/` 为长文集合，数千篇；明确避开 blogmarks / link feed |
| `lilian-weng` | 已适配 | [Lil'Log](https://lilianweng.github.io/archives/) | https://lilianweng.github.io/archives/ | LLM / Agent / Research | RSS + Sitemap | 模型翻译 | https://lilianweng.github.io/archives/ | 官方 Archives 为干净长文索引 |
| `langchain` | 已适配 | [LangChain](https://www.langchain.com/blog) | https://www.langchain.com/blog | Agent Framework / Evals / Observability | RSS + Sitemap | 无已知官方中文 | https://www.langchain.com/blog | 保留 /blog；白名单 Agent Architecture / Evals、Observability / Engineering / Systems / Conceptual Guide / Open Source；排除 Customer、Newsletter、Partner、Company Announcement |
| `cursor` | 已适配 | [Cursor](https://cursor.com/blog/topic/research) | https://cursor.com/blog/topic/research | Coding Agent / Model Training / Agent Harness | Sitemap + 列表页 | 官方中文 `/cn/blog/` 直通（hreflang + zh_path_map 双通道） | https://cursor.com/blog/topic/research | 主入口为独立 Research 分类（agent harness / 模型训练 / eval / sandbox / GPU kernel）；Broad Blog 混 Product / Company / Customers，仅作补充；中文路由 /cn/blog/topic/research |
| `hugging-face` | 已适配 | [Hugging Face](https://huggingface.co/organizations/huggingface/activity/articles) | https://huggingface.co/organizations/huggingface/activity/articles | 开源 LLM / 模型工具链 | RSS + Sitemap | 无官方中文，模型翻译 | https://huggingface.co/organizations/huggingface/activity/articles（主）https://huggingface.co/blog（legacy） | 官方 `huggingface` 组织 Articles 更干净；旧 `/blog` 已社区化，仅作 legacy 补充，排除 org 投稿 |
| `qwen` | 已适配 | [Qwen](https://qwenlm.github.io/blog/) | https://qwenlm.github.io/blog/ | LLM / 多模态 / Agent | Sitemap | 官方简体中文 `/zh/blog/` 直通（zh_path_map 探测） | https://qwenlm.github.io/blog/ | https://qwenlm.github.io/blog/ (中文 /zh/blog/ 近满) |
| `google-deepmind` | 已适配 | [Google DeepMind](https://deepmind.google/blog-categories/technical-blogs) | https://deepmind.google/blog-categories/technical-blogs | 前沿模型 / AI Safety / Science | RSS + Sitemap | 待逐站核验 | https://deepmind.google/blog-categories/technical-blogs（主）https://deepmind.google/blog/（补充） | 主要入口为 Technical Blogs 分类；Broad News 混模型发布、资助、合作，作补充并排除政企公告 |
| `microsoft-research` | 已适配 | [Microsoft Research](https://www.microsoft.com/en-us/research/blog/) | https://www.microsoft.com/en-us/research/blog/ | LLM / Agent / Research | RSS | 待逐站核验 | https://www.microsoft.com/en-us/research/blog/ | 研究组织博客，保留；仅排除活动、奖项、招聘 / fellowship |
| `google-research` | 已适配 | [Google Research](https://research.google/blog/) | https://research.google/blog/ | AI / ML Research | RSS | 无官方中文，模型翻译 | https://research.google/blog/ | 保留根 Research Blog；按 label 过滤 Conferences & Events、Programs、Product、Global、Year in Review；AI/ML/Systems/Security/HCI/Responsible AI 留下 |
| `meta-ai` | 已适配 | [Meta AI](https://ai.meta.com/blog/) | https://ai.meta.com/blog/ | Llama / 生成式 AI / Research | 列表页 | 无官方中文，模型翻译 | https://ai.meta.com/blog/ | 保留；只收 FAIR/Research、模型/训练/推理、安全、开源技术；grants、生态合作、活动、商业 adoption 排除 |
| `eleuther-ai` | 已适配 | [EleutherAI](https://blog.eleuther.ai/) | https://blog.eleuther.ai/ | 开源 LLM / 可解释性 / Safety | RSS + Sitemap | 无已知官方中文 | https://blog.eleuther.ai/ (根 slug) | 保留，研究密度高；仅过滤组织公告 |
| `mistral-ai` | 已适配 | [Mistral AI](https://mistral.ai/news/?categories=research) | https://mistral.ai/news/?categories=research | 开源模型 / 模型研究 | RSS | 待逐站核验 | https://mistral.ai/news/?categories=research https://mistral.ai/news/?categories=engineering | 官方已区分 Research / Engineering / Product / Company / Solutions，按 categories 白名单收录，不从整个 News 过滤 |
| `amazon-science` | 正在适配 | [Amazon Science](https://www.amazon.science/blog) | https://www.amazon.science/blog | AI Research | 列表页 | 待逐站核验 | https://www.amazon.science/blog | 保留且不局限 AI：算法、系统、机器人、经济学等科学内容均可收录 |
| `chip-huyen` | 正在适配 | [Chip Huyen](https://huyenchip.com/blog/) | https://huyenchip.com/blog/ | ML Systems / LLM Engineering | RSS + Sitemap | 无已知官方中文 | https://huyenchip.com/ (日期路径) | https://huyenchip.com/ (日期路径文章 /YYYY/MM/DD/<slug>.html) |
| `sebastian-raschka` | 已适配 | [Ahead of AI](https://magazine.sebastianraschka.com/archive) | https://magazine.sebastianraschka.com/archive | LLM 训练 / 微调 / Research | RSS + Sitemap | 无已知官方中文 | https://magazine.sebastianraschka.com/archive | `/archive` 为稳定清晰的文章索引（/p/<slug>） |
| `hamel-husain` | 已适配 | [Hamel Husain](https://hamel.dev/) | https://hamel.dev/ | Agent / Evals / AI 产品 | RSS | 无已知官方中文 | https://hamel.dev/ | `/blog/` 已跳转主页；主页维护 long-form writing 索引，质量高 |
| `eugene-yan` | 正在适配 | [Eugene Yan](https://eugeneyan.com/writing/) | https://eugeneyan.com/writing/ | Applied ML / LLM / 产品实践 | RSS + Sitemap | 无已知官方中文 | https://eugeneyan.com/writing/ | https://eugeneyan.com/writing/ (排除站外跳转占位) |
| `jay-alammar` | 已适配 | [Jay Alammar](https://newsletter.languagemodels.co/archive) | https://newsletter.languagemodels.co/archive | LLM 可视化教育 | RSS | 无已知官方中文 | https://newsletter.languagemodels.co/archive https://jalammar.github.io/ | 双源：新文章在 newsletter archive；经典 Illustrated Transformer / BERT 等在旧站 jalammar.github.io |
| `andrej-karpathy` | 已适配 | [Andrej Karpathy](https://karpathy.bearblog.dev/) | https://karpathy.bearblog.dev/ | LLM 教育 / 个人思考 | RSS | 无已知官方中文 | https://karpathy.bearblog.dev/（主）https://karpathy.github.io/（legacy）https://karpathy.ai/blog/（补充） | 多源：Bear Blog 为 2025 后活跃长文源；旧 GitHub Blog 2026 仍偶尔更新故保留；karpathy.ai/blog 可作补充 |
| `keli-wen` | 已适配 | [LastWhisper](https://keli-wen.github.io/One-Poem-Suffices/) | https://keli-wen.github.io/One-Poem-Suffices/ | LLM / Agent / Context Engineering | Sitemap | 中文原文，en 双语 | https://keli-wen.github.io/One-Poem-Suffices/ | 来源 ID 为 keli-wen（GitHub 昵称），博客显示名 LastWhisper；无 RSS；sitemap 无日期，用 GitHub 提交历史兜底（git_date） |
| `moonshot` | 已适配 | [Moonshot](https://www.kimi.com/en/blog/) | https://www.kimi.com/en/blog/ | LLM 模型 / Agent / Benchmark | Sitemap | 无官方中文，模型翻译 | https://www.kimi.com/en/blog/ | 该页即 Kimi Research（K3 / K2.6 / Agent Swarm / Muon / MoBA / Mooncake），比开放平台 Blog 干净 |
| `z-ai` | 候选 | [Z.ai](https://z.ai/blog) | https://z.ai/blog | LLM / Agent / AI Coding | 无 | 待核验 | 无（https://z.ai/blog 当前 404；https://z.ai/sitemap.xml 未发现 `/blog/`） | 单篇 `https://z.ai/blog/<slug>` 可访问，但未发现官方可枚举文章入口；保持 dry-run-only，禁止自动更新；不得回退到 https://www.zhipuai.cn/zh/news |
| `github-engineering` | 已适配 | [GitHub Engineering](https://github.blog/engineering/) | https://github.blog/engineering/ | Developer Platform / Engineering | RSS + Sitemap | 无官方中文，模型翻译 | https://github.blog/engineering/ | /engineering/feed/ + post-sitemap；排除 changelog/news-insights/author/category |
| `trail-of-bits` | 计划中 | [Trail of Bits](https://blog.trailofbits.com/) | https://blog.trailofbits.com/ | Security / Program Analysis | RSS 待复核 | 待核验 | https://blog.trailofbits.com/ | 做 category allowlist：Application Security、Ecosystem Security、Engineering Practice、Research Practice、Cryptography、Fuzzing、Program Analysis、Machine Learning；宁多收技术领域，不收公司 Announcement |
| `tailscale` | 计划中 | [Tailscale Blog](https://tailscale.com/blog/) | https://tailscale.com/blog/ | Networking / Zero Trust | RSS | 待核验 | https://tailscale.com/blog/ | 保留根 Blog 但不能全收：只要 networking、protocol、security、distributed systems、性能/可靠性、底层工程；Company、产品可用性、调查营销、浅层教程排除 |
| `fly-io` | 计划中 | [Fly.io Blog](https://fly.io/blog/) | https://fly.io/blog/ | Distributed Systems / Infrastructure | Feed 待复核 | 待核验 | https://fly.io/blog/ | 保留：Postgres、SQLite/LiteFS、distributed systems、VM/infra 深挖质量高；只排除纯产品/价格公告 |
| `meta-engineering` | 已适配 | [Meta Engineering](https://engineering.fb.com/) | https://engineering.fb.com/ | Large-scale Engineering | RSS + Sitemap | 无官方中文，模型翻译 | https://engineering.fb.com/ | 保留 Engineering；优先 AI/ML、Production Engineering、Data Infrastructure、Security 分类；sitemap_index 仅取 post-sitemap；排除 meta-tech-podcast |
| `google-security` | 已适配 | [Google Security](https://security.googleblog.com/) | https://security.googleblog.com/ | Security | RSS + Sitemap | 无官方中文，模型翻译 | https://security.googleblog.com/ | Google Online Security Blog 为长期技术安全博客（漏洞、Chrome 安全、威胁研究密度高）；不再用 blog.google/security/ |
| `tencent-cloud` | 候选 | [腾讯云开发者社区](https://cloud.tencent.com/developer/) | https://cloud.tencent.com/developer/ | AI / LLM / 云工程（UGC） | 列表页 | 官方简体中文原生 | 无（暂停 broad UGC 生产索引） | 巨大 UGC 社区（官方团队 + 第三方 + 媒体转载混排），边界太差；暂停作为生产索引，保留 ID/适配代码；以后只登记经审核的腾讯官方工程团队专栏 |
| `tencent-hunyuan` | 正在适配 | [腾讯混元研究博客](https://hy.tencent.com/research) | https://hy.tencent.com/research | LLM / Agent / Research（中文） | POST JSON API（publicList/publicDetail） | 官方简体中文直通（lang=zh） | https://hy.tencent.com/research（无 RSS/sitemap，React SPA；发现与正文走 api.hunyuan.tencent.com） | 2026-02 上线，公开混元研究员前沿研究与技术实践；7 篇（elr/hyra/hy3 等）；发现+抓取+官方中文直通已验证；dry-run-only；正文 Markdown 直通、图片 COS 原链 |
| `dan-koe` | 已适配 | [Dan Koe](https://letters.thedankoe.com/) | https://letters.thedankoe.com/ | 个人成长 / AI 时代技能 / 创作 | RSS + Sitemap | 无已知官方中文 | https://letters.thedankoe.com/ (/p/<slug>) | Substack（future/proof）；RSS 20 条 + sitemap 90 条，3 篇样本审计通过；已转 active，6 篇（3 en + 3 zh）全量链路验证通过 |
| `mozilla-hacks` | 计划中 | [Mozilla Hacks](https://hacks.mozilla.org/) | https://hacks.mozilla.org/ | Web Platform | RSS | 待核验 | https://hacks.mozilla.org/ | 可能存在 WAF 抓取障碍 |
| `datadog-engineering` | 计划中 | [Datadog Engineering](https://www.datadoghq.com/blog/engineering/) | https://www.datadoghq.com/blog/engineering/ | Observability / Infrastructure | RSS | 待核验 | https://www.datadoghq.com/blog/engineering/ | 通用工程来源，后续收录 |
| `shopify-engineering` | 计划中 | [Shopify Engineering](https://shopify.engineering/topics/ai-machine-learning) | https://shopify.engineering/topics/ai-machine-learning | Backend / Commerce Infrastructure | Feed 待复核 | 待核验 | https://shopify.engineering/topics/ai-machine-learning（优先）https://shopify.engineering/ | AI/ML topic 含 agent、LLM judge、GPU、搜索、推荐等工程深挖；`/latest` 混 Culture / Behind the Scenes，仅作补充 |
| `julia-evans` | 计划中 | [Julia Evans](https://jvns.ca/) | https://jvns.ca/ | Systems / Networking / Learning | Atom | 无已知官方中文 | https://jvns.ca/ | 内容优秀，但更偏通用工程 |
| `mitchell-hashimoto` | 计划中 | [Mitchell Hashimoto](https://mitchellh.com/writing) | https://mitchellh.com/writing | Infrastructure / Developer Tools | RSS | 无已知官方中文 | https://mitchellh.com/writing | 通用工程来源，后续收录 |
| `llama-index` | 候选 | [LlamaIndex Blog](https://www.llamaindex.ai/blog) | https://www.llamaindex.ai/blog | Agent / RAG / Document Intelligence | 待核验 | 待核验 | https://www.llamaindex.ai/blog | 保留 /blog 但强过滤：RAG、retrieval、agents、workflows、evals、data architecture 收；newsletter、fundraising、customer/company 内容排除 |
| `cognition` | 候选 | [Cognition](https://cognition.com/research) | https://cognition.com/research | Autonomous Coding Agent | Sitemap / 列表待核 | 待核验 | https://cognition.com/research（主）https://cognition.com/blog（补充） | Research 页为主；Blog 混地区发布、产品、公司消息，仅作补充 |
| `replit` | 候选 | [Replit Blog](https://replit.com/blog) | https://replit.com/blog | Coding Agent / AI Product | 待核验 | 待核验 | https://replit.com/blog | 分类边界：Infrastructure + Engineering 默认允许；AI 再做内容质量过滤（混 webinar/宣传）；Product / News / Events / Builder Spotlight / Education 默认排除 |
| `together-ai` | 候选 | [Together AI](https://www.together.ai/research-blog) | https://www.together.ai/research-blog | Open Models / Training / Inference | RSS | 待核验 | https://www.together.ai/research-blog | Research Blog 已按 Agents / Inference / Kernels / Model Shaping / Architecture 等技术主题组织 |
| `fireworks-ai` | 候选 | [Fireworks AI Blog](https://fireworks.ai/blog) | https://fireworks.ai/blog | LLM Inference / Models | 待核验 | 待核验 | https://fireworks.ai/blog | 保留 Blog，白名单 Benchmarks / Developer Experience / Agentic / Training；Company News、Partner Announcements、Case Studies、Use Cases 默认排除 |
| `weights-and-biases` | 候选 | [Weights &amp; Biases Articles](https://wandb.ai/site/articles/genai/) | https://wandb.ai/site/articles/genai/ | LLM Evals / Training / MLOps | 待核验 | 待核验 | https://wandb.ai/site/articles/genai/ https://wandb.ai/site/articles/genai/agents/ https://wandb.ai/site/articles/techniques/ | `/fully-connected` 不适合做稳定技术索引；新 Articles 分类结构清晰 |
| `replicate` | 候选 | [Replicate Blog](https://replicate.com/blog) | https://replicate.com/blog | Open Models / AI Product | 待核验 | 待核验 | https://replicate.com/blog | 保留但降为严格精选源：LoRA、serving、Cog、infra 技术文收；模型可运行公告、prompt showcase、changelog 不收 |
| `scale-ai` | 候选 | [Scale Labs](https://labs.scale.com/blog) | https://labs.scale.com/blog | Evals / Data / AI Research | Sitemap / 列表待核 | 待核验 | https://labs.scale.com/blog | Scale Labs 聚焦 evals、agents、研究；公司主 Blog 商业/政策/合作内容多 |
| `yohei-nakajima` | 候选 | [Yohei Nakajima](https://yoheinakajima.com/blog/) | https://yoheinakajima.com/blog/ | Agent Engineering / AI 产品 | RSS | 无已知官方中文 | https://yoheinakajima.com/blog/ | 存在明确 Blog 索引，不从主页发现 |
| `jason-liu` | 候选 | [Jason Liu](https://jxnl.co/writing/) | https://jxnl.co/writing/ | Structured Output / Agent / Evals | 待核验 | 无已知官方中文 | https://jxnl.co/writing/ | Writing 为 RAG / context engineering / agents / evals 文章集合 |
| `swyx` | 候选 | [swyx](https://www.swyx.io/ideas) | https://www.swyx.io/ideas | AI Engineering / Learn in Public / 职业成长 | RSS | 无已知官方中文 | https://www.swyx.io/ideas | `/ideas` 为完整写作索引并区分 Essay / Note / Tutorial / Talk / Podcast，只收文字型内容 |
| `nathan-lambert` | 候选 | [Interconnects](https://www.interconnects.ai/archive) | https://www.interconnects.ai/archive | LLM Training / RLHF / Evals | RSS | 无已知官方中文 | https://www.interconnects.ai/archive | Archive 为稳定文章入口 |
| `sebastian-ruder` | 候选 | [Sebastian Ruder](https://newsletter.ruder.io/archive) | https://newsletter.ruder.io/archive | NLP / LLM Research / 学习型长文 | RSS | 无已知官方中文 | https://newsletter.ruder.io/archive（当前源）https://www.ruder.io/（legacy） | 近年写作转 newsletter；老站保留经典 NLP 长文，作 legacy |
| `maarten-grootendorst` | 候选 | [Maarten Grootendorst](https://newsletter.maartengrootendorst.com/archive) | https://newsletter.maartengrootendorst.com/archive | LLM / RAG / Agent / 可视化 | 待核验 | 无已知官方中文 | https://newsletter.maartengrootendorst.com/archive（主）https://www.maartengrootendorst.com/（mirror） | 主要写作已转 Substack，Archive 持续更新；个人站作 mirror |
| `ethan-mollick` | 候选 | [One Useful Thing](https://www.oneusefulthing.org/archive) | https://www.oneusefulthing.org/archive | AI 产品方法 / 工作与学习 | RSS | 无已知官方中文 | https://www.oneusefulthing.org/archive | Archive 更适合稳定发现文章 |
| `pragmatic-engineer` | 候选 | [The Pragmatic Engineer](https://newsletter.pragmaticengineer.com/) | https://newsletter.pragmaticengineer.com/ | AI 工程 / 职业发展 | RSS | 无已知官方中文 | https://newsletter.pragmaticengineer.com/t/real-world-engineering-challenges https://newsletter.pragmaticengineer.com/t/ai-engineering | 重点收 real-world-engineering-challenges + ai-engineering topic；排除 Pulse 新闻汇总、Podcast、AMA |
| `scott-young` | 候选 | [Scott H. Young](https://www.scotthyoung.com/blog/articles/) | https://www.scotthyoung.com/blog/articles/ | 学习科学 / 个人成长 | RSS | 无已知官方中文 | https://www.scotthyoung.com/blog/articles/ | Articles 为学习、思考、哲学、认知文章集合 |
| `ness-labs` | 候选 | [Ness Labs](https://nesslabs.com/articles) | https://nesslabs.com/articles | 学习 / 心智 / 个人成长 | RSS | 无已知官方中文 | https://nesslabs.com/articles（优先 Thinking / Learning / Neuroscience topics） | Articles + topics 比首页干净，与扩大认知方向匹配 |

适配状态说明：

- `已适配`：已进入发现、抓取、语言处理、持久化与前端展示链路。
- `正在适配`：已完成 `dry-run-only` 最简脚手架，正在等待或推进完整适配；不会翻译或写文章。
- `计划中`：用户已认可，但当前 LLM / Agent 主队列完成前不推进。
- `候选`：仅完成初步发现，未经用户审核，不得加入生产来源配置。

## 当前推进顺序

1. 已完成共性能力：Defuddle 抓取引擎切换（worker backend，图片保留 + fbsbx 误判修复）、可见文本日期解析、zh 路径探测（zh_path_map）、GitHub 提交历史日期兜底（git_date）、发现层 curl 回退、腾讯追踪参数清理。
2. 2026-08-11 已完成适配：cursor、qwen、google-research、meta-ai、hugging-face、keli-wen、moonshot、google-security、meta-engineering、github-engineering（10 个，转 active）。
3. 2026-08-12 来源治理审查：新增「来源质量原则」；统一修正各源索引 URL（engineering/archive/topic 优先于 broad news/blog）；tencent-cloud 暂停 broad UGC 生产索引，新增 tencent-hunyuan 候选；hugging-face 主源改官方组织 Articles；andrej-karpathy / jay-alammar / sebastian-ruder / maarten-grootendorst 改为多源。openai 保持不变。
4. 正在适配（有正文提取阻碍，保持 dry-run-only）：tencent-cloud（已暂停 broad UGC，等待重新登记官方工程团队专栏）。
5. 已适配来源持续运行增量更新并抽检质量。

2026-08-09 至 08-12 的逐站审计与 URL 边界核验结论已全部沉淀进本表各来源行（含 Z.ai / Moonshot、腾讯/阿里、Google Security/Meta Engineering/GitHub Engineering 探索，以及 08-12 来源质量审查）。审计明细曾存于 `docs/sources/`，已随结论沉淀删除，git 历史可查。当前 19 个已适配来源（含 dan-koe）。
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
- [已完成] 增加可见文本日期解析（meta-ai / keli-wen 落地）。
- [已完成] 修复正文图片丢失（Defuddle 引擎 + fbsbx.com 误判修复；google-research / meta-ai 落地）。
- [已完成] Defuddle 抓取引擎替换 Readability（`FETCH_BACKEND=worker`，worker/fetch/extractor.ts）。
- [已完成] 无日期博客 GitHub 提交历史兜底（`git_date`，keli-wen 落地）。
- [已完成] 发现层 curl 回退（openai.com TLS 指纹拦截）。
- 为 Hugging Face 增加 org 投稿过滤落地（已配置 `^/blog/[^/]+$` 单段过滤，待抽检质量）。
- [脚手架完成] 腾讯云正文 `__NEXT_DATA__` JSON 提取适配。
- Z.ai 暂不建设正文提取器：缺少官方可枚举入口，先完成来源边界核验。
- [脚手架完成] 处理 `src`、`srcset`、`data-src`、`data-lazy-src`、`data-original` 等图片地址并保留原链。
- [脚手架完成] 翻译前保护链接和图片 URL，翻译后严格校验并原样恢复。
- [已完成] 增加来源自动审计命令，输出各发现入口与三篇样本报告。
- 增加有界并发、按域名限速和失败重试。
