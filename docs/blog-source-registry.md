# 博客适配开发登记表

所有博客的审核、适配阶段、阻碍与后续顺序以本表为准。最后更新：2026-09-05。

## 来源质量原则

- **日期政策（2026-09-05 起）**：发表日期不再是硬约束。四层日期解析（meta/可见文本/URL/Git 历史）全空时用**系统收录日期兜底**（`publishedAtSource: 'ingested'`，见 `scripts/update/fetch.ts`），无日期的高质量文章照样收录。展示层未来可据标记区分"发表于/收录于"（待办）。
- **收录口径（2026-09-05 起放宽）**：高质量即收——技术（AI/Agent/系统）、个人成长与学习、思想哲学、**政治哲学与技术政治**（纯党派口水、竞选动员除外）。

收录优先级：**Research / Engineering / Technical / Science / Essays / Writing > 普通 Blog > News / Company News**。

**项目定位（2026-08-28 起）**：专注 **AI 公司博客**与**个人作者**两类来源。偏工程/基础设施方向且文章量巨大的站点（如 Cloudflare ~3577 篇、Meta Engineering ~1084 篇发现量）放弃收录；文章量小的垂直工程源（github-engineering、google-security）不受此限。大厂研究院按实际内容密度个案评估（google-research 因量大且混非 AI 主题放弃；microsoft-research 量适中保留）。

- 企业源优先官方 Research / Engineering / Technical 索引或 Archive；`/news`、`/blog` 需先核验内容密度与过滤边界。模型发布、产品发布不机械排除——只要讲训练方法、架构、推理、eval、安全、系统实现、失败经验、设计取舍就收录；签约、合作、融资、任命、客户案例、活动、奖项、价格调整、市场宣传、纯 availability announcement 一律排除。
- 个人作者：技术、思想、哲学、学习、认知、职业方法、创作方法均可，只要能产生长期学习价值。
- 过滤不能只看标题关键词（`Introducing XXX` / `Launching XXX` 可能是高质量技术文）。真正判断标准：有没有解释 why、architecture、method、experiment / eval、failure / trade-off、implementation detail、可迁移知识（后续在 discovery pipeline 增加 knowledge-value filter）。
- 新增博客时先找 Research / Engineering / Writing / Archive 索引，不能见到 `/news` 或 `/blog` 就直接抓。

