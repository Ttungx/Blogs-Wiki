# mistral-ai URL 边界检查（2026-08-10）

抓取入口：`https://mistral.ai/news/rss`（RSS，共 76 条；无 sitemap）。

## URL 形态

- 全部为 `https://mistral.ai/news/<slug>/`，一级 slug，无聚合页/无分页/无本地化重复。

## 判定：mixed（不可全收）

Feed 混三类：

1. **模型/API/工程深潜（技术内容，保留）**：Mistral 3、Small 4、Leanstral、OCR 3/4、Voxtral、Codestral 系列、Pixtral、NeMo、MathΣtral、Mixtral、Magistral、Saba、Batch/Moderation/Agents API、`debugging-memory-leak-in-vllm`、`llm-as-rag-judge`、`rails-testing-on-autopilot`、`physics-ai-research`、卫星影像微调、agentic-workflows。
2. **消费者/Studio 产品营销（排除）**：Le Chat 系列、Vibe 系列、Studio 功能发布（connectors/workflows/memory/prompts-skills/search-toolkit/mistral-code/forge/ai-studio/compute）。
3. **纯公司新闻（排除）**：融资（raises-1.7B）、峰会（AI Now Summit）、收购（Emmi）、合作（NVIDIA）、公益/环境声明、许可证（MNPL）、公司故事（My Tailor is Mistral、about-mistral-ai、AFP）。

## 建议

- `article_paths`: `["/news"]`（现状正确）
- `exclude_paths`（新增，按 slug）：
  - 纯公司/营销类：`manage-prompts-and-skills-in-studio`、`more-control-over-connectors`、`ai-now-summit-2026`、`vibe-agent`、`mistral-vibe-2-0`、`vibe-remote-agents-mistral-medium-3-5`、`accelerate-ai-native-industry`、`connectors`、`workflows`、`ki-fur-deutschland`、`ai-studio`、`mistral-ai-raises-1-7-b-to-accelerate-technological-progress-with-ai`、`memory`、`le-chat-mcp-connectors-memories`、`our-contribution-to-a-global-environmental-standard-for-ai`、`le-chat-dives-deep`、`ai-for-citizens`、`mistral-compute`、`mistral-code`、`all-new-le-chat`、`mistral-afp`、`mistral-chat`、`customization`、`2024-ft-hackathon`、`mistral-ai-non-production-license-mnpl`、`build-tweak-repeat`、`le-chat-mistral`、`about-mistral-ai`、`le-chat-enterprise`、`mistral-ai-and-nvidia-partner-to-accelerate-open-frontier-models`、`search-toolkit`、`forge`
  - 判据：含 open-weights 模型/API/基准/工程细节者保留；纯消费者 App 或公司事务排除。

## 证据

- RSS 标题/链接清单（76 条）：`https://mistral.ai/news/rss`
- 技术示例：`https://mistral.ai/news/debugging-memory-leak-in-vllm/`、`https://mistral.ai/news/llm-as-rag-judge/`
- 非技术示例：`https://mistral.ai/news/mistral-ai-raises-1-7-b-to-accelerate-technological-progress-with-ai/`、`https://mistral.ai/news/ai-now-summit-2026/`
