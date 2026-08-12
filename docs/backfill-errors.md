# Backfill 原文抓取错误记录

> 权威台账：本文件汇总 2026-08-12 首轮 backfill 的最终错误（按源聚合，每条含错误类型、
> URL、详情）。历史逐次运行记录见 git 历史或各 `.tmp-backfill/errors-*.md`。

错误分类：fetch（网络/提取失败）、integrity（完整性门禁：内容过短、疑似导航列表、
placeholder 泄漏、图片 URL 非绝对、缺日期、缺标题、超出回填窗口）、fatal（源级失败）。

单篇失败即跳过该篇，不终止整源。

## anthropic

### 提示性警告（1）

-  [todo-marker] `https://www.anthropic.com/engineering/claude-code-auto-mode`: warn: 正文含 todo-marker 标记（提示性）

## cloudflare

### 提示性警告（4）

-  [todo-marker] `https://blog.cloudflare.com/ddos-threat-report-2026-h1`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://blog.cloudflare.com/bgp-origin-attribute`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://blog.cloudflare.com/optimizing-core-unit-boot-time`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://blog.cloudflare.com/attack-surface-intelligence`: warn: 正文含 todo-marker 标记（提示性）

## google-deepmind

### 阻塞错误（1）

- **fetch** `https://deepmind.google/blog/introducing-google-antigravity-2-0`
  - extractor: content too short (169 chars, minimum 200) for https://deepmind.google/blog/introducing-google-antigravity-2-0

## google-security

### 阻塞错误（4）

- **fetch** `https://blog.google/security/vrp`
  - extractor: content too short (13 chars, minimum 200) for https://blog.google/security/vrp
- **fetch** `https://blog.google/security/android-security`
  - extractor: content too short (13 chars, minimum 200) for https://blog.google/security/android-security
- **fetch** `https://blog.google/security/chrome-security`
  - extractor: content too short (13 chars, minimum 200) for https://blog.google/security/chrome-security
- **fetch** `https://blog.google/security/open-source-security`
  - extractor: content too short (13 chars, minimum 200) for https://blog.google/security/open-source-security

## hamel-husain

### 提示性警告（1）

-  [template-placeholder] `https://hamel.dev/blog/posts/llm-judge`: warn: 正文含 template-placeholder 标记（提示性）

## hugging-face

### 提示性警告（6）

-  [todo-marker] `https://huggingface.co/blog/delta-weight-sync`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://huggingface.co/blog/hf-skills-training-codex`: warn: 正文含 todo-marker 标记（提示性）
-  [template-placeholder] `https://huggingface.co/blog/aisheets-unlock-images`: warn: 正文含 template-placeholder 标记（提示性）
-  [template-placeholder] `https://huggingface.co/blog/aisheets`: warn: 正文含 template-placeholder 标记（提示性）
-  [todo-marker] `https://huggingface.co/blog/nanovlm`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://huggingface.co/blog/inference-providers`: warn: 正文含 todo-marker 标记（提示性）

## lilian-weng

### 阻塞错误（1）

- **integrity** [missing-published-date] `https://lilianweng.github.io/faq`
  - published_at 无效（0001-01-01T00:00:00Z）且无显式 fallback（FAQ 辅助页无日期，不应入库）

## meta-engineering

### 阻塞错误（157）

- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/03/01/security/homomorphic-hashing`
  - 页面真实日期 2019-03-01 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/10/26/connectivity/aquila-what-s-next-for-high-altitude-connectivity`
  - 页面真实日期 2017-10-26 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/09/07/web/announcing-yarn-1-0`
  - 页面真实日期 2017-09-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/07/09/open-source/announcing-xhp-js-building-efficient-user-interface-components-with-hack-react-and-xhp`
  - 页面真实日期 2015-07-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/08/31/core-infra/apache-spark-scale-a-60-tb-production-use-case`
  - 页面真实日期 2016-08-31 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/08/10/connectivity/announcing-tools-to-help-partners-improve-connectivity`
  - 页面真实日期 2018-08-10 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2010/07/02/production-engineering/announcing-the-grace-hopper-scholarship`
  - 页面真实日期 2010-07-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/03/27/core-infra/announcing-the-connectivity-lab-at-facebook`
  - 页面真实日期 2014-03-27 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/05/05/culture/announcing-the-2014-facebook-grace-hopper-scholarship`
  - 页面真实日期 2014-05-05 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/10/08/culture/announcing-the-west-women-entering-and-staying-in-tech-mentorship-pilot`
  - 页面真实日期 2014-10-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/11/11/developer-tools/announcing-the-hack-transpiler`
  - 页面真实日期 2014-11-11 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2010/12/09/core-infra/announcing-the-facebook-2011-hacker-cup`
  - 页面真实日期 2010-12-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/08/22/culture/announcing-the-facebook-grace-hopper-scholarship`
  - 页面真实日期 2012-08-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/01/04/web/announcing-facebook-s-2012-hacker-cup`
  - 页面真实日期 2012-01-04 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/02/17/web/announcing-the-2012-2013-facebook-fellows`
  - 页面真实日期 2012-02-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/07/24/web/announcing-facebook-engineering-in-london`
  - 页面真实日期 2012-07-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/10/17/android/android-accessibility-debugging-with-stetho`
  - 页面真实日期 2016-10-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/01/23/android/android-native-library-merging`
  - 页面真实日期 2018-01-23 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/04/19/developer-tools/announcing-360-capture-sdk`
  - 页面真实日期 2017-04-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/05/02/ai-research/announcing-pytorch-1-0-for-both-research-and-production`
  - 页面真实日期 2018-05-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/01/15/data-center-engineering/alibaba-joins-webscalesql`
  - 页面真实日期 2015-01-16 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/02/20/web/an-analysis-of-facebook-photo-caching`
  - 页面真实日期 2014-02-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/02/27/web/an-analysis-of-facebook-photo-caching-2`
  - 页面真实日期 2014-02-27 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/11/01/connectivity/an-open-approach-for-switching-routing-and-transport`
  - 页面真实日期 2016-11-01 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/02/06/android/android-scale-2018-recap`
  - 页面真实日期 2018-02-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/01/08/ai-research/ai-2018`
  - 页面真实日期 2019-01-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/02/27/connectivity/airtel-and-bcs-with-support-from-facebook-to-build-shared-fiber-backhaul-connectivity-in-uganda`
  - 页面真实日期 2017-02-27 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/01/09/android/airlock-facebook-s-mobile-a-b-testing-framework`
  - 页面真实日期 2014-01-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/05/24/developer-tools/al-a-new-declarative-language-for-detecting-bugs-with-infer`
  - 页面真实日期 2017-05-24 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2009/04/10/web/adapting-open-source-software`
  - 页面真实日期 2009-04-10 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/06/07/web/adding-face-to-every-ip-celebrating-ipv6-s-one-year-anniversary`
  - 页面真实日期 2013-06-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/02/21/connectivity/adopting-an-open-approach-to-global-networks-with-the-telecom-infra-project`
  - 页面真实日期 2016-02-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/05/02/ml-applications/ai-at-f8-2018-open-frameworks-and-responsible-development`
  - 页面真实日期 2018-05-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/03/12/ai-research/ai-blog-roundup`
  - 页面真实日期 2019-03-12 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/05/02/ml-applications/advancing-state-of-the-art-image-recognition-with-deep-learning-on-hashtags`
  - 页面真实日期 2018-05-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2011/03/23/networking-traffic/accelerating-network-innovation-with-the-open-networking-foundation`
  - 页面真实日期 2011-03-23 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/06/08/core-infra/accelerating-machine-learning-for-computer-vision`
  - 页面真实日期 2017-06-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/03/14/data-center-engineering/accelerating-infrastructure`
  - 页面真实日期 2019-03-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/06/30/culture/accelerating-growth-through-facebook-s-rotational-engineering-program`
  - 页面真实日期 2017-06-30 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/11/08/ml-applications/accelerating-innovation-and-powering-new-experiences-with-ai`
  - 页面真实日期 2016-11-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/06/19/data-infrastructure/accelerate-large-scale-applications-with-bolt`
  - 页面真实日期 2018-06-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/01/25/connectivity/electrical-grid-mapping`
  - 页面真实日期 2019-01-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2009/07/29/core-infra/a-new-look-at-the-path-to-popularity`
  - 页面真实日期 2009-07-30 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2010/12/20/core-infra/a-new-year-of-facebook-fellowships`
  - 页面真实日期 2010-12-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/06/20/ml-applications/a-path-to-unsupervised-learning-through-adversarial-networks`
  - 页面真实日期 2016-06-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/05/09/ml-applications/a-novel-approach-to-neural-machine-translation`
  - 页面真实日期 2017-05-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/03/25/web/a-hack-of-epic-proportions-building-a-qr-code-on-the-roof`
  - 页面真实日期 2012-03-26 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/09/14/security/a-faster-better-link-shim`
  - 页面真实日期 2012-09-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/02/04/web/a-decade-of-building-facebook`
  - 页面真实日期 2014-02-04 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/10/19/core-infra/a-comparison-of-state-of-the-art-graph-processing-systems`
  - 页面真实日期 2016-10-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/12/19/core-infra/zstandard`
  - 页面真实日期 2018-12-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/07/02/android/72-hours-to-launch-celebrate-pride`
  - 页面真实日期 2015-07-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/06/27/core-infra/9-9-million-lines-of-code-and-still-moving-fast-facebook-open-source-in-2014`
  - 页面真实日期 2014-06-27 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/08/31/ai-research/360-video-stabilization-a-new-algorithm-for-smoother-360-video-viewing`
  - 页面真实日期 2016-08-31 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/12/11/data-center-engineering/2017-year-in-review-data-centers`
  - 页面真实日期 2017-12-11 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/12/14/android/2017-year-in-review-software-across-the-stack`
  - 页面真实日期 2017-12-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/06/20/core-infra/networking-scale-2018-recap`
  - 页面真实日期 2018-06-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/09/17/android/2018-scale-conference-recap`
  - 页面真实日期 2018-09-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/10/19/culture/2012-grace-hopper-conference-recap`
  - 页面真实日期 2012-10-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/10/25/ai-research/2019-scale-conference`
  - 页面真实日期 2019-10-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/12/20/web/2013-a-year-of-open-source-at-facebook`
  - 页面真实日期 2013-12-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/12/12/connectivity/2017-year-in-review-better-global-networks`
  - 页面真实日期 2017-12-12 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/12/13/virtual-reality/2017-year-in-review-building-immersive-experiences`
  - 页面真实日期 2017-12-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2008/10/14/core-infra/10-billion-photos`
  - 页面真实日期 2008-10-15 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2009/07/31/core-infra/10th-annual-system-administrator-appreciation-day`
  - 页面真实日期 2009-07-31 早于 policy.since 2020-01-01，跳过
- **fetch** `https://engineering.fb.com/2014/06/30/core-infra/bewhoyoucansee-ming-hua`
  - meta-engineering https://engineering.fb.com/2014/06/30/core-infra/bewhoyoucansee-ming-hua: no title found
