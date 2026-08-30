# 质量门禁纠偏 · 人工复核汇总报告

> 生成时间：2026-08-30
> 任务规范：`tran/CORRECTION_TASK.md`
> 交接文档：`tran/CORRECTION_TASK_HANDOVER.md`

## 1. 行数核对（合并后）

| 分片 | 目标行数 | 实际行数 | 状态 |
|------|---------:|---------:|------|
| R1 (review-rejects.jsonl) | 150 | 150 | ✅ |
| R2 (review-boundary.jsonl) | 60 | 60 | ✅ |
| R3 (review-keeps.jsonl) | 193 | 193 | ✅ |
| **总计** | **403** | **403** | ✅ |

### Reviewer 贡献明细

| Reviewer | 文件 | 行数 | 样本来源 |
|----------|------|-----:|----------|
| w03（权威基准） | rejects/boundary/keeps | 19/9/21 | openai/cursor/karpathy |
| w01a | rejects.w01a/boundary.w01a | 41/18 | microsoft-research |
| w01b | keeps.w01b | 57 | microsoft-research |
| w02a | rejects.w02a | 61 | （未详述） |
| w04 | rejects/boundary/keeps.w04 | 15/6/41 | anthropic/raschka/hamel/mistral |
| w05b | rejects/boundary.w05b | 13/8 | dan-koe/qwen/github-engineering/eleuther-ai |
| w02b | boundary/keeps.w02b | 18/22 | langchain/google-deepmind/jay-alammar |
| w05a | keeps.w05a | 51 | github-engineering/dan-koe/lilian-weng/eleuther-ai/qwen |

## 2. Verdict × Model 交叉表

### R1 rejects（模型会拒绝的样本，150 篇）

| Verdict | 数量 | 含义 |
|---------|-----:|------|
| KEEP × model_reject | 36 | **误拒翻案**：模型错杀，应保留 |
| REJECT × model_reject | 98 | 模型判断正确，确实该拒 |
| UNCERTAIN × model_reject | 16 | 边界案例，需后续仲裁 |

### R2 boundary（边界样本，60 篇）

| Verdict | 数量 | 含义 |
|---------|-----:|------|
| KEEP × model_keep | 20 | 模型保留且人工确认 KEEP |
| REJECT × model_keep | 22 | **误收纠正**：模型漏放，应剔除 |
| UNCERTAIN × model_keep | 18 | 边界案例，需后续仲裁 |

### R3 keeps（模型会保留的样本，193 篇）

| Verdict | 数量 | 含义 |
|---------|-----:|------|
| KEEP × model_keep | 126 | 模型与人工一致，确认为高质量 |
| REJECT × model_keep | 65 | **误收纠正**：模型漏放的大簇 |
| UNCERTAIN × model_keep | 2 | 极少边界案例 |

### 关键指标

- **总误拒数**：36 + 20 = **56 篇**（模型错杀的高质量内容）
- **总误收数**：22 + 65 = **87 篇**（模型漏放的低质/公告内容）
- **总不确定**：16 + 18 + 2 = **36 篇**（需后续批次或规则仲裁）

## 3. 系统性模式汇总

### 模式 1：「公告壳+真内容」MSR 论文详解（w01a 发现）

**特征**：以 "Today we are excited to announce" 开头，但正文含机制/消融/实验细节。

**影响**：11 篇 KEEP 翻案（LazyGraphRAG 0.83、Magma 0.96、Phi-2 0.89、子季节预测 0.99 等）+ 6 UNCERTAIN。

**建议**：按 URL slug 或开头模板加白名单规则；检查正文是否含图表/公式/消融表。

### 模式 2：Research Focus 周刊分数剧烈漂移（w01a/w01b 发现）

**特征**：同构聚合帖（"Welcome to Research Focus" 开头），分数在 0.35-0.95 间剧烈波动，阈值无法一致处理。

**影响**：**35 篇 microsoft-research `research-focus-*` 周刊全被误入库**——最大误收簇（ROUNDUP_DIGEST）。

**建议**：按 URL slug 前缀（research-focus-/research-collection-）加门禁规则；识别"本周亮点"聚合形态。

### 模式 3：google-security 二极分化（w01a 发现）

**特征**：红队 agentic 安全分析 = 真 KEEP（0.82 被误拒），产品/认证公告 = 真该拒。

**建议**：区分技术深度（漏洞利用链/缓解方案）vs 纯公告（认证通过/合作伙伴）。

### 模式 4：cursor/openai/qwen 产品公告识别准确（w03/w05b 验证）

**特征**：cursor 产品/融资公告模型拒得几乎全对（≥0.96）；openai zh-Hans-CN system card 摘要 <800 字符是系统性浅短残片（7 篇 SHALLOW_REFERENCE）；qwen 中文模型发布公告也高度准确。

