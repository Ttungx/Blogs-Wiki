# URL 边界核验：google-deepmind（2026-08-10）

## 入口与 URL 形态

- RSS：`https://deepmind.google/blog/rss.xml` 可达，100 条，全部位于 `/blog/<kebab-slug>/`。
- Sitemap：`/blog/` 约 344 篇 + `/research/` 268 个 publications 数据库页（非文章，勿入 article_paths）。
- 结论：`article_paths=["/blog/"]`，`rss=blog/rss.xml`。`/research/` 是论文数据库页，不作为文章源。

## 内容判定：/blog/ 混入纯公告，约 18/100 非技术

明确非技术（合作/资助/政企/公益/项目启动），建议排除（18 条已逐条核对 RSS slug）：

```
/blog/accelerating-the-frontiers-of-scientific-discovery-googles-40m-commitment-to-the-genesis-mission/
/blog/our-approach-to-bioresilience/
/blog/empowering-indias-next-generation-of-innovators-with-atl-saathi/
/blog/google-deepmind-and-a24-announce-first-of-its-kind-research-partnership/
/blog/unlocking-uk-house-building-with-ai-accelerated-planning/
/blog/investing-in-multi-agent-ai-safety-research/
/blog/powering-the-future-of-robotics-in-europe/
/blog/measuring-the-impact-of-learning-with-ai-in-sierra-leone-and-beyond/
/blog/were-launching-the-google-deepmind-accelerator-program-in-asia-pacific-to-tackle-environmental-risks/
/blog/strengthening-singapores-ai-future-a-new-national-partnership/
/blog/announcing-our-partnership-with-the-republic-of-korea/
/blog/partnering-with-industry-leaders-to-accelerate-ai-transformation/
/blog/accelerating-discovery-in-india-through-ai-powered-science-and-education/
/blog/deepening-our-partnership-with-the-uk-ai-security-institute/
/blog/strengthening-our-partnership-with-the-uk-government-to-support-prosperity-and-security-in-the-ai-era/
/blog/google-deepmind-supports-us-department-of-energy-on-genesis/
/blog/were-expanding-our-presence-in-singapore-to-advance-ai-in-the-asia-pacific-region/
/blog/how-ai-is-giving-northern-ireland-teachers-time-back/
```

可模式化的 exclude 关键词：`partnership`、`partnering`、`investing`、`accelerator-program`、`bioresilience`、`atl-saathi`、`sierra-leone`、`northern-ireland`、`40m-commitment`、`uk-government`、`uk-ai-security`、`department-of-energy`、`singapore`、`republic-of-korea`、`expanding-our-presence`。

## 需主线程决策的灰色带（约 30/100 产品发布类）

`Introducing Gemini 3.x/Omni/Antigravity/Nano Banana/Project Genie/Lyria/Flow Music/Live Translate/computer use` 等模型与产品发布。按"产品发布应排除"的字面标准属于营销，但这些帖子含技术细节，且模型发布（Gemini/Gemma/Robotics）正是技术内容。关键字排除会误伤（如 `introducing-gemma-4-12b` vs `introducing-nano-banana-pro` 同前缀），建议：保留模型/研究发布，仅对纯消费产品（Nano Banana、Antigravity、Lyria、Flow Music、Project Genie、Live Translate、computer use、image verification）人工或按产品名排除。

## 建议

```json
{"article_paths": ["/blog/"], "rss": "https://deepmind.google/blog/rss.xml",
 "exclude_paths": [18 条列表或关键词模式]}
```