- **fetch** `https://engineering.fb.com/2014/07/18/culture/bewhoyoucansee-larry-schrof`
  - meta-engineering https://engineering.fb.com/2014/07/18/culture/bewhoyoucansee-larry-schrof: no title found
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/12/08/open-source/12-days-of-open-source`
  - 页面真实日期 2014-12-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/10/02/android/scale-2014-recap-of-mobile-track`
  - 页面真实日期 2014-10-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/10/06/web/scale-2014-recap-of-web-track`
  - 页面真实日期 2014-10-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/10/21/core-infra/scale-2014-recap-of-data-track`
  - 页面真实日期 2014-10-21 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/09/14/open-source/scale-2015-facebook-announcement-recap`
  - 页面真实日期 2015-09-15 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/08/31/web/browserlab-automated-regression-detection-for-the-web`
  - 页面真实日期 2016-08-31 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/03/29/data-infrastructure/faiss-a-library-for-efficient-similarity-search`
  - 页面真实日期 2017-03-29 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/08/15/security/zoncolan`
  - 页面真实日期 2019-08-15 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/02/25/open-source/magma`
  - 页面真实日期 2019-02-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/06/06/data-center-engineering/twine`
  - 页面真实日期 2019-06-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/07/11/core-infra/windex-automation-for-database-provisioning`
  - 页面真实日期 2013-07-11 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/08/31/core-infra/myrocks-a-space-and-write-optimized-mysql-database`
  - 页面真实日期 2016-08-31 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/04/05/production-engineering/facebook-london-engineering-fair`
  - 页面真实日期 2019-04-05 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2011/08/12/android/building-facebook-messenger`
  - 页面真实日期 2011-08-12 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/03/08/web/under-the-hood-building-facebook-messenger-for-windows`
  - 页面真实日期 2012-03-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/12/03/web/under-the-hood-facebook-messenger-for-firefox`
  - 页面真实日期 2012-12-03 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/11/13/android/building-a-faster-messenger`
  - 页面真实日期 2013-11-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/10/09/production-engineering/building-mobile-first-infrastructure-for-messenger`
  - 页面真实日期 2014-10-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/03/17/android/introducing-the-facebook-messenger-for-android-beta-testing-program`
  - 页面真实日期 2014-03-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/06/26/core-infra/migrating-messenger-storage-to-optimize-performance`
  - 页面真实日期 2018-06-26 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/11/06/android/year-class-a-classification-system-for-android`
  - 页面真实日期 2014-11-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/11/14/production-engineering/introducing-data-center-fabric-the-next-generation-facebook-data-center-network`
  - 页面真实日期 2014-11-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/02/22/virtual-reality/spatial-audio-bringing-realistic-sound-to-360-video`
  - 页面真实日期 2017-02-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/09/09/production-engineering/peter-o-hearn-elected-fellow-of-the-royal-academy-of-engineering`
  - 页面真实日期 2016-09-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/06/19/virtual-reality/oculus-scientist-wins-computer-vision-award`
  - 页面真实日期 2015-06-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/07/13/ai-research/facebook-researchers-win-test-of-time-award-at-icml-2018`
  - 页面真实日期 2018-07-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/02/08/developer-tools/infer-team-award`
  - 页面真实日期 2019-02-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/12/06/ai-research/test-of-time-award`
  - 页面真实日期 2018-12-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/02/13/developer-tools/mark-harman-harlan-d-mills-award`
  - 页面真实日期 2019-02-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/10/24/security/simon-marlow`
  - 页面真实日期 2019-10-24 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/03/27/ai-research/turing-award`
  - 页面真实日期 2019-03-27 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/02/21/ml-applications/under-the-hood-suicide-prevention-tools-powered-by-ai`
  - 页面真实日期 2018-02-21 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/10/08/core-infra/akkio`
  - 页面真实日期 2018-10-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/06/13/open-source/improving-css-quality-at-facebook-and-beyond`
  - 页面真实日期 2016-06-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/01/14/data-center-engineering/singapore-data-center`
  - 页面真实日期 2019-01-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/03/20/ml-applications/the-next-step-in-facebook-s-ai-hardware-infrastructure`
  - 页面真实日期 2018-03-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/08/06/security/fizz`
  - 页面真实日期 2018-08-06 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2008/08/20/core-infra/scaling-out`
  - 页面真实日期 2008-08-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/11/18/web/flow-a-new-static-type-checker-for-javascript`
  - 页面真实日期 2014-11-18 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/09/22/networking-traffic/redesigning-the-hhvm-jit-compiler-for-better-performance`
  - 页面真实日期 2016-09-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/04/17/data-center-engineering/hhvm-adoption-news`
  - 页面真实日期 2015-04-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/01/07/web/inside-wikipedia-s-transition-to-hhvm`
  - 页面真实日期 2015-01-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/07/14/open-source/under-the-hood-box-s-hhvm-migration`
  - 页面真实日期 2015-07-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2011/12/09/open-source/the-hiphop-virtual-machine`
  - 页面真实日期 2011-12-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/04/22/developer-tools/isinputpending-api`
  - 页面真实日期 2019-04-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/09/18/core-infra/lessons-from-deploying-mysql-gtid-at-scale`
  - 页面真实日期 2014-09-18 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/09/15/web/introducing-todo-working-together-to-make-open-source-easier`
  - 页面真实日期 2014-09-15 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/02/07/culture/preparing-for-a-technical-interview-with-programming-contests`
  - 页面真实日期 2013-02-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2011/12/20/culture/meet-a-facebook-engineer-carlos-bueno`
  - 页面真实日期 2011-12-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/10/03/open-source/hydra`
  - 页面真实日期 2019-10-03 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/11/08/developer-tools/fast-dimensional-analysis`
  - 页面真实日期 2019-11-08 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/02/24/open-source/under-the-hood-building-and-open-sourcing-flint`
  - 页面真实日期 2014-02-24 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/04/12/android/open-sourcing-redex-making-android-apps-smaller-and-faster`
  - 页面真实日期 2016-04-12 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/04/25/developer-tools/f14`
  - 页面真实日期 2019-04-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/03/30/ml-applications/engineering-for-nostalgia-building-a-personalized-on-this-day-experience`
  - 页面真实日期 2016-03-30 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/11/20/developer-tools/under-the-hood-the-javascript-sdk-the-use-of-polyfills`
  - 页面真实日期 2012-11-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/02/08/video-engineering/under-the-hood-shipping-friendsday-videos`
  - 页面真实日期 2016-02-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/10/07/data-infrastructure/scribe`
  - 页面真实日期 2019-10-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/04/15/core-infra/facebook-chef-cookbooks`
  - 页面真实日期 2016-04-16 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/09/14/developer-tools/react-native-for-android-how-we-built-the-first-cross-platform-react-native-app`
  - 页面真实日期 2015-09-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/06/28/data-infrastructure/spiral-self-tuning-services-via-real-time-machine-learning`
  - 页面真实日期 2018-06-28 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/01/14/web/under-the-hood-automated-backups`
  - 页面真实日期 2013-01-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/10/22/core-infra/under-the-hood-mysql-pool-scanner-mps`
  - 页面真实日期 2013-10-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/11/19/core-infra/data-scale-boston-recap`
  - 页面真实日期 2014-11-19 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/06/05/core-infra/hydrabase-the-evolution-of-hbase-facebook`
  - 页面真实日期 2014-06-05 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/08/14/networking-traffic/openbmc-for-server-porting-and-supporting-new-features-for-yosemite`
  - 页面真实日期 2015-08-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/03/09/data-center-engineering/openbmc-one-board-management-software-for-all-hardware-at-facebook`
  - 页面真实日期 2016-03-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/10/28/data-infrastructure/continuous-mysql-backup-validation-restoring-backups`
  - 页面真实日期 2016-10-28 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph`
  - 页面真实日期 2013-06-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/09/13/data-infrastructure/dhcplb-an-open-source-load-balancer`
  - 页面真实日期 2016-09-13 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/09/25/core-infra/migrating-a-database-from-innodb-to-myrocks`
  - 页面真实日期 2017-09-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/11/25/networking-traffic/networking-scale-boston-2019`
  - 页面真实日期 2019-11-25 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2014/01/07/core-infra/scaling-mercurial-at-facebook`
  - 页面真实日期 2014-01-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2016/05/10/ai-research/ai-revealed`
  - 页面真实日期 2016-05-10 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/08/20/ai-research/facebook-and-nyu-school-of-medicine-launch-research-collaboration-to-improve-mri`
  - 页面真实日期 2018-08-20 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/08/31/ai-research/unsupervised-machine-translation-a-novel-approach-to-provide-fast-accurate-translations-for-more-languages`
  - 页面真实日期 2018-08-31 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2017/09/26/web/react-16-a-look-inside-an-api-compatible-rewrite-of-our-frontend-ui-library`
  - 页面真实日期 2017-09-26 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/12/14/ai-research/pytext-open-source-nlp-framework`
  - 页面真实日期 2018-12-14 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/01/02/open-source/open-source-2018`
  - 页面真实日期 2019-01-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/12/21/ai-research/wav2letter`
  - 页面真实日期 2018-12-21 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/01/17/developer-tools/spectrum`
  - 页面真实日期 2019-01-17 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/02/07/data-center-engineering/los-lunas-data-center`
  - 页面真实日期 2019-02-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2013/04/29/web/under-the-hood-the-natural-language-interface-of-graph-search`
  - 页面真实日期 2013-04-29 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2019/12/02/security/data-transfer-project`
  - 页面真实日期 2019-12-02 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2018/11/07/ml-applications/fbgemm`
  - 页面真实日期 2018-11-07 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2015/06/22/core-infra/inside-data-scale-2015`
  - 页面真实日期 2015-06-22 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2008/06/04/core-infra/hadoop`
  - 页面真实日期 2008-06-05 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/02/15/culture/meet-a-facebook-engineer-ben-billings`
  - 页面真实日期 2012-02-15 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/11/09/ios/under-the-hood-integrating-standalone-mobile-app-features-into-facebook-for-ios`
  - 页面真实日期 2012-11-09 早于 policy.since 2020-01-01，跳过
- **integrity** [outside-backfill-window] `https://engineering.fb.com/2012/12/13/android/under-the-hood-rebuilding-facebook-for-android`
  - 页面真实日期 2012-12-13 早于 policy.since 2020-01-01，跳过

