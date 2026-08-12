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
