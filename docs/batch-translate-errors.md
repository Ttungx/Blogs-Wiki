# 批量翻译错误记录

## 2026-08-12T10:47:00.451Z（lilian-weng · concurrency=2）

- 本次翻译：成功 0 / 失败 2

- `lilian-weng/active-learning | https://lilianweng.github.io/posts/2022-02-20-active-learning: translate failed for https://lilianweng.github.io/posts/2022-02-20-active-learning (model: step-3.7-flash): restore failed: token {{BW:inline-math:15}} (inline-math) appears 0 times, expected exactly 1`
- `lilian-weng/adv-attack-llm | https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm: translate failed for https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm (model: step-3.7-flash): translate request failed (https://api.stepfun.com/step_plan/v1/chat/completions): The operation was aborted due to timeout (timed out after 300000ms)`

---

## 2026-08-12T10:51:51.603Z（lilian-weng · concurrency=2）

- 本次翻译：成功 0 / 失败 2

- `lilian-weng/adv-attack-llm | https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm: translate failed for https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm (model: step-3.7-flash): translate response has no message content (https://api.stepfun.com/step_plan/v1/chat/completions, HTTP 200): {"id":"f2bd1db6f423ac8e8b3286268cb5229e.19a2d894775c3a5227f84bf6b2e8938f","object":"chat.completion","created":1786531789,"model":"step-3.7-flash","choices":[{"index":0,"message":{"role":"assistant","content":"","reasoning":"用户现在需要把这篇关于LLM对抗性攻击的英文博客翻译成简体中文，还要保留Markdown结构，术语要按要求保留英文，比如RLHF、GBDA这些，还有专有名词，然后分类要选对。首先先处理标题，original_title是\"Adversarial Attacks on LLMs\"，翻译成“大语言模型的对抗性攻击”？对，准确。然后分类的话，这篇讲的是AI里的对抗攻击，还有Agent？不，主要是AI，还有Research？哦对，是AI和Research，可能还有Engineering/Infrastructure？不过先看内容，主要是AI领域的对…`
- `lilian-weng/active-learning | https://lilianweng.github.io/posts/2022-02-20-active-learning: translate failed for https://lilianweng.github.io/posts/2022-02-20-active-learning (model: step-3.7-flash): translate response has no message content (https://api.stepfun.com/step_plan/v1/chat/completions, HTTP 200): {"id":"51466bd5ada08d960b742e1e1de852fe.30a89064631edc68d4736541d21396f3","object":"chat.completion","created":1786531789,"model":"step-3.7-flash","choices":[{"index":0,"message":{"role":"assistant","content":"","reasoning":"用户现在需要翻译这篇关于主动学习的英文文章成简体中文，还要保留Markdown结构，专业术语按要求保留英文，然后分类。首先先处理标题，原标题是\"Learning with not Enough Data Part 2: Active Learning\"，翻译成《数据不足时的学习第二部分：主动学习》？对，要准确。然后内容部分，首先开头的引言，要通顺，专业术语比如active learning保留英文？不，等下规则说领域术语如果标准的话保留英文？哦对，主动学习的标准术语是active learning？等下看规则：“Keep domain te…`

---

## 2026-08-12T13:18:38.468Z（hamel-husain · concurrency=4）

- 本次翻译：成功 0 / 失败 1

- `hamel-husain/course | https://hamel.dev/blog/posts/course: translate failed for https://hamel.dev/blog/posts/course (model: opencode-free/deepseek-v4-flash-free): translate request failed (https://api.stepfun.com/step_plan/v1/chat/completions): HTTP 404 Not Found — {"error":{"message":"The model \"opencode-free/deepseek-v4-flash-free\" does not exist or you do not have access to it.","type":"model_invalid"}}`

---

## 2026-08-12T13:32:54.935Z（hamel-husain · concurrency=4）

- 本次翻译：成功 0 / 失败 1