| ID | 适配状态 | 来源 | 来源地址 | 方向 | 已验证发现入口 | 中文 / 本地化 | 收录文章索引 URL 来源 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `openai` | 已适配 | [OpenAI](https://openai.com/news/) | https://openai.com/news/ | LLM / Agent / Research | Sitemap 分类白名单 | 官方简体中文优先，否则模型翻译 | https://openai.com/news/research/ https://openai.com/news/safety-alignment/ https://openai.com/news/engineering/ https://openai.com/news/security/ (中文: https://openai.com/zh-Hans-CN/news/research/) | 仅收录 research/engineering/safety/security 分类；hrefLang alternate 命中即直通中文原文；⚠️ 无尾斜杠 child sitemap 路径会被 CDN 按 TLS 指纹 403（curl 拿到 308 可跟随），Node 侧一律走 curl 回退（fetch-backend / audit / census 已注册） |
| `anthropic` | 已适配 | [Anthropic](https://www.anthropic.com/research) | https://www.anthropic.com/research | LLM / Agent / Safety | Sitemap | 模型翻译 | https://www.anthropic.com/research https://www.anthropic.com/engineering | 保留 Research + Engineering，坚决排除 /news 公司公告；这是目标范式，不换源 |
| `lilian-weng` | 已适配 | [Lil'Log](https://lilianweng.github.io/archives/) | https://lilianweng.github.io/archives/ | LLM / Agent / Research | RSS + Sitemap | 模型翻译 | https://lilianweng.github.io/archives/ | 官方 Archives 为干净长文索引 |
| `langchain` | 已适配 | [LangChain](https://www.langchain.com/blog) | https://www.langchain.com/blog | Agent Framework / Evals / Observability | RSS + Sitemap | 无已知官方中文 | https://www.langchain.com/blog | 保留 /blog；白名单 Agent Architecture / Evals、Observability / Engineering / Systems / Conceptual Guide / Open Source；排除 Customer、Newsletter、Partner、Company Announcement |
| `cursor` | 已适配 | [Cursor](https://cursor.com/blog/topic/research) | https://cursor.com/blog/topic/research | Coding Agent / Model Training / Agent Harness | Sitemap + 列表页 | 官方中文 `/cn/blog/` 直通（hreflang + zh_path_map 双通道） | https://cursor.com/blog/topic/research | 主入口为独立 Research 分类（agent harness / 模型训练 / eval / sandbox / GPU kernel）；Broad Blog 混 Product / Company / Customers，仅作补充；中文路由 /cn/blog/topic/research |
| `qwen` | 已适配 | [Qwen](https://qwenlm.github.io/blog/) | https://qwenlm.github.io/blog/ | LLM / 多模态 / Agent | Sitemap | 官方简体中文 `/zh/blog/` 直通（zh_path_map 探测） | https://qwenlm.github.io/blog/ | https://qwenlm.github.io/blog/ (中文 /zh/blog/ 近满) |
| `google-deepmind` | 已适配 | [Google DeepMind](https://deepmind.google/blog-categories/technical-blogs) | https://deepmind.google/blog-categories/technical-blogs | 前沿模型 / AI Safety / Science | RSS + Sitemap | 待逐站核验 | https://deepmind.google/blog-categories/technical-blogs（主）https://deepmind.google/blog/（补充） | 主要入口为 Technical Blogs 分类；Broad News 混模型发布、资助、合作，作补充并排除政企公告 |
| `microsoft-research` | 已适配 | [Microsoft Research](https://www.microsoft.com/en-us/research/blog/) | https://www.microsoft.com/en-us/research/blog/ | LLM / Agent / Research | RSS + Sitemap | 待逐站核验 | https://www.microsoft.com/en-us/research/blog/ | 研究组织博客，保留；仅排除活动、奖项、招聘 / fellowship；2026-08-28 接入 Yoast sitemapindex（post-sitemap*.xml），发现量 ~10 → 640（2019+ 口径） |
| `meta-ai` | 已适配 | [Meta AI](https://ai.meta.com/blog/) | https://ai.meta.com/blog/ | Llama / 生成式 AI / Research | 列表页 | 无官方中文，模型翻译 | https://ai.meta.com/blog/ | 保留；只收 FAIR/Research、模型/训练/推理、安全、开源技术；grants、生态合作、活动、商业 adoption 排除 |
| `eleuther-ai` | 已适配 | [EleutherAI](https://blog.eleuther.ai/) | https://blog.eleuther.ai/ | 开源 LLM / 可解释性 / Safety | RSS + Sitemap | 无已知官方中文 | https://blog.eleuther.ai/ (根 slug) | 保留，研究密度高；仅过滤组织公告 |
| `mistral-ai` | 已适配 | [Mistral AI](https://mistral.ai/news/?categories=research) | https://mistral.ai/news/?categories=research | 开源模型 / 模型研究 | RSS | 待逐站核验 | https://mistral.ai/news/?categories=research https://mistral.ai/news/?categories=engineering | 官方已区分 Research / Engineering / Product / Company / Solutions，按 categories 白名单收录，不从整个 News 过滤 |
| `amazon-science` | 正在适配 | [Amazon Science](https://www.amazon.science/blog) | https://www.amazon.science/blog | AI Research | 列表页 | 待逐站核验 | https://www.amazon.science/blog | 保留且不局限 AI：算法、系统、机器人、经济学等科学内容均可收录 |
| `chip-huyen` | 正在适配 | [Chip Huyen](https://huyenchip.com/blog/) | https://huyenchip.com/blog/ | ML Systems / LLM Engineering | RSS + Sitemap | 无已知官方中文 | https://huyenchip.com/ (日期路径) | https://huyenchip.com/ (日期路径文章 /YYYY/MM/DD/<slug>.html) |
| `sebastian-raschka` | 已适配 | [Ahead of AI](https://magazine.sebastianraschka.com/archive) | https://magazine.sebastianraschka.com/archive | LLM 训练 / 微调 / Research | RSS + Sitemap | 无已知官方中文 | https://magazine.sebastianraschka.com/archive | `/archive` 为稳定清晰的文章索引（/p/<slug>） |
| `hamel-husain` | 已适配 | [Hamel Husain](https://hamel.dev/) | https://hamel.dev/ | Agent / Evals / AI 产品 | RSS | 无已知官方中文 | https://hamel.dev/ | `/blog/` 已跳转主页；主页维护 long-form writing 索引，质量高 |
| `eugene-yan` | 正在适配 | [Eugene Yan](https://eugeneyan.com/writing/) | https://eugeneyan.com/writing/ | Applied ML / LLM / 产品实践 | RSS + Sitemap | 无已知官方中文 | https://eugeneyan.com/writing/ | https://eugeneyan.com/writing/ (排除站外跳转占位) |
| `jay-alammar` | 已适配 | [Jay Alammar](https://newsletter.languagemodels.co/archive) | https://newsletter.languagemodels.co/archive | LLM 可视化教育 | RSS + Sitemap | 无已知官方中文 | https://newsletter.languagemodels.co/archive https://jalammar.github.io/ | 双源：新文章在 newsletter archive；经典 Illustrated Transformer / BERT 等在旧站 jalammar.github.io；⚠️ Substack 平台的 sitemap/RSS 同为近期窗口（~10 篇），历史全量需 /archive 分页方案（待办） |
| `andrej-karpathy` | 已适配 | [Andrej Karpathy](https://karpathy.bearblog.dev/) | https://karpathy.bearblog.dev/ | LLM 教育 / 个人思考 | Atom + Sitemap + listing（双域三通道） | 无已知官方中文 | https://karpathy.bearblog.dev/（主）https://karpathy.github.io/（legacy） | 2026-08-28 修复（18 → 31 篇）：bearblog 三通道全接入（rss /feed/ + sitemap.xml 14 篇，/now 页 exclude）；`domain: karpathy.bearblog.dev` + 源级 `extra_domains: ["karpathy.github.io"]` 放行 legacy 老文（listing 23 条）；karpathy.ai/blog 观察后未接（无独立 feed） |
| `lastwhisper` | 已适配 | [LastWhisper](https://keli-wen.github.io/One-Poem-Suffices/) | https://keli-wen.github.io/One-Poem-Suffices/ | LLM / Agent / Context Engineering | Sitemap | 中文原文，en 双语 | https://keli-wen.github.io/One-Poem-Suffices/ | 来源 ID 为 lastwhisper（2026-08-12 由 keli-wen 改名，与 collection id 对齐）；无 RSS；sitemap 无日期，用 GitHub 提交历史兜底（git_date） |
| `moonshot` | 已适配 | [Moonshot](https://www.kimi.com/en/blog/) | https://www.kimi.com/en/blog/ | LLM 模型 / Agent / Benchmark | 列表页 | 无官方中文，模型翻译 | https://www.kimi.com/en/blog/ | 该页即 Kimi Research（K3 / K2.6 / Agent Swarm / Muon / MoBA / Mooncake），比开放平台 Blog 干净；2026-08-28 修复（发现 0 → 9）：站点改版后无博客 sitemap（旧 sitemap-ug-blog.xml 404），blog_url 对齐 /en/blog/，listing 发现 + 正文日期；文章量小（~10 篇） |
| `z-ai` | 候选 | [Z.ai](https://z.ai/) | https://z.ai/ | LLM / Agent / AI Coding | 无 | 待核验 | 无 | 2026-09-02 复核：仍无可枚举博客入口——`https://z.ai/blog/<slug>` 单篇可访问（glm-5.3 / 5.3-flash / 5.2 / 5.1 均 200），但无列表页；`sitemap.xml` 仅产品页、不含 `/blog/`（单篇亦未收录）；站内 `/blog/` 路径 404。单篇正文硬编码在各篇独立 JS chunk（无日期元数据），blog_url 已改为官方首页 https://z.ai/（200）。保持 dry-run-only，禁止自动更新；不得回退到 https://www.zhipuai.cn/zh/news |
| `github-engineering` | 已适配 | [GitHub Engineering](https://github.blog/engineering/) | https://github.blog/engineering/ | Developer Platform / Engineering | RSS + Sitemap | 无官方中文，模型翻译 | https://github.blog/engineering/ | /engineering/feed/ + post-sitemap；排除 changelog/news-insights/author/category；2026-08-28 定位审查：文章量小，保留 |
| `google-security` | 已适配 | [Google Security](https://blog.google/security/) | https://blog.google/security/ | Security | RSS + Sitemap | 无官方中文，模型翻译 | https://blog.google/security/ | Google Online Security Blog 长期技术安全博客（漏洞、Chrome 安全、威胁研究密度高）；2026-08 核对 security.googleblog.com（2026-04 后停更、滞后约 3.5 月），保持 blog.google/security；hub 页（vrp/android-security/chrome-security/open-source-security）已 exclude；2026-08-28 定位审查：文章量小，保留 |
| `tencent-hunyuan` | 正在适配 | [腾讯混元研究博客](https://hy.tencent.com/research) | https://hy.tencent.com/research | LLM / Agent / Research（中文） | POST JSON API（publicList/publicDetail） | 官方简体中文直通（lang=zh） | https://hy.tencent.com/research（无 RSS/sitemap，React SPA；发现与正文走 api.hunyuan.tencent.com） | 2026-02 上线，公开混元研究员前沿研究与技术实践；7 篇（elr/hyra/hy3 等）；发现+抓取+官方中文直通已验证；dry-run-only；正文 Markdown 直通、图片 COS 原链 |
| `evomap` | 已适配 | [EvoMap](https://evomap.ai/zh/blog) | https://evomap.ai/blog | Agent Swarm / GEP / 自我进化 | Sitemap | 官方简体中文 `/zh/blog/` 直通（hreflang + zh_path_map） | https://evomap.ai/blog（中文 https://evomap.ai/zh/blog） | 2026-09-04 接入：无 RSS；列表页为客户端渲染，listing 解析不到文章 URL；sitemap.xml 含 21 篇 `/blog/<slug>` 且有 lastmod；英文索引 + `prefer_official_zh` + `zh_path_map: { "/blog": "/zh/blog" }`；排除 changelog / security-statement；同日 audit PASS（sitemap 19 有效）+ dry-run 3/3 中文直通 + 全量 19 篇入库（38 版本 zh/zh-cn），已转 active |
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
| `philipp-schmid` | 正在适配 | [Philipp Schmid](https://www.philschmid.de/) | https://www.philschmid.de/ | Agent 架构 / 评测实操 | listing（19） | 无已知官方中文 | https://www.philschmid.de/ | 2026-09-05 audit PASS（listing）；混入项目页/简介页，需配文章 RSS 或收窄列表 |
| `vicki-boykis` | 正在适配 | [Vicki Boykis](https://vickiboykis.com/) | https://vickiboykis.com/ | ML 系统 / 生产实践 | RSS（`https://vickiboykis.com/index.xml` 已验证 200，20 候选） | 无已知官方中文 | https://vickiboykis.com/ | 2026-09-05 复测 audit PASS（当日早些时候的 FAIL 为本机网络瞬时故障，非代码问题）；listing 0 候选无碍，RSS 为主入口。具备转 active 条件，待用户点头 |
| `maxime-labonne` | 已适配 | [Maxime Labonne](https://mlabonne.github.io/blog/) | https://mlabonne.github.io/blog/ | 微调 / 量化实操 | Sitemap（`https://mlabonne.github.io/blog/sitemap.xml`，51 候选） | 无已知官方中文 | https://mlabonne.github.io/blog/ | 2026-09-05 纯度抽查定性：提取干净，MB 级 markdown 系 Quarto 把配图 base64 内联（占 99%+）→ 已落地 `stripInlineDataUriImages`（Node+Worker 双路径，data-URI 图不落库），复审计 markdown 降为 7-8K 字符级、date 与 URL 逐一吻合（dcterms.date 候选生效）；listing 入口 25s 超时靠 sitemap 兜底。已转 active |
| `cameron-wolfe` | 已适配 | [Cameron R. Wolfe](https://cameronrwolfe.substack.com/) | https://cameronrwolfe.substack.com/ | Agent Evals / LLM RL | RSS（20）+ Sitemap（114 候选含 lastmod） | 无已知官方中文 | https://cameronrwolfe.substack.com/archive | 2026-09-05 /archive 分页待办由 sitemap 化解（配 sitemap_url + exclude_paths /archive /podcast）；复审计 PASS，已转 active |
| `neel-nanda` | 正在适配 | [Neel Nanda](https://www.neelnanda.io/) | https://www.neelnanda.io/ | 可解释性 | listing（25） | 无已知官方中文 | https://www.neelnanda.io/ | 2026-09-05 audit 部分通过：全站无发布日期（收录日兜底可收），`/cart` 等非文章页混入需 exclude |
| `dwarkesh` | 已适配 | [Dwarkesh Patel](https://www.dwarkesh.com/) | https://www.dwarkesh.com/ | AI 思想访谈 / 长文 | RSS（20）+ Sitemap（183 候选含 lastmod） | 无已知官方中文 | https://www.dwarkesh.com/archive | 2026-09-05 补 sitemap_url + exclude_paths（/archive /podcast）；复审计 PASS；narration 音频转写页字符数偏低（669），属站点形态；播客页靠 exclude 过滤，文本版完整性增量观察。已转 active |
| `mactalk` | 正在适配 | [池建强 MacTalk](https://macshuo.com/) | https://macshuo.com/ | 中文创作方法 / AI 信源 | RSS（`/?feed=rss2`，10 条真日期） | 无（中文） | https://macshuo.com/ | 2026-09-05 定性为**结构性不适配**：`/feed/` 返回首页 HTML，真实 feed 为 `/?feed=rss2`（已配）；但全站 permalink 为 `/?p=N` 查询串形态，`isLikelyArticleUrl` 的 pathname 假设不收录（candidates=0）。支持 query-permalink 需改 slug 派生（共性待办），暂保持 dry-run-only；wp-login/wp-admin 已入全局 NON_ARTICLE_PATHS |
| `lixiaolai` | 正在适配 | [李笑来](https://lixiaolai.com/) | https://lixiaolai.com/ | 中文学习 / 注意力体系 | listing（30） | 无（中文） | https://lixiaolai.com/articles | 2026-09-05 audit 部分通过：articles/books 聚合页混入，需文章 URL 过滤 + 日期解析 |
| `doctorow` | 正在适配 | [Cory Doctorow](https://pluralistic.net/) | https://pluralistic.net/ | 技术政治批判 | listing（13） | 无已知官方中文 | https://pluralistic.net/ | 2026-09-05 audit PASS（收录日兜底）；plura-list 跨域邮件列表页需 exclude；量大（2000+）增量观察 |
| `wolfram` | 已适配 | [Stephen Wolfram](https://writings.stephenwolfram.com/) | https://writings.stephenwolfram.com/ | 计算科学 / AI 路线 | RSS（`/feed/`，12 条真日期）+ listing（13） | 无已知官方中文 | https://writings.stephenwolfram.com/ | 2026-09-05 修复日期误解析（根因：文章页确认无机器可读日期，正文历史年份 1988/1990 被 heading/visible 启发式误取）：补 RSS + 新增源级 `date_fallback: conservative`（只信机器可读日期，全空落收录日）；复审计日期全部 2026 真日期。已转 active |
| `venkatesh-rao` | 已适配 | [Venkatesh Rao / Contraptions](https://contraptions.venkateshrao.com/) | https://contraptions.venkateshrao.com/ | 技术哲学 / 组织思想 | RSS（20）+ Sitemap（473 候选含 lastmod） | 无已知官方中文 | https://contraptions.venkateshrao.com/archive | 2026-09-05 补 sitemap_url + exclude_paths；复审计 PASS。已转 active |
| `dair` | 正在适配 | [Elvis Saravia / DAIR.AI](https://academy.dair.ai/blog) | https://academy.dair.ai/blog | Agent 教程 / 评测 | listing（23） | 无已知官方中文 | https://academy.dair.ai/blog | 2026-09-05 audit PASS（收录日兜底）；课程聚合页混入需收窄 |
| `mindhacks` | 正在适配 | [刘未鹏 MindHacks（静态归档）](https://mindhacks-mirror.yaozeyuan.online/) | https://mindhacks-mirror.yaozeyuan.online/ | 中文认知 / 学习方法 | listing（44 候选） | 无（中文） | https://mindhacks-mirror.yaozeyuan.online/ | 2026-09-05 改挂 YaoZeyuan/mindhacks.cn-mirror 镜像站（调研定性：evmn/Mind-Hacks 实为 Kindle 电子书项目非逐篇备份，mindhacks.cn 本站已死；镜像 44 篇 = 2006-2017 全站全部产出）：`url_date_pattern` 从文件名 `_YYYY_MM_DD_` 取真实发表日（url-date 新增数字月份支持），复审计 PASS（3 样本真日期）。保持 dry-run-only：第三方镜像长期可用性待观察，本机 clash 拒连需 `USE_PROXY=false` 直连；转 active 或一次性回填待用户定夺 |
| `transformer-circuits` | 正在适配 | [Transformer Circuits](https://transformer-circuits.pub/) | https://transformer-circuits.pub/ | 可解释性（Olah 新阵地） | Atom（`/feed.xml`，56 条）+ listing | 无已知官方中文 | 无 | 2026-09-05 补 Atom feed；首次审计发现 50 条 feed 链接以 `/index.html` 结尾被全局黑名单吞掉（candidates 2/56）→ 该源配 `allow_non_article_paths` + `article_paths ^/\d{4}/` 豁免后恢复 52 候选，复审计 PASS。保持 dry-run-only：单篇 17-36 万字符（workspace 一篇 358K），翻译/D1 成本高，全量入库策略待用户定夺 |
| `thonking` | 已适配 | [Horace He / Thonking](https://www.thonking.ai/) | https://www.thonking.ai/ | ML Systems 第一性原理 | RSS（6）+ Sitemap（6，站点本身仅 6 篇） | 无已知官方中文 | https://www.thonking.ai/archive | 2026-09-05 补 sitemap_url + exclude_paths；复审计 PASS 无阻碍（站点文章总量少是站点形态，非管线问题）。已转 active（首个） |
| `james-clear-321` | 正在适配 | [James Clear 3-2-1](https://jamesclear.com/3-2-1) | https://jamesclear.com/3-2-1 | 习惯 / 决策科学（短形态） | listing（377） | 无已知官方中文 | https://jamesclear.com/3-2-1 | 2026-09-05 audit PASS（收录日兜底）；books/articles 聚合导航混入，需收窄到单期 |
| `paul-graham` | 已适配 | [Paul Graham](http://www.paulgraham.com/) | http://www.paulgraham.com/ | 创业 / 技术思想 | listing（233） | 无（收录日兜底） | http://www.paulgraham.com/articles.html | 2026-09-05 解除拉黑回归（新日期政策首个受益者）；audit PASS（兜底日期符合预期）；已转 active |
| `zvi` | 正在适配 | [Zvi Mowshowitz](https://thezvi.substack.com/) | https://thezvi.substack.com/ | AI 进展周报 / 对齐分析 | RSS（20）+ Sitemap（~1228 含 lastmod） | 无已知官方中文 | https://thezvi.substack.com/archive | 2026-09-05 二期配置；首页 JS 壳 listing 不可用，feed 全文；首审计 PASS（merged=1227，样本 /p/ 干净，一条 125K 长文正常）；转 active 待用户排期 |
| `gary-marcus` | 正在适配 | [Gary Marcus / Marcus on AI](https://garymarcus.substack.com/) | https://garymarcus.substack.com/ | AI 批评 / 认知科学 | RSS（20）+ Sitemap（~587 含 lastmod） | 无已知官方中文 | https://garymarcus.substack.com/archive | 2026-09-05 二期配置；站名已改 "Marcus on AI"；偶有付费墙；首审计 PASS（merged=587，样本干净） |
| `convivial-society` | 正在适配 | [Adam Sacasas / The Convivial Society](https://theconvivialsociety.substack.com/) | https://theconvivialsociety.substack.com/ | 技术文化 / 技术哲学 | RSS（20）+ Sitemap（~201 含 lastmod） | 无已知官方中文 | https://theconvivialsociety.substack.com/archive | 2026-09-05 二期配置；exclude 加 /podcast（部分为音频期）；首审计 PASS（merged=201；一条样本 805 字符贴近 800 下限，关注） |
| `acx` | 正在适配 | [Scott Alexander / Astral Codex Ten](https://www.astralcodexten.com/) | https://www.astralcodexten.com/ | 综合随笔 / 科学文化 | RSS（20）+ Sitemap（~1469 含 lastmod） | 无已知官方中文 | https://www.astralcodexten.com/archive | 2026-09-05 二期配置；量极大（Open Thread 日常）；非 www 与 substack 域均 301 到 www；首审计 PASS（merged=1471；一条样本 384K 字符聚会点清单页，>200K 自动兜底 V2 分块，注意翻译成本） |
| `jack-clark` | 正在适配 | [Jack Clark / Import AI](https://jack-clark.net/) | https://jack-clark.net/ | AI 政策 / 业界周报 | RSS（10 全文）+ Sitemap（486 含 lastmod） | 无已知官方中文 | https://jack-clark.net/ | 2026-09-05 二期配置；WP+Jetpack，sitemap 混少量静态页；首审计 PASS（merged=485，image-sitemap 滤除，/about /thinking 静态页 0 污染） |
| `derek-sivers` | 正在适配 | [Derek Sivers](https://sive.rs/) | https://sive.rs/blog | 个人成长 / 创业随笔 | RSS（`https://sive.rs/articles.xml`，Atom 50 条全文） | 无已知官方中文 | https://sive.rs/blog | 2026-09-05 二期配置；**勿用 sitemap**（全站 feed.xml 混推文/书摘，sitemap 文章 slug 无法按模式过滤）；首审计 PASS（merged=514，articles.xml + listing 双通道，无书籍页混入） |
| `henrik-karlsson` | 正在适配 | [Henrik Karlsson / Escaping Flatland](https://www.henrikkarlsson.xyz/) | https://www.henrikkarlsson.xyz/ | 写作 / 思考方法 | RSS（20）+ Sitemap（~116 含 lastmod） | 无已知官方中文 | https://www.henrikkarlsson.xyz/archive | 2026-09-05 二期配置；escapingflatland.substack.com 301 到自定义域，必须记新域；约月更；首审计 PASS（merged=116，部分日期为 lastmod 天精度） |
| `cal-newport` | 正在适配 | [Cal Newport](https://calnewport.com/) | https://calnewport.com/blog/ | 深度工作 / 数字极简 | RSS（8）+ Sitemap（post-sitemap 系 ~1126 含 lastmod） | 无已知官方中文 | https://calnewport.com/blog/ | 2026-09-05 二期配置；WP+Yoast，子图里的 tag/author/press URL 靠全局黑名单滤除；首审计 PASS（merged=1149；page-sitemap 14 静态页漏入 → 已补 exclude_paths /blog 滤索引页） |
| `yangzhiping` | 正在适配 | [阳志平](https://yangzhiping.com/) | https://yangzhiping.com/essays | 中文认知 / 学习方法 | Sitemap（382，文章 ~360）+ listing | 无（原生中文） | https://yangzhiping.com/essays | 2026-09-05 二期配置；无任何 RSS，`article_paths ^/essays/\d{8}/?$` 过滤；日期仅 sitemap lastmod（天精度）；首审计 PASS（merged=343，候选全为 /essays/<8位日期>，lang=zh 正确） |

适配状态说明：

- `已适配`：已进入发现、抓取、语言处理、持久化与前端展示链路。
- `正在适配`：已完成 `dry-run-only` 最简脚手架，正在等待或推进完整适配；不会翻译或写文章。
- `计划中`：用户已认可，但当前 LLM / Agent 主队列完成前不推进。
- `候选`：仅完成初步发现，未经用户审核，不得加入生产来源配置。

## 当前推进顺序

1. 已完成共性能力：Defuddle 抓取引擎切换（worker backend，图片保留 + fbsbx 误判修复）、可见文本日期解析、zh 路径探测（zh_path_map）、GitHub 提交历史日期兜底（git_date）、发现层 curl 回退、腾讯追踪参数清理。
2. 2026-08-11 已完成适配：cursor、qwen、google-research、meta-ai、hugging-face、keli-wen、moonshot、google-security、meta-engineering、github-engineering（10 个，转 active）。
3. 2026-08-12 来源治理审查：新增「来源质量原则」；统一修正各源索引 URL（engineering/archive/topic 优先于 broad news/blog）；tencent-cloud 暂停 broad UGC 生产索引，新增 tencent-hunyuan 候选；hugging-face 主源改官方组织 Articles；andrej-karpathy / jay-alammar / sebastian-ruder / maarten-grootendorst 改为多源。openai 保持不变。
4. 2026-08-28 项目定位变更：专注 AI 公司 + 个人作者。移除 `cloudflare` / `meta-engineering` / `google-research` 三源（sources.json、本地 corpus、`src/content/blogs/*.md` + blogs-static、远程 D1 articles 及关联记录），计划中纯工程源划掉（明细见「暂缓 / 不纳入」）。`google-research` 与 `microsoft-research` 按内容密度个案评估后取舍。
6. 2026-08-28 移除 `simon-willison` / `hugging-face` 两源（用户指令：文章量过大）：sources.json、`src/content/blogs/*.md` + blogs-static 再生成、`backfill-policy.ts` / `backfill.ts` wave 表、远程 D1（simon-willison 存量 6 篇及关联 versions/categories、sources 表登记；hugging-face 无存量）、本地 corpus（simon-willison）。移除后 active 源 24 个。
7. 2026-08-28 上线前发现层清点（只枚举计数，不抓正文）：首轮 22 个 active 源计入范围约 19 443 篇（个人作者不限时间、非个人作者仅 2019+），openai / moonshot 发现层完全失效（P0）。**同日修复轮完成**：openai 根因为 census 缺 curl 回退注册 + 无尾斜杠 child sitemap 触发 CDN 指纹拦截（配置与生产链本就正常）；moonshot 对齐 /en/blog/ 走 listing；karpathy 接入 bearblog 双域三通道（新增源级 `extra_domains`）；microsoft-research 接入 Yoast sitemap；jay-alammar 接入 Substack sitemap（窗口限制仍在）；hugging-face 排除语言聚合 hub 并澄清口径（738 单段全为官方博文，社区双段已被过滤）；simon-willison 按用户指令加源级 `min_published_year: 2019`。修后 22/22 源 ok，计入范围 **11 234** 篇。修后总表与根因链见 [`docs/discovery-census-2026-08-28.md`](discovery-census-2026-08-28.md)；清点工具 `scripts/update/census.ts`。
4. 正在适配（有正文提取阻碍，保持 dry-run-only）：tencent-hunyuan（API 提取已验证，待完整适配）。2026-09-02 tencent-cloud 已正式移除（拉黑 tombstone），见「已移除源」表。
5. 已适配来源持续运行增量更新并抽检质量。
6. 2026-08-12 首轮原文 Backfill：25 个已适配源全部执行（约 2470 篇原文入库，Defuddle 抓取 + 完整性门禁，未翻译）。范围与策略见交接文档 `BLOGS_WIKI_BACKFILL_SCOPE_HANDOFF`，结果报告见 `docs/backfill-report.md`，错误台账见 `docs/backfill-errors.md`。
   - 批量工具：`npm run backfill -- --source <id> | --wave <n>`（policy 表在 `scripts/update/backfill-policy.ts`，完整性门禁在 `scripts/update/backfill-integrity.ts`）。
   - 本轮修复的提取/发现缺陷：相对图片 URL 绝对化、逗号拼接双时间戳、Next.js `_createdAt` 日期回退、URL 路径日期推断（`url_date_pattern`，simonwillison.net）、页面真实日期二次校验、Substack 直播/促销信号过滤、模板占位符 URL 过滤（msr listing 泄漏 `{postPermalink}`，`isLikelyArticleUrl` 拒绝含 `{`/`}`/`%7B` 的 URL）、迁移壳 URL exclude（deepmind antigravity → antigravity.google，RSS 仍含旧 302 壳）、hub 页 exclude（google-security vrp/android-security/chrome-security/open-source-security）、audit 补 curl 回退注册（修正 openai TLS 指纹拦截的假 FAIL）。
   - 已知限制（记入报告，后续处理）：cloudflare sitemap lastmod 全为 2026 无法日期过滤（本轮限量 80 篇）；google-research/google-security 仅 RSS 近期；microsoft-research listing 为客户端渲染、服务器忽略 `?page=N` 分页参数（backfill 受限于单页 ~13 篇，增量走 RSS ~10 条/7周不漏）；meta-ai `.gz` sitemap 本网络全 UA 403 且管线无 gunzip（增量靠 listing 兜底 ~10 篇，历史回填需 Actions 出口验证或专门发现）；hugging-face 剩 481 篇、simon-willison 剩 4271 篇待保护阀后批次。
7. 2026-08-12 管线泛化性与健壮性增强（为后续添加更多来源铺路）：增量路径接入库前质量门禁（`checkArticleIntegrity`，与 backfill 共用——模板页/导航列表/促销页/无标题/无日期/图片相对 URL 不再入库）；SourceConfig 新增按源可调字段 `min_content_chars` / `quality_filter` / `allow_non_article_paths` / `limit` / `discovery_strategy` / `max_child_sitemaps` / `backfill`；config 校验加固（`url_date_pattern` 编译+年份捕获组、交叉依赖校验、未知字段告警）；meta-refresh 壳页自动跟随（迁移壳不再硬失败）；错误结构化（`ArticleError`，按 kind 聚合）；门禁失败永久跳过（内容不合格的 URL 不无限重抓）；半成品黑洞修复（原文落盘即 markProcessed，翻译失败靠 batch-translate 补）；audit 准入加门禁（新源 dry-run-only → active 的自动化标准）。**新源接入只需改 `sources.json` + `npm run audit:source` 验证，无须改代码**（除非超出 rss/sitemap/listing/api 四发现通道或需全新提取启发式）。

2026-08-09 至 08-12 的逐站审计与 URL 边界核验结论已全部沉淀进本表各来源行（含 Z.ai / Moonshot、腾讯/阿里、Google Security/Meta Engineering/GitHub Engineering 探索，以及 08-12 来源质量审查）。审计明细曾存于 `docs/sources/`，已随结论沉淀删除，git 历史可查。
发现、官方中文、图片和翻译分块的 V2 设计与启用门槛见 [`docs/update-pipeline-v2.md`](update-pipeline-v2.md)。

## 暂缓 / 不纳入

2026-08-28 项目定位变更（专注 AI 公司 + 个人作者，放弃偏工程且文章量巨大的站点），以下来源移出收录范围：

| ID | 原状态 | 放弃原因 |
| --- | --- | --- |
| `cloudflare` | 已适配→放弃 | Engineering / Infrastructure 方向，发现量 ~3577 篇；配置、存量文章（D1 6 篇 + 本地 corpus）、收集册展示已全部清理 |
| `simon-willison` | 已适配→放弃 | 2026-08-28 用户指令：文章量过大（清点 ~4000+ 篇）不匹配站点定位；配置、backfill policy、存量文章（D1 6 篇 + 本地 corpus）、收集册展示已全部清理 |
| `hugging-face` | 已适配→放弃 | 2026-08-28 用户指令：官方全量池 ~700+ 篇且增量快，文章量过大；配置、backfill policy、收集册展示已清理（D1 无存量） |
| `meta-engineering` | 已适配→放弃 | Large-scale Engineering 方向，发现量 ~1084 篇；配置与收集册展示已清理（D1 无存量） |
| `google-research` | 已适配→放弃 | AI/ML Research 但量大且混 HCI 等非 AI 主题；配置与收集册展示已清理（D1 无存量） |
| `trail-of-bits` | 计划中→划掉 | Security / Program Analysis，纯工程方向，与新定位不符 |
| `tailscale` | 计划中→划掉 | Networking / Zero Trust，纯工程方向，与新定位不符 |
| `fly-io` | 计划中→划掉 | Distributed Systems / Infrastructure，纯工程方向，与新定位不符 |
| `datadog-engineering` | 计划中→划掉 | Observability / Infrastructure，纯工程方向，与新定位不符 |
| `mozilla-hacks` | 计划中→划掉 | Web Platform，纯工程方向，与新定位不符 |

保留说明：`github-engineering` / `google-security` 文章量小，不适用"量大工程源"排除标准，继续保留；`julia-evans` / `mitchell-hashimoto` 属个人作者，保留计划。

## 已移除源（拉黑 / tombstone）

> **唯一权威表**。移除一个源不再是"删 sources.json 条目、指望它不再被碰"，而是一等可复用操作：`npm run block:source` 登记 → `loadSources` 咽喉点拦截。机制实现见 AGENTS.md「已移除源的拉黑机制（tombstone）」与 `scripts/update/blocked-sources.ts`。

| ID | 拉黑域 | 拉黑日 | URL 留痕数 | 原因 |
| --- | --- | --- | ---: | --- |
| `cloudflare` | blog.cloudflare.com | 2026-08-28 | 75 | 纯工程/基础设施，发现量 ~3577 |
| `google-research` | research.google | 2026-08-28 | 100 | 量大且混 HCI 等非 AI 主题 |
| `meta-engineering` | engineering.fb.com | 2026-08-28 | 343 | Large-scale Engineering，~1084 |
| `hugging-face` | huggingface.co | 2026-08-28 | 250 | 官方全量池 ~700+ 且增量快，量过大 |
| `simon-willison` | simonwillison.net | 2026-08-28 | 700 | 文章量过大（清点 ~4000+），不匹配定位 |
| `paul-graham` | paulgraham.com | 2026-08-28 | 1 | 无机器可读发布日期，结构性不适配（2026-09-04 连 `demo:true` 展示条目一并下掉，书架不再占位）→ **2026-09-05 解除拉黑回归**（新日期政策：收录日兜底；blocked-sources 条目已删，账本留痕；上方适配表已恢复） |
| `tencent-cloud` | cloud.tencent.com | 2026-09-02 | 0 | 巨大 UGC 社区（官方团队 + 第三方 + 媒体转载混排），边界太差，无法建立干净技术索引；sources.json / blogs-static 展示条目已清理 |

合计 **1469** 条 URL，账本见 `src/data/blocked-urls.json`（append-only 决策留痕，解除拉黑也不删）。

**拦截语义**：只要某源的 id 或域名（含子域/父域/`extra_domains` 双向相交）命中 `src/data/blocked-sources.json`，`loadSources` 直接抛 `Blocked source violation` **拒绝加载整份源配置**——update/backfill/census/audit 四个抓取驱动入口全部经它，故结构上不可能再发现或抓取被拉黑源。这是刻意的"停摆好过偷偷重抓"取舍。

**解除拉黑（三者缺一不可）**：① 从 `blocked-sources.json` 的 `blocked[]` 删条目（`blocked-urls.json` 账本保留）；② 本表把该源移回上方适配表并写明重新纳入理由；③ 跑 `npm run test:update`（其"拉黑域与现存源零冲突"断言会先确认不误伤）。

**口径与红线**：
- **只拉黑"曾进入 `sources.json`"的源**。从未登记的候选（trail-of-bits / tailscale / fly-io / datadog-engineering / mozilla-hacks）不拉黑——没有 URL 留痕可记，且"重新纳入候选"是合法决策，不该被硬门禁挡住。
- **改名遗迹绝不是移除源**：`kimi→moonshot`（migration 0006）、`keli-wen→lastwhisper`（0008）、`glm→z-ai`。拉黑 `kimi.com` 会撞上活跃 moonshot 域名 → 每次 `npm run update` 全停。smoke 测试已加断言禁止这三个旧 id 出现在拉黑名单。
- **拉黑域必须与原 `source.domain` 完全同形**，禁止归并到注册域（现存最宽域如 `microsoft.com` 是未来地雷：若误把子域归并到 `microsoft.com` 拉黑，会连累所有 `*.microsoft.com` 活跃源）。

### 移除一个源的标准流程（供未来复用）

1. `npm run block:source -- --source <id> [--domain <host>] --reason "<why>"` 预演，核对 URL 计数与"零冲突"；
2. 追加 `--apply` 落盘（自动写两 JSON + 删 `src/content/articles/<id>/` 并先备份到 `logs/blocked-backup/`；**绝不碰 `.corpus-archive/` 与远程 D1**）；
3. 手工：删 `src/content/blogs/<id>.md`（demo 展示条目除外）→ `npx tsx scripts/generate-blogs-static.ts` → 确认 `sources.json` 已无该条目 → 清 `backfill.ts` WAVES / `backfill-policy.ts` 残留 → 更新本表；
4. `npm run block:source -- --verify` + `npm run test:update` + `npm run build`（`dist/server/entry.mjs` 体积必须不变，证明 blocked-*.json 未进 Worker bundle）。

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
- 为 Hugging Face 增加 org 投稿过滤落地（源已于 2026-08-28 移除，条目作废）。
- [作废 2026-09-02] 腾讯云正文 `__NEXT_DATA__` JSON 提取适配（源已移除拉黑，条目作废）。
- Z.ai 暂不建设正文提取器：缺少官方可枚举入口（2026-09-02 复核仍无列表/sitemap 收录，单篇正文硬编码 JS chunk），保持 dry-run-only；来源边界核验见适配表 z-ai 行。
- [脚手架完成] 处理 `src`、`srcset`、`data-src`、`data-lazy-src`、`data-original` 等图片地址并保留原链。
- [脚手架完成] 翻译前保护链接和图片 URL，翻译后严格校验并原样恢复。
- [已完成] 增加来源自动审计命令，输出各发现入口与三篇样本报告。
- 增加有界并发、按域名限速和失败重试。
- [已完成 2026-09-05] data-URI 图片剥离（`scripts/update/markdown-sanitize.ts`，Node normalizeArticleMarkdown + Worker extractor 双路径接入）：Quarto 系站点 base64 内联图不再进内容库/D1/构建产物（labonne 根治）。
- [已完成 2026-09-05] 源级 `date_fallback: conservative` 日期口径（types/config/fetch/fetch-backend/worker 链路）：只信机器可读日期、跳过 heading/可见正文启发式（wolfram 正文年份误取根治）。
- [已完成 2026-09-05] `resolvePublishedAt` 增加 `meta[name="dcterms.date"]` 候选（Quarto 站点真实发表日，避免被 sitemap lastmod 遮蔽）。
- [已完成 2026-09-05] `url_date_pattern` 月份捕获组支持 1-12 数字（mindhacks 镜像文件名 `_YYYY_MM_DD_`）。
- [已完成 2026-09-05] parseListing 闭合标签容忍 `</a` 与 `>` 之间的空白（mindhacks 镜像 105/124 锚点跨行书写）；wp-login/wp-admin/xmlrpc 入全局 NON_ARTICLE_PATHS；discovery fetchText 网络级失败（"fetch failed"）也回退 curl。
- [待办] 质量模型 v4 优化（2026-09-05 评估结论：保留模型，与长度门互补而非替代）。2×2 实测（本地全量 2474 篇原文）：长度门独有拦截 121 篇（短垃圾），模型独有拦截 687 篇（长垃圾：microsoft-research 235 / langchain 147 / google-deepmind 89 / openai 81，及 Cursor 中长公告——1600-2400 CJK 过了 1500 线、靠模型 0.85-0.99 拦截）；两道门都放行的 1534 篇抽样多为真文章（karpathy 等）。只留字数门 → 长公告/软文大批漏进。优化方向：补中文标签重训（金标集中文仅 130/904 是中文失明主因）、长度归一特征（长文盲区）、阈值维持 0.67（0.35 会误杀 karpathy 好文）。
- [已完成 2026-09-05] 双语源门禁顺序反转（用户决策）：prefer_official_zh 源（cursor/qwen/openai 等 5 源）改为**英文母语原文作为主实体**——抓英文原文 → 质量门禁对英文跑（模型以英文语料为主训练，顺带绕开中文训练偏斜）→ 通过后官方中文版直接落 zh 语言版本（provenance=official-zh，跳过模型翻译，分类走中文 passthrough）。**英文原文照常入库**（此前中文版会整个替换原文、英文被丢弃，门禁只能评中文）。runner / backfill / worker 抓取路径三处同口径；JSON-API 源（zh_lang 直通）保留旧语义。
- [待办] query-permalink 源支持：全站文章 URL 为 `/?p=N` 查询串形态（macshuo/mactalk）被 `isLikelyArticleUrl` pathname 假设结构性拒绝，需 slug 派生与去重适配才能收录。
- [已完成 2026-09-05] 原文长度前置硬门禁（用户决策：**长度不过关不进质量评分模型**；阈值由生产语料调研反推，非拍脑袋）：EN **300 词**（≈全库 p5=296，拦占位/Circuits 周更清单/微型公告/论文摘要桩，将拒 5%）；ZH **1500 CJK 字符**（拦 Cursor 公告主体 44/79 与 9 篇 CJK≈0 抓取噪声，将拒 42.6%；2000 起误杀 Qwen2-VL/QwQ 等有货发布稿）。`scripts/update/length-gate.ts` 纯函数，接线 runner（IntegrityGateError 永久拒绝 + 负缓存）、backfill、quality-scan-local（仅原文版本前置，verdict modelVersion=length-gate@1）；源级豁免 `length_gate: "off"`。调研佐证：质量模型系统性偏爱短文（短公告 qMed 0.13-0.35 vs 全库中位 0.033，en<500 词集合 91% 会被模型放过），前置长度门必要。
- [待办] 清理 5 篇 17 词 "Demo placeholder" 占位存量（anthropic/claude-for-nonprofits、anthropic/improving-fable-5-s-biology-safeguards、anthropic/tino-cuellar、openai/hsp-gruppe、openai/openai-and-apa-partner-to-advance-responsible-ai）——长度门上线后增量不再产生，存量另行删除；hamel FAQ（27 篇 99-519 词短答）会被长度门拒，若要保留配 `length_gate: "off"`（其质量分 qMed=0.010 在现有模型下也难过关，属可接受误伤）。
- [已完成 2026-09-05] 展示层日期诚实性（用户拍板：**无发表日期显示"无"，翻译日期照常**，不用"收录于"方案）：`articles.published_at_source` 列（migration 0012）+ 全链路 plumbing（RawArticle/ArticleRecord → 文件 frontmatter → import-local-articles 载荷 → content-sync upsert → SSR 三查询），文章页 meta、相关阅读、列表行、搜索的日期位对 'ingested' 文章显示"无"（en 页 N/A）；存量行 NULL 语义 = 真实发表日，不受影响。
- [待办] Substack 二期源（zvi/gary-marcus/convivial-society/acx）首审计通过后转 active；Sivers/阳志平形态特殊需人工复核样本。