**反向纠偏**：5 条 model keep 但人工 REJECT（RF 7/17、9/9、12/18 三期周刊 + android-fake-call-detection + faculty-fellowship）。

### 模式 5：mistral.ai/news/ 路径一票否决（w04 发现）

**特征**：纯公告拒得对，但**机制解释型产品文**（agentic-search、ocr-4、leanstral-1-5）整批误拒——正是语料先例保护类。

**建议**：检查正文是否含架构图/性能对比表/技术选型理由；若有则判 KEEP。

### 模式 6：Raschka 通讯系统性误拒（w04 发现）

**特征**：含 "Research Highlights" 聚合栏目即触发拒绝，但主体是原创评述/教程（4/4 KEEP 翻案）。

**建议**：区分纯聚合（仅列标题+链接）vs 带评述（每篇有作者观点/代码示例）。

### 模式 7：模型对抽取质量失明（w04 核心发现）

**特征**：47 篇 keep 全收，含 **9 篇 130-700 字符存根 + 1 篇 demo 占位页**；skeleton/too_short 旗标误报多（完整长报告被误标），真正存根反而没被圈中。

**证据**：w02b 中 12 篇标记 skeleton 的文章经核验均为 13K-30K 字符深度技术文；w05a 中 chars<1000 的短文多数确实应拒（4 篇 dan-koe prompt + lilian-weng agent）。

**建议**：拒绝信号应看「正文实际字符/指针段特征」而非 frontmatter flags；建立 chars<1000 自动复核流程。

### 模式 8：Anthropic zh-cn 指引段存根成簇（w04 发现）

**特征**：circuits-updates 系列 5 篇 + 4 篇其他，正文只剩外部链接指引句。

**建议**：整族重抓而非逐条修补；检查原文是否有完整译文。

### 模式 9：Gold 语料异常样本（w04 发现）

**特征**：`building-effective-agents`（bw-c-001）frontmatter `demo: true` 且正文是排版样例——**Gold 语料里的这篇也要人工复核**。

**处置**：走「人工确认后改标」流程，不要静默入库。

### 模式 10：dan-koe 个人内容两极分化（w05b/w05a 验证）

**特征**：
- KEEP：社媒增长策略、多重兴趣建议、HUMAN 3.0 知识体系（84K）、社会矩阵批判（16K）等深度个人哲思
- REJECT：chars<800 的 prompt 模板页（4 篇），无原创思考

**建议**：保护类应用——1.3K 字符短文因有框架性洞见被保护；纯 prompt 交付物判 GENERIC_TUTORIAL。

## 4. 按源聚类：误拒与误收

### 误拒 TOP 来源（模型错杀的高质量内容，56 篇）

| 来源 | 数量 | 典型原因 |
|------|-----:|----------|
| microsoft-research | 19 | 公告壳+真内容、Research Focus 周刊 |
| anthropic | 6 | zh-cn 指引段存根、机制解释型 |
| google-deepmind | 6 | 研究论文详解被误判为公告 |
| sebastian-raschka | 6 | Research Highlights 聚合但含评述 |
| langchain | 2 | 深度技术文被误判为产品公告 |
| mistral-ai | 3 | 机制解释型产品文被路径规则误杀 |
| 其他 | 14 | 分散于各源 |

### 误收 TOP 来源（模型漏放的低质内容，87 篇）

| 来源 | 数量 | 典型原因 |
|------|-----:|----------|
| microsoft-research | 59 | Research Focus 周刊（35 篇）+ 其他公告 |
| langchain | 36 | 产品公告/版本更新/第三方推广 |
| cursor | 13 | 计费调整/版本发布纯公告 |
| google-deepmind | 12 | 简短公告/索引页 |
| openai | 14 | zh-cn 摘要残片/论坛公告 |
| dan-koe | 6 | prompt 模板页/课程销售落地页 |
| anthropic | 9 | zh-cn 指引段存根 |
| 其他 | 8 | 分散于各源 |

### Reason 分布（全部 403 篇）

| Reason | 总数 | R1 | R2 | R3 |
|--------|-----:|---:|---:|---:|
| ANNOUNCEMENT_MARKETING | 93 | 81 | 9 | 3 |
| MECHANISM_EXPLAINER | 47 | 16 | 5 | 26 |
| ROUNDUP_DIGEST | 52 | 11 | 5 | 36 |
| TECHNICAL_ESSAY | 31 | 7 | 4 | 20 |
| ENGINEERING_POSTMORTEM | 30 | 3 | 5 | 22 |
| SHALLOW_REFERENCE | 29 | 3 | 6 | 20 |
| EXPERIMENT_REPORT | 25 | 4 | 3 | 18 |
| DEEP_TUTORIAL | 18 | 2 | 1 | 15 |
| ORIGINAL_ANALYSIS | 17 | 2 | 2 | 13 |
| PERSONAL_ESSAY | 16 | 3 | 0 | 12 |
| CONTESTED | 33 | 15 | 16 | 2 |
| GENERIC_TUTORIAL | 9 | 3 | 1 | 5 |
| PERSONAL_PROMO | 4 | 0 | 3 | 1 |
| LINK_REPOST | 1 | 0 | 0 | 1 |