- `hamel-husain/drift | https://hamel.dev/blog/posts/drift: translate failed for https://hamel.dev/blog/posts/drift (model: deepseek-v4-flash): translate response has no message content (https://opencode.ai/zen/go/v1/chat/completions, HTTP 200): {"id":"8ed582c1-0c60-43a0-b7bf-b650e1ba6db2","object":"chat.completion","created":1786541461,"model":"deepseek-v4-flash","choices":[{"index":0,"finish_reason":"length","logprobs":null,"message":{"role":"assistant","content":"","reasoning_content":"We need to translate the article into Simplified Chinese, preserving Markdown structure exactly, with links, images, code blocks, etc. The content has placeholders like {{BW:url:1}}, {{BW:inline-code:8}}X etc. These are presumably special tokens that s…`

---

## 2026-09-02T07:49:37.946Z（mistral-ai · concurrency=2）

- 本次翻译：成功 4 / 失败 1

- `mistral-ai/agentic-search | https://mistral.ai/news/agentic-search: translate failed for https://mistral.ai/news/agentic-search (model: gemini-3.5-flash-lite): translate request failed (https://generativelanguage.googleapis.com/v1beta/openai/chat/completions): HTTP 400  — [{
  "error": {
    "code": 400,
    "message": "User location is not supported for the API use.",
    "status": "FAILED_PRECONDITION"
  }
}
]`

---

## 2026-09-02T07:53:12.888Z（sebastian-raschka · concurrency=2）

- 本次翻译：成功 4 / 失败 1

- `sebastian-raschka/controlling-reasoning-effort-in-llms | https://magazine.sebastianraschka.com/p/controlling-reasoning-effort-in-llms: translate failed for https://magazine.sebastianraschka.com/p/controlling-reasoning-effort-in-llms (model: gemini-3.5-flash-lite): translate request failed (https://generativelanguage.googleapis.com/v1beta/openai/chat/completions): HTTP 400  — [{
  "error": {
    "code": 400,
    "message": "User location is not supported for the API use.",
    "status": "FAILED_PRECONDITION"
  }
}
]`

---

## 2026-09-04T09:57:04.430Z（all sources · concurrency=2）

- 本次翻译：成功 23 / 失败 10

- `langchain/deep-agents-0-6 | https://www.langchain.com/blog/deep-agents-0-6: translate failed for https://www.langchain.com/blog/deep-agents-0-6 (model: gemini-3.5-flash-lite): link integrity failed: source has 19 inline-code span(s), translated has 20`
- `anthropic/introducing-anthropic-science | https://www.anthropic.com/research/introducing-anthropic-science: translate failed for https://www.anthropic.com/research/introducing-anthropic-science (model: gemini-3.5-flash-lite): translate request failed (https://generativelanguage.googleapis.com/v1beta/openai/chat/completions): HTTP 503  — [{
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}
]`
- `anthropic/anthropic-economic-index-january-2026-report | https://www.anthropic.com/research/anthropic-economic-index-january-2026-report: translate failed for https://www.anthropic.com/research/anthropic-economic-index-january-2026-report (model: gemini-3.5-flash-lite): restore failed: token {{BW:url:87}} (url) appears 0 times, expected exactly 1`
- `anthropic/claude-code-best-practices | https://www.anthropic.com/engineering/claude-code-best-practices: translate failed for https://www.anthropic.com/engineering/claude-code-best-practices (model: gemini-3.5-flash-lite): link integrity failed: inline-code span 27 was altered in translation`
- `langchain/langchain-x-context-building-better-chat-products-with-u | https://www.langchain.com/blog/langchain-x-context-building-better-chat-products-with-user-analytics: translate failed for https://www.langchain.com/blog/langchain-x-context-building-better-chat-products-with-user-analytics (model: gemini-3.5-flash-lite): link integrity failed at index 0: expected https://python.langchain.com/docs/modules/callbacks/integrations/context?ref=blog.langchain.com, got https://getcontext.ai/?ref=blog.langchain.com`
- `langchain/qdrant-x-langchain-endgame-performance | https://www.langchain.com/blog/qdrant-x-langchain-endgame-performance: translate failed for https://www.langchain.com/blog/qdrant-x-langchain-endgame-performance (model: gemini-3.5-flash-lite): link integrity failed: source has 0 inline-code span(s), translated has 2`
- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: translate failed for https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions (model: gemini-3.5-flash-lite): link integrity failed: source has 8 link(s), translated has 11`
- `google-deepmind/deepminds-latest-research-at-iclr-2022 | https://deepmind.google/blog/deepminds-latest-research-at-iclr-2022: translate failed for https://deepmind.google/blog/deepminds-latest-research-at-iclr-2022 (model: gemini-3.5-flash-lite): link integrity failed at index 1: expected https://openreview.net/forum?id=b-ny3x071E5, got https://blog.iclr.cc/2022/04/20/announcing-the-iclr-2022-outstanding-paper-award-recipients/`
- `microsoft-research/microsoft-at-nsdi-2023-a-commitment-to-advancing-network | https://www.microsoft.com/en-us/research/blog/microsoft-at-nsdi-2023-a-commitment-to-advancing-networking-and-distributed-systems: translate failed for https://www.microsoft.com/en-us/research/blog/microsoft-at-nsdi-2023-a-commitment-to-advancing-networking-and-distributed-systems (model: gemini-3.5-flash-lite): link integrity failed at translated index 3 (link): polluted destination https://www.usenix.org/conference/nsdi23#sponsorship)，微软一直是开发创新网络技术的领导者，我们很自豪今年有`
- `microsoft-research/microsoft-research-2019-reflection-a-year-of-progress-on | https://www.microsoft.com/en-us/research/blog/microsoft-research-2019-reflection-a-year-of-progress-on-technologys-toughest-challenges: translate failed for https://www.microsoft.com/en-us/research/blog/microsoft-research-2019-reflection-a-year-of-progress-on-technologys-toughest-challenges (model: gemini-3.5-flash-lite): restore failed: token {{BW:url:12}} (url) appears 2 times, expected exactly 1`