## microsoft-research

### 阻塞错误（1）

- **fetch** `https://www.microsoft.com/en-us/research/blog/%7B%-%20postPermalink%20%%7D`
  - microsoft-research https://www.microsoft.com/en-us/research/blog/%7B%-%20postPermalink%20%%7D: HTTP 400 

## openai

### 阻塞错误（1）

- **fetch** `https://openai.com/index/advancing-content-provenance`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/advancing-content-provenance

## simon-willison

### 提示性警告（10）

-  [todo-marker] `https://simonwillison.net/2026/Apr/23/liteparse-for-the-web`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2026/Jan/28/dynamic-features-static-site`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2025/Nov/9/gpt-5-codex-mini`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2025/Jul/13/django-birthday`: warn: 正文含 todo-marker 标记（提示性）
-  [template-placeholder] `https://simonwillison.net/2024/Apr/17/ai-for-data-journalism`: warn: 正文含 template-placeholder 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2024/Apr/17/ai-for-data-journalism`: warn: 正文含 todo-marker 标记（提示性）
-  [template-placeholder] `https://simonwillison.net/2023/Dec/1/datasette-enrichments`: warn: 正文含 template-placeholder 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2023/Aug/3/weird-world-of-llms`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2023/Apr/25/dual-llm-pattern`: warn: 正文含 todo-marker 标记（提示性）
-  [todo-marker] `https://simonwillison.net/2025/Nov/23/agent-design-is-still-hard`: warn: 正文含 todo-marker 标记（提示性）

---
总计阻塞错误 165 条。