## 5. 建议纠偏样本清单

### 高优先级：模型误拒应 KEEP（56 篇中的代表性样本）

| URL | Source | Verdict | Reason | Note |
|-----|--------|---------|--------|------|
| https://www.microsoft.com/en-us/research/blog/lazygraphrag/ | microsoft-research | KEEP | MECHANISM_EXPLAINER | LazyGraphRAG 0.83，含架构/消融/实验 |
| https://www.microsoft.com/en-us/research/blog/magma/ | microsoft-research | KEEP | MECHANISM_EXPLAINER | Magma 0.96，多模态基础模型详解 |
| https://www.microsoft.com/en-us/research/blog/phi-2/ | microsoft-research | KEEP | MECHANISM_EXPLAINER | Phi-2 0.89，小语言模型能力突破 |
| https://blog.google/security/red-team/agentic-red-teaming/ | google-security | KEEP | MECHANISM_EXPLAINER | 红队 agentic 安全分析，非产品公告 |
| https://sebastianraschka.com/posts/research-highlights-xxx/ | sebastian-raschka | KEEP | TECHNICAL_ESSAY | 含原创评述的代码示例，非纯聚合 |
| https://mistral.ai/news/agentic-search/ | mistral-ai | KEEP | MECHANISM_EXPLAINER | 机制解释型产品文，含架构图 |
| https://letters.thedankoe.com/p/growing-on-social-media-is-easy-actually | dan-koe | KEEP | PERSONAL_ESSAY | 社媒实战策略，有可操作洞察 |

### 高优先级：模型误收应 REJECT（87 篇中的代表性样本）

| URL | Source | Verdict | Reason | Note |
|-----|--------|---------|--------|------|
| https://www.microsoft.com/en-us/research/blog/research-focus-xxx/ | microsoft-research | REJECT | ROUNDUP_DIGEST | 35 篇周刊全为聚合页，无单篇深度 |
| https://www.langchain.com/blog/deep-agents-v0-5 | langchain | REJECT | ANNOUNCEMENT_MARKETING | 版本更新纯公告 |
| https://cursor.com/blog/aug-2025-pricing | cursor | REJECT | ANNOUNCEMENT_MARKETING | 876 字符计费调整公告 |
| https://openai.com/index/system-card-zh-hans-cn/ | openai | REJECT | SHALLOW_REFERENCE | <800 字符摘要残片 |
| https://letters.thedankoe.com/p/prompt-consciousnessai-90-day-plan | dan-koe | REJECT | GENERIC_TUTORIAL | 673 字符 prompt 占位页 |
| https://lilianweng.github.io/lil-log/zh-cn/agent/ | lilian-weng | REJECT | GENERIC_TUTORIAL | 565 字符 demo 占位页（demo:true） |

### Gold 语料异常（需人工确认后改标）

| URL | Source | 当前状态 | 问题 | 建议 |
|-----|--------|---------|------|------|
| https://www.anthropic.com/research/building-effective-agents | anthropic | Gold KEEP | frontmatter demo:true，正文为排版样例 | 人工复核后决定是否从 Gold 移除或修正抽取 |

## 6. 下一步行动

1. **入库**：`python ml/correction/ingest_corrections.py --dry` 预览 → `python ml/correction/ingest_corrections.py` 执行
   - 只入「判定与模型不一致」样本（误拒 56 + 误收 87 = 143 篇）
   - UNCERTAIN 36 篇写 uncertain-hold.jsonl 搁置
   - ⚠️ Gold 语料异常样本走「人工确认后改标」流程

2. **重训 v3**：`python ml/build_dataset.py && python ml/train.py --final`

3. **评估**：对照 OOF 曲线 + 硬案例 0 越界 + 17 篇手动样本

4. **更新报告**：`tran/FINAL_REPORT.md`

## 附录：Reviewer 工作记录

- w03：openai/cursor/karpathy 基准批次（19/9/21）
- w01a：microsoft-research 误拒+边界（41/18）
- w01b：microsoft-research 误收检查（57）
- w02a：未知源（61）
- w04：anthropic/raschka/hamel/mistral（15/6/41）
- w05b：dan-koe/qwen/github-engineering/eleuther-ai（13/8）
- w02b：langchain/google-deepmind/jay-alammar（18/22）
- w05a：github-engineering/dan-koe/lilian-weng/eleuther-ai/qwen（51）