---

## 2026-09-04T10:04:56.364Z（all sources · concurrency=2）

- 本次翻译：成功 7 / 失败 3

- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: translate failed for https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions (model: gemini-3.5-flash-lite): link integrity failed: source has 8 link(s), translated has 11`
- `langchain/qdrant-x-langchain-endgame-performance | https://www.langchain.com/blog/qdrant-x-langchain-endgame-performance: translate failed for https://www.langchain.com/blog/qdrant-x-langchain-endgame-performance (model: gemini-3.5-flash-lite): link integrity failed: source has 0 inline-code span(s), translated has 4`
- `microsoft-research/microsoft-at-nsdi-2023-a-commitment-to-advancing-network | https://www.microsoft.com/en-us/research/blog/microsoft-at-nsdi-2023-a-commitment-to-advancing-networking-and-distributed-systems: translate failed for https://www.microsoft.com/en-us/research/blog/microsoft-at-nsdi-2023-a-commitment-to-advancing-networking-and-distributed-systems (model: gemini-3.5-flash-lite): link integrity failed at translated index 3 (link): polluted destination https://www.usenix.org/conference/nsdi23#sponsorship)，微软一直是开发创新网络技术的领导者，我们很自豪今年有`

---

## 2026-09-04T10:29:59.406Z（all sources · concurrency=2）

- 本次翻译：成功 2 / 失败 1

- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: translate failed for https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions (model: gemini-3.5-flash-lite): link integrity failed: source has 8 link(s), translated has 11`

---

## 2026-09-04T10:35:23.455Z（all sources · concurrency=2）

- 本次翻译：成功 0 / 失败 1

- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: link integrity failed: source has 8 link(s), translated has 11`

---

## 2026-09-04T10:44:43.537Z（all sources · concurrency=2）

- 本次翻译：成功 0 / 失败 1

- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: translate failed for https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions (model: gemini-3.5-flash-lite): link integrity failed: source has 8 link(s), translated has 11`

---

## 2026-09-04T10:46:04.975Z（all sources · concurrency=2）

- 本次翻译：成功 0 / 失败 1

- `langchain/incorporating-domain-specific-knowledge-in-sql-llm-solut | https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions: translate failed for https://www.langchain.com/blog/incorporating-domain-specific-knowledge-in-sql-llm-solutions (model: gemini-3.5-flash-lite): link integrity failed: source has 8 link(s), translated has 11`
