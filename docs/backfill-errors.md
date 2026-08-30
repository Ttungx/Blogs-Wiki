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

---

## 2026-08-30T12:13:40.665Z（lilian-weng）

- 错误总数：0

无错误。

---

## 2026-08-30T12:18:14.470Z（openai）

- 错误总数：15

### openai（15 条）

- **fetch** `https://openai.com/index/hugging-face-incident-and-the-road-ahead`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/hugging-face-incident-and-the-road-ahead
- **fetch** `https://openai.com/index/hardening-atlas-against-prompt-injection`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/hardening-atlas-against-prompt-injection
- **fetch** `https://openai.com/index/response-to-nyt-data-demands`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/response-to-nyt-data-demands
- **fetch** `https://openai.com/index/security-on-the-path-to-agi`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/security-on-the-path-to-agi
- **fetch** `https://openai.com/index/disrupting-malicious-uses-of-ai-by-state-affiliated-threat-actors`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/disrupting-malicious-uses-of-ai-by-state-affiliated-threat-actors
- **fetch** `https://openai.com/index/third-party-cyber-evaluations-involving-openai-models`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/third-party-cyber-evaluations-involving-openai-models
- **fetch** `https://openai.com/index/confidence-building-measures-for-artificial-intelligence`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/confidence-building-measures-for-artificial-intelligence
- **fetch** `https://openai.com/index/ai-literacy-resources-for-teens-and-parents`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/ai-literacy-resources-for-teens-and-parents
- **fetch** `https://openai.com/index/building-towards-age-prediction`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/building-towards-age-prediction
- **fetch** `https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/how-we-monitor-internal-coding-agents-misalignment
- **fetch** `https://openai.com/index/democratic-inputs-to-ai-grant-program-update`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/democratic-inputs-to-ai-grant-program-update
- **fetch** `https://openai.com/index/delivering-low-latency-voice-ai-at-scale`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/delivering-low-latency-voice-ai-at-scale
- **fetch** `https://openai.com/index/openai-pytorch`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/openai-pytorch
- **fetch** `https://openai.com/index/how-should-ai-systems-behave`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/how-should-ai-systems-behave
- **fetch** `https://openai.com/index/gpt-5-system-card-update-gpt-5-2`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/gpt-5-system-card-update-gpt-5-2

---

## 2026-08-30T12:18:49.350Z（anthropic）

- 错误总数：1

### anthropic（1 条）

- **integrity** [todo-marker] `https://www.anthropic.com/engineering/claude-code-auto-mode`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:19:52.497Z（langchain）

- 错误总数：9

### langchain（9 条）

- **integrity** [todo-marker] `https://www.langchain.com/blog/financial-ai-that-investigates-macro-trends-eu-economic-analysis-with-you-com-and-langchain`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/building-a-company-due-diligence-agent-with-deep-agents-langsmith-and-parallel`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/deep-agents-v0-7`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/how-we-benchmark-deep-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/how-to-build-a-custom-agent-harness`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/open-swe-an-open-source-framework-for-internal-coding-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/code-interpreter-api`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/deep-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/introducing-deepagents-cli`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:20:38.683Z（cursor）

- 错误总数：3

### cursor（3 条）

- **integrity** [content-too-short] `https://cursor.com/blog/grok-4-5-model-card`
  - 正文纯文本 191 字符，低于 200
- **integrity** [looks-like-navigation-list] `https://cursor.com/blog/grok-4-5-model-card`
  - 正文 191 字符但含 6 个外链，疑似导航/归档列表
- **integrity** [todo-marker] `https://cursor.com/blog/automations`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:21:03.559Z（qwen）

- 错误总数：2

### qwen（2 条）

- **integrity** [todo-marker] `https://qwenlm.github.io/blog/qvq-72b-preview`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://qwenlm.github.io/blog/qwen-vl`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:24:27.360Z（google-deepmind）

- 错误总数：91

### google-deepmind（91 条）

- **integrity** [outside-backfill-window] `https://deepmind.google/blog/2017-deepminds-year-in-review`
  - 有效日期 2017-12-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/enabling-continual-learning-in-neural-networks`
  - 有效日期 2017-03-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-3`
  - 有效日期 2016-12-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-2`
  - 有效日期 2016-12-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-and-blizzard-to-release-starcraft-ii-as-an-ai-research-environment`
  - 有效日期 2016-11-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-1`
  - 有效日期 2016-12-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/differentiable-neural-computers`
  - 有效日期 2016-10-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/announcing-the-partnership-on-ai-to-benefit-people-society`
  - 有效日期 2016-09-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/applying-machine-learning-to-radiotherapy-planning-for-head-neck-cancer`
  - 有效日期 2016-08-30 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/decoupled-neural-interfaces-using-synthetic-gradients`
  - 有效日期 2016-08-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-ai-reduces-google-data-centre-cooling-bill-by-40`
  - 有效日期 2016-07-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/announcing-deepmind-health-research-partnership-with-moorfields-eye-hospital`
  - 有效日期 2016-05-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deep-reinforcement-learning`
  - 有效日期 2016-06-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/game-theory-insights-into-asymmetric-multi-agent-games`
  - 有效日期 2018-01-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-and-blizzard-open-starcraft-ii-as-an-ai-research-environment`
  - 有效日期 2017-08-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphago-zero-starting-from-scratch`
  - 有效日期 2017-10-18 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/ai-and-neuroscience-a-virtuous-circle`
  - 有效日期 2017-08-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/agents-that-imagine-and-plan`
  - 有效日期 2017-07-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-expands-to-canada-with-new-research-office-in-edmonton-alberta`
  - 有效日期 2017-07-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphagos-next-move`
  - 有效日期 2017-05-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphazero-shedding-new-light-on-chess-shogi-and-go`
  - 有效日期 2018-12-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/our-collaborations-with-academia-to-advance-the-field-of-ai`
  - 有效日期 2017-01-23 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/reinforcement-learning-with-unsupervised-auxiliary-tasks`
  - 有效日期 2016-11-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-deepmind-lab`
  - 有效日期 2016-12-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/putting-patients-at-the-heart-of-deepmind-health`
  - 有效日期 2016-09-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/prefrontal-cortex-as-a-meta-reinforcement-learning-system`
  - 有效日期 2018-05-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/navigating-with-grid-like-representations-in-artificial-agents`
  - 有效日期 2018-05-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-return-to-paris`
  - 有效日期 2018-03-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-to-navigate-in-cities-without-a-map`
  - 有效日期 2018-03-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-by-playing`
  - 有效日期 2018-02-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/scalable-agent-architecture-for-distributed-training`
  - 有效日期 2018-02-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-explanatory-rules-from-noisy-data`
  - 有效日期 2018-01-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-psychlab`
  - 有效日期 2018-01-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/population-based-training-of-neural-networks`
  - 有效日期 2017-11-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/specifying-ai-safety-problems-in-simple-environments`
  - 有效日期 2017-11-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/high-fidelity-speech-synthesis-with-wavenet`
  - 有效日期 2017-11-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/sharing-our-insights-from-designing-with-clinicians`
  - 有效日期 2017-11-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/strengthening-our-commitment-to-canadian-research`
  - 有效日期 2017-10-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/the-hippocampus-as-a-predictive-map`
  - 有效日期 2017-10-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/going-beyond-average-for-reinforcement-learning`
  - 有效日期 2017-07-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/imagine-this-creating-new-visual-concepts-by-recombining-familiar-ones`
  - 有效日期 2017-07-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/producing-flexible-behaviours-in-simulated-environments`
  - 有效日期 2017-07-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/interpreting-deep-neural-networks-using-cognitive-psychology`
  - 有效日期 2017-06-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-through-human-feedback`
  - 有效日期 2017-06-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/innovations-of-alphago`
  - 有效日期 2017-04-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/preserving-outputs-precisely-while-adaptively-rescaling-targets`
  - 有效日期 2018-09-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/safety-first-ai-for-autonomous-data-centre-cooling-and-industrial-control`
  - 有效日期 2018-08-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/objects-that-sound`
  - 有效日期 2018-08-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/measuring-abstract-reasoning-in-neural-networks`
  - 有效日期 2018-07-11 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/neural-scene-representation-and-rendering`
  - 有效日期 2018-06-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/understanding-agent-cooperation`
  - 有效日期 2017-02-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/wavenet-a-generative-model-for-raw-audio`
  - 有效日期 2016-09-08 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/why-doesnt-streams-use-ai`
  - 有效日期 2017-11-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/understanding-deep-learning-through-neuron-deletion`
  - 有效日期 2018-03-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/wavenet-launches-in-the-google-assistant`
  - 有效日期 2017-10-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-sonnet-a-new-library-for-constructing-neural-networks`
  - 有效日期 2017-04-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-trfl-a-library-of-reinforcement-learning-building-blocks`
  - 有效日期 2018-10-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-to-write-programs-that-generate-images`
  - 有效日期 2018-03-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/stop-look-and-listen-to-the-people-you-want-to-help`
  - 有效日期 2018-03-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/why-we-launched-deepmind-ethics-society`
  - 有效日期 2017-10-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/exploring-the-mysteries-of-go-with-alphago-and-chinas-top-players`
  - 有效日期 2017-04-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/distill-communicating-the-science-of-machine-learning`
  - 有效日期 2017-03-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/trust-confidence-and-verifiable-data-audit`
  - 有效日期 2017-03-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepminds-work-in-2016-a-round-up`
  - 有效日期 2017-01-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/working-with-the-nhs-to-build-lifesaving-technology`
  - 有效日期 2016-11-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/our-first-coo-lila-ibrahim-takes-deepmind-to-the-next-level`
  - 有效日期 2018-04-11 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/researching-patient-deterioration-with-the-us-department-of-veterans-affairs`
  - 有效日期 2018-02-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/independent-reviewers-release-first-annual-report-on-deepmind-health`
  - 有效日期 2017-07-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/collaborating-with-patients-for-better-outcomes`
  - 有效日期 2017-12-19 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/the-information-commissioner-the-royal-free-and-what-weve-learned`
  - 有效日期 2017-07-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/scaling-streams-with-google`
  - 有效日期 2018-11-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/expanding-our-research-on-breast-cancer-screening-to-japan`
  - 有效日期 2018-10-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/using-ai-to-plan-head-and-neck-cancer-treatments`
  - 有效日期 2018-09-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-health-response-to-independent-reviewers-report-2018`
  - 有效日期 2018-06-15 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/royal-free-london-publishes-findings-of-legal-audit-in-use-of-streams`
  - 有效日期 2018-06-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/applying-machine-learning-to-mammography-screening-for-breast-cancer`
  - 有效日期 2017-11-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-neural-approach-to-relational-reasoning`
  - 有效日期 2017-06-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/bringing-the-best-of-mobile-technology-to-imperial-college-healthcare-nhs-trust`
  - 有效日期 2016-12-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-iclr-2018`
  - 有效日期 2018-04-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/we-are-very-excited-to-announce-the-launch-of-deepmind-health`
  - 有效日期 2016-02-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-meet-android`
  - 有效日期 2018-05-08 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-nips-2017`
  - 有效日期 2017-12-01 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/bringing-streams-to-yeovil-district-hospital-nhs-foundation-trust`
  - 有效日期 2017-11-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-three`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-two`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-one`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/enhancing-patient-safety-at-taunton-and-somerset-nhs-foundation-trust`
  - 有效日期 2017-06-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/predicting-eye-disease-with-moorfields-eye-hospital`
  - 有效日期 2018-11-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2018`
  - 有效日期 2018-07-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-major-milestone-for-the-treatment-of-eye-disease`
  - 有效日期 2018-08-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-milestone-for-deepmind-health-and-streams`
  - 有效日期 2017-02-27 早于 policy.since 2019-01-01，跳过

---

## 2026-08-30T12:27:18.906Z（anthropic）

- 错误总数：1

### anthropic（1 条）

- **integrity** [todo-marker] `https://www.anthropic.com/engineering/claude-code-auto-mode`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:27:32.562Z（google-security）

- 错误总数：0

无错误。

---

## 2026-08-30T12:27:51.023Z（qwen）

- 错误总数：2

### qwen（2 条）

- **integrity** [todo-marker] `https://qwenlm.github.io/blog/qvq-72b-preview`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://qwenlm.github.io/blog/qwen-vl`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:28:08.496Z（langchain）

- 错误总数：9

### langchain（9 条）

- **integrity** [todo-marker] `https://www.langchain.com/blog/financial-ai-that-investigates-macro-trends-eu-economic-analysis-with-you-com-and-langchain`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/building-a-company-due-diligence-agent-with-deep-agents-langsmith-and-parallel`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/deep-agents-v0-7`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/how-we-benchmark-deep-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/how-to-build-a-custom-agent-harness`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/open-swe-an-open-source-framework-for-internal-coding-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/code-interpreter-api`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/deep-agents`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://www.langchain.com/blog/introducing-deepagents-cli`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:28:49.357Z（cursor）

- 错误总数：3

### cursor（3 条）

- **integrity** [content-too-short] `https://cursor.com/blog/grok-4-5-model-card`
  - 正文纯文本 191 字符，低于 200
- **integrity** [looks-like-navigation-list] `https://cursor.com/blog/grok-4-5-model-card`
  - 正文 191 字符但含 6 个外链，疑似导航/归档列表
- **integrity** [todo-marker] `https://cursor.com/blog/automations`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:28:55.509Z（meta-ai）

- 错误总数：0

无错误。

---

## 2026-08-30T12:29:07.028Z（dan-koe）

- 错误总数：3

### dan-koe（3 条）

- **integrity** [todo-marker] `https://letters.thedankoe.com/p/how-id-build-a-one-person-business`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://letters.thedankoe.com/p/prompt-deep-work-accelerator`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [event-deadline] `https://letters.thedankoe.com/p/how-average-people-will-get-rich`
  - 命中促销/直播信号（event-deadline）

---

## 2026-08-30T12:29:14.631Z（google-deepmind）

- 错误总数：91

### google-deepmind（91 条）

- **integrity** [outside-backfill-window] `https://deepmind.google/blog/2017-deepminds-year-in-review`
  - 有效日期 2017-12-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/enabling-continual-learning-in-neural-networks`
  - 有效日期 2017-03-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-1`
  - 有效日期 2016-12-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-2`
  - 有效日期 2016-12-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-and-blizzard-to-release-starcraft-ii-as-an-ai-research-environment`
  - 有效日期 2016-11-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-nips-part-3`
  - 有效日期 2016-12-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/differentiable-neural-computers`
  - 有效日期 2016-10-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/announcing-the-partnership-on-ai-to-benefit-people-society`
  - 有效日期 2016-09-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/applying-machine-learning-to-radiotherapy-planning-for-head-neck-cancer`
  - 有效日期 2016-08-30 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/decoupled-neural-interfaces-using-synthetic-gradients`
  - 有效日期 2016-08-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-ai-reduces-google-data-centre-cooling-bill-by-40`
  - 有效日期 2016-07-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/announcing-deepmind-health-research-partnership-with-moorfields-eye-hospital`
  - 有效日期 2016-05-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deep-reinforcement-learning`
  - 有效日期 2016-06-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-and-blizzard-open-starcraft-ii-as-an-ai-research-environment`
  - 有效日期 2017-08-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/game-theory-insights-into-asymmetric-multi-agent-games`
  - 有效日期 2018-01-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/ai-and-neuroscience-a-virtuous-circle`
  - 有效日期 2017-08-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphago-zero-starting-from-scratch`
  - 有效日期 2017-10-18 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-expands-to-canada-with-new-research-office-in-edmonton-alberta`
  - 有效日期 2017-07-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/agents-that-imagine-and-plan`
  - 有效日期 2017-07-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphagos-next-move`
  - 有效日期 2017-05-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/alphazero-shedding-new-light-on-chess-shogi-and-go`
  - 有效日期 2018-12-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/our-collaborations-with-academia-to-advance-the-field-of-ai`
  - 有效日期 2017-01-23 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/reinforcement-learning-with-unsupervised-auxiliary-tasks`
  - 有效日期 2016-11-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/putting-patients-at-the-heart-of-deepmind-health`
  - 有效日期 2016-09-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-deepmind-lab`
  - 有效日期 2016-12-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-to-navigate-in-cities-without-a-map`
  - 有效日期 2018-03-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-by-playing`
  - 有效日期 2018-02-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/navigating-with-grid-like-representations-in-artificial-agents`
  - 有效日期 2018-05-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/prefrontal-cortex-as-a-meta-reinforcement-learning-system`
  - 有效日期 2018-05-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-return-to-paris`
  - 有效日期 2018-03-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/scalable-agent-architecture-for-distributed-training`
  - 有效日期 2018-02-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-psychlab`
  - 有效日期 2018-01-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-explanatory-rules-from-noisy-data`
  - 有效日期 2018-01-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/high-fidelity-speech-synthesis-with-wavenet`
  - 有效日期 2017-11-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/specifying-ai-safety-problems-in-simple-environments`
  - 有效日期 2017-11-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/population-based-training-of-neural-networks`
  - 有效日期 2017-11-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/sharing-our-insights-from-designing-with-clinicians`
  - 有效日期 2017-11-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/strengthening-our-commitment-to-canadian-research`
  - 有效日期 2017-10-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/the-hippocampus-as-a-predictive-map`
  - 有效日期 2017-10-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/imagine-this-creating-new-visual-concepts-by-recombining-familiar-ones`
  - 有效日期 2017-07-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/going-beyond-average-for-reinforcement-learning`
  - 有效日期 2017-07-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/producing-flexible-behaviours-in-simulated-environments`
  - 有效日期 2017-07-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/interpreting-deep-neural-networks-using-cognitive-psychology`
  - 有效日期 2017-06-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-through-human-feedback`
  - 有效日期 2017-06-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/innovations-of-alphago`
  - 有效日期 2017-04-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/preserving-outputs-precisely-while-adaptively-rescaling-targets`
  - 有效日期 2018-09-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/safety-first-ai-for-autonomous-data-centre-cooling-and-industrial-control`
  - 有效日期 2018-08-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/objects-that-sound`
  - 有效日期 2018-08-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/measuring-abstract-reasoning-in-neural-networks`
  - 有效日期 2018-07-11 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/neural-scene-representation-and-rendering`
  - 有效日期 2018-06-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/understanding-agent-cooperation`
  - 有效日期 2017-02-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/wavenet-a-generative-model-for-raw-audio`
  - 有效日期 2016-09-08 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/why-doesnt-streams-use-ai`
  - 有效日期 2017-11-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/understanding-deep-learning-through-neuron-deletion`
  - 有效日期 2018-03-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/wavenet-launches-in-the-google-assistant`
  - 有效日期 2017-10-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-sonnet-a-new-library-for-constructing-neural-networks`
  - 有效日期 2017-04-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/open-sourcing-trfl-a-library-of-reinforcement-learning-building-blocks`
  - 有效日期 2018-10-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/learning-to-write-programs-that-generate-images`
  - 有效日期 2018-03-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/stop-look-and-listen-to-the-people-you-want-to-help`
  - 有效日期 2018-03-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/why-we-launched-deepmind-ethics-society`
  - 有效日期 2017-10-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/exploring-the-mysteries-of-go-with-alphago-and-chinas-top-players`
  - 有效日期 2017-04-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/trust-confidence-and-verifiable-data-audit`
  - 有效日期 2017-03-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/distill-communicating-the-science-of-machine-learning`
  - 有效日期 2017-03-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/our-first-coo-lila-ibrahim-takes-deepmind-to-the-next-level`
  - 有效日期 2018-04-11 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/working-with-the-nhs-to-build-lifesaving-technology`
  - 有效日期 2016-11-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepminds-work-in-2016-a-round-up`
  - 有效日期 2017-01-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/researching-patient-deterioration-with-the-us-department-of-veterans-affairs`
  - 有效日期 2018-02-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/independent-reviewers-release-first-annual-report-on-deepmind-health`
  - 有效日期 2017-07-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/collaborating-with-patients-for-better-outcomes`
  - 有效日期 2017-12-19 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/the-information-commissioner-the-royal-free-and-what-weve-learned`
  - 有效日期 2017-07-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/scaling-streams-with-google`
  - 有效日期 2018-11-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/expanding-our-research-on-breast-cancer-screening-to-japan`
  - 有效日期 2018-10-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/using-ai-to-plan-head-and-neck-cancer-treatments`
  - 有效日期 2018-09-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/royal-free-london-publishes-findings-of-legal-audit-in-use-of-streams`
  - 有效日期 2018-06-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-health-response-to-independent-reviewers-report-2018`
  - 有效日期 2018-06-15 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-neural-approach-to-relational-reasoning`
  - 有效日期 2017-06-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/applying-machine-learning-to-mammography-screening-for-breast-cancer`
  - 有效日期 2017-11-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/bringing-the-best-of-mobile-technology-to-imperial-college-healthcare-nhs-trust`
  - 有效日期 2016-12-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/we-are-very-excited-to-announce-the-launch-of-deepmind-health`
  - 有效日期 2016-02-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-meet-android`
  - 有效日期 2018-05-08 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-nips-2017`
  - 有效日期 2017-12-01 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-iclr-2018`
  - 有效日期 2018-04-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/bringing-streams-to-yeovil-district-hospital-nhs-foundation-trust`
  - 有效日期 2017-11-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-three`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-two`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2017-part-one`
  - 有效日期 2017-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/predicting-eye-disease-with-moorfields-eye-hospital`
  - 有效日期 2018-11-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/enhancing-patient-safety-at-taunton-and-somerset-nhs-foundation-trust`
  - 有效日期 2017-06-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/deepmind-papers-at-icml-2018`
  - 有效日期 2018-07-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-major-milestone-for-the-treatment-of-eye-disease`
  - 有效日期 2018-08-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://deepmind.google/blog/a-milestone-for-deepmind-health-and-streams`
  - 有效日期 2017-02-27 早于 policy.since 2019-01-01，跳过

---

## 2026-08-30T12:29:17.742Z（mistral-ai）

- 错误总数：0

无错误。

---

## 2026-08-30T12:29:34.098Z（eleuther-ai）

- 错误总数：0

无错误。

---

## 2026-08-30T12:29:38.951Z（openai）

- 错误总数：22

### openai（22 条）

- **fetch** `https://openai.com/index/introducing-gpt-rosalind`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/introducing-gpt-rosalind
- **integrity** [outside-backfill-window] `https://openai.com/index/hugging-face-incident-and-the-road-ahead`
  - 有效日期 May 12 早于 policy.since 2019-01-01，跳过
- **fetch** `https://openai.com/index/building-codex-windows-sandbox`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/building-codex-windows-sandbox
- **fetch** `https://openai.com/index/introducing-aardvark`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/introducing-aardvark
- **fetch** `https://openai.com/index/scaling-coordinated-vulnerability-disclosure`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/scaling-coordinated-vulnerability-disclosure
- **fetch** `https://openai.com/index/running-codex-safely`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/running-codex-safely
- **fetch** `https://openai.com/index/disrupting-a-covert-iranian-influence-operation`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/disrupting-a-covert-iranian-influence-operation
- **fetch** `https://openai.com/index/openai-appoints-retired-us-army-general`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/openai-appoints-retired-us-army-general
- **fetch** `https://openai.com/index/scientific-computing-agentic-ai`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/scientific-computing-agentic-ai
- **fetch** `https://openai.com/index/chatgpt-agent-system-card`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/chatgpt-agent-system-card
- **fetch** `https://openai.com/index/scaling-social-science-research`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/scaling-social-science-research
- **fetch** `https://openai.com/index/introducing-evmbench`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/introducing-evmbench
- **fetch** `https://openai.com/index/our-commitment-to-community-safety`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/our-commitment-to-community-safety
- **fetch** `https://openai.com/index/beyond-rate-limits`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/beyond-rate-limits
- **fetch** `https://openai.com/index/openai-safety-update`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/openai-safety-update
- **fetch** `https://openai.com/index/accelerating-science-gpt-5`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/accelerating-science-gpt-5
- **fetch** `https://openai.com/index/advancing-youth-safety-in-emea`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/advancing-youth-safety-in-emea
- **fetch** `https://openai.com/index/us-caisi-uk-aisi-ai-update`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/us-caisi-uk-aisi-ai-update
- **fetch** `https://openai.com/index/bio-bug-bounty`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/bio-bug-bounty
- **fetch** `https://openai.com/index/openai-frontier-governance-framework`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/openai-frontier-governance-framework
- **fetch** `https://openai.com/index/mrc-supercomputer-networking`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/mrc-supercomputer-networking
- **fetch** `https://openai.com/index/update-on-safety-and-security-practices`
  - extractor: content too short (0 chars, minimum 200) for https://openai.com/index/update-on-safety-and-security-practices

---

## 2026-08-30T12:29:49.828Z（lilian-weng）

- 错误总数：0

无错误。

---

## 2026-08-30T12:30:36.094Z（github-engineering）

- 错误总数：30

### github-engineering（30 条）

- **integrity** [todo-marker] `https://github.blog/engineering/user-experience/your-alt-text-passes-automated-checks-that-doesnt-mean-its-any-good`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/stretching-spokes`
  - 有效日期 2017-10-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/moving-persistent-data-out-of-redis`
  - 有效日期 2017-01-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/using-mysql-performance-schema-for-workload-analysis`
  - 有效日期 2015-05-19 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/engineering-principles/deploying-branches-to-github-com`
  - 有效日期 2015-06-02 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/applying-machine-intelligence-to-security-alerts`
  - 有效日期 2018-10-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/githubs-csp-journey`
  - 有效日期 2016-04-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/user-experience/a-formal-spec-for-github-markdown`
  - 有效日期 2017-03-14 早于 policy.since 2019-01-01，跳过
- **integrity** [todo-marker] `https://github.blog/engineering/engineering-principles/reducing-flaky-builds-by-18x`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/introducing-the-new-github-status-site`
  - 有效日期 2018-12-11 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/crypto-deprecation-notice`
  - 有效日期 2017-02-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/githubs-post-csp-journey`
  - 有效日期 2017-01-19 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/upgrading-github-from-rails-3-2-to-5-2`
  - 有效日期 2018-09-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/githubs-bug-bounty-workflow`
  - 有效日期 2017-02-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/mysql-testing-automation-at-github`
  - 有效日期 2017-07-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/mysql-high-availability-at-github`
  - 有效日期 2018-06-20 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/platform-security/behind-the-scenes-of-github-token-scanning`
  - 有效日期 2018-10-17 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/introducing-glb`
  - 有效日期 2016-09-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/architecture-optimization/how-four-native-developers-wrote-an-electron-app`
  - 有效日期 2017-05-16 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/architecture-optimization/how-we-made-diff-pages-3x-faster`
  - 有效日期 2016-12-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/enabling-split-authority-dns-with-octodns`
  - 有效日期 2017-04-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno`
  - 有效日期 2017-10-13 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/engineering-principles/removing-jquery-from-github-frontend`
  - 有效日期 2018-09-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/dns-infrastructure-at-github`
  - 有效日期 2017-05-31 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/user-experience/driving-changes-from-designs`
  - 有效日期 2018-04-12 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/engineering-principles/how-github-uses-github-to-document-github`
  - 有效日期 2015-01-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/engineering-principles/eight-lessons-learned-hacking-on-github-pages-for-six-months`
  - 有效日期 2015-04-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/architecture-optimization/delivering-octicons-with-svg`
  - 有效日期 2016-02-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/yummy-cookies-across-domains`
  - 有效日期 2013-04-09 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://github.blog/engineering/infrastructure/tcmalloc-and-mysql`
  - 有效日期 2013-02-21 早于 policy.since 2019-01-01，跳过

---

## 2026-08-30T12:30:45.654Z（lastwhisper）

- 错误总数：3

### lastwhisper（3 条）

- **integrity** [todo-marker] `https://keli-wen.github.io/One-Poem-Suffices/one-poem-suffices/context-engineering`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://keli-wen.github.io/One-Poem-Suffices/zen-of-harness-engineering/why-grill-me`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [todo-marker] `https://keli-wen.github.io/One-Poem-Suffices/scaling-thoughts/2025-review`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:30:57.174Z（hamel-husain）

- 错误总数：1

### hamel-husain（1 条）

- **integrity** [template-placeholder] `https://hamel.dev/blog/posts/llm-judge`
  - warn: 正文含 template-placeholder 标记（提示性）

---

## 2026-08-30T12:31:06.369Z（andrej-karpathy）

- 错误总数：16

### andrej-karpathy（16 条）

- **integrity** [todo-marker] `https://karpathy.bearblog.dev/the-append-and-review-note`
  - warn: 正文含 todo-marker 标记（提示性）
- **integrity** [missing-published-date] `https://karpathy.github.io/2026/02/12/microgpt`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2022/03/14/lecun1989`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2019/04/25/recipe`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2016/09/07/phd`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2015/10/25/selfie`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2015/03/30/breaking-convnets`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2014/08/03/quantifying-productivity`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2014/07/02/visualizing-top-tweeps-with-t-sne-in-Javascript`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2014/07/01/switching-to-jekyll`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2014/07/03/feature-learning-escapades`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2014/04/26/datascience-weekly-interview`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2013/11/27/quantifying-hacker-news`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2013/11/23/chrome-extension-programming`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2012/10/22/state-of-computer-vision`
  - published_at 缺失且无显式 fallback
- **integrity** [missing-published-date] `https://karpathy.github.io/2011/04/27/manually-classifying-cifar10`
  - published_at 缺失且无显式 fallback

---

## 2026-08-30T12:32:31.372Z（microsoft-research）

- 错误总数：44

### microsoft-research（44 条）

- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/exploding-software-engineering-myths`
  - 有效日期 2009-10-07 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-makes-its-presence-felt-at-ghc`
  - 有效日期 2010-09-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/hopper-event-inspiring-interest-cs`
  - 有效日期 2012-10-05 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/project-premonition-bringing-researchers-together-to-detect-diseases-before-they-become-an-outbreak`
  - 有效日期 2015-06-10 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/latest-microsoft-research-luminary-lucas-joppa-conservation-scientist`
  - 有效日期 2013-12-16 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/gulwani-wins-2014-robin-milner-young-researcher-award`
  - 有效日期 2014-07-01 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/jennifer-chayes-opens-inaugural-women-in-data-science-conference`
  - 有效日期 2015-11-01 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/minimizing-trial-and-error-in-the-drug-discovery-process`
  - 有效日期 2018-11-29 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/mind-meld-microsoft-research-style-2`
  - 有效日期 2016-03-25 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/opening-the-door-to-innovation-winners-of-the-first-microsoft-open-source-challenge-announced`
  - 有效日期 2016-04-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/equal-parts-passion-skill-key-microsoft-research-high-school-intern-projects`
  - 有效日期 2017-10-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-redmond-year-in-review`
  - 有效日期 2011-12-31 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/20th-anniversary-gets-a-fitting-finale`
  - 有效日期 2011-09-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/and-the-winners-are`
  - 有效日期 2006-09-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/thinking-outside-of-the-black-box-of-machine-learning-on-the-long-quest-to-perfecting-automatic-speech-recognition`
  - 有效日期 2018-08-31 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/encouraging-developers-and-manufacturers-to-innovate-with-eye-control`
  - 有效日期 2018-10-31 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-and-the-industrial-research-cycle`
  - 有效日期 2017-01-30 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-team-creates-seattle-gigapixel-artzoom-interactive-city-panorama`
  - 有效日期 2014-01-27 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/researchers-build-nanoscale-computational-circuit-boards-dna`
  - 有效日期 2017-07-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/dna-binding-rate`
  - 有效日期 2017-11-08 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/expeditions-exploring-the-unknown`
  - 有效日期 2016-02-26 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-welcomes-landon-cox-senior-researcher-passion-privacy-empowering-users-worldwide`
  - 有效日期 2018-05-15 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-airsim-now-available-on-unity`
  - 有效日期 2018-11-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/z3-wins-2015-acm-sigplan-award`
  - 有效日期 2015-06-16 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/chose-stem-event-recap`
  - 有效日期 2018-02-14 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/2013-seif-awards-support-researchers-in-software-engineering`
  - 有效日期 2013-04-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/uist-showcases-novel-interfaces`
  - 有效日期 2010-10-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/addressing-fairness-accountability-and-transparency-in-machine-learning`
  - 有效日期 2014-12-22 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/dowhy-a-library-for-causal-inference`
  - 有效日期 2018-08-21 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-inria-joint-centre-inventing-today-tomorrows-world`
  - 有效日期 2014-05-19 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-shines-nsdi-18`
  - 有效日期 2018-04-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/chronozoom-challenge-visualize-history-and-win`
  - 有效日期 2013-11-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/12-18-14-equation-of-a-fuzzing-curve-part-1-2`
  - 有效日期 2014-12-18 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/practice-and-theory-of-security-reviews`
  - 有效日期 2014-07-18 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/security-reviews-the-heuristics-zoo-part-1-2`
  - 有效日期 2014-07-23 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/estimating-hidden-bug-count-part-1-3`
  - 有效日期 2014-09-30 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/is-pluto-a-planet`
  - 有效日期 2016-05-25 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/equation-of-a-fuzzing-curve-part-2-2`
  - 有效日期 2015-01-06 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/practice-and-theory-of-security-reviews-part-3`
  - 有效日期 2014-08-04 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/security-reviews-the-heuristics-zoo-part-2-2`
  - 有效日期 2014-07-28 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/estimating-hidden-bug-count-part-2-3`
  - 有效日期 2014-09-30 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/genetic-algorithm-in-reverse-mode`
  - 有效日期 2017-07-24 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/estimating-hidden-bug-count-part-3-3`
  - 有效日期 2014-10-03 早于 policy.since 2019-01-01，跳过
- **integrity** [outside-backfill-window] `https://www.microsoft.com/en-us/research/blog/microsoft-research-2018-10-memorable-blogs-topping-a-year-of-open-source-and-innovation`
  - 有效日期 2018-12-27 早于 policy.since 2019-01-01，跳过

---

## 2026-08-30T12:33:23.582Z（sebastian-raschka）

- 错误总数：1

### sebastian-raschka（1 条）

- **integrity** [todo-marker] `https://magazine.sebastianraschka.com/p/supporting-ahead-of-ai`
  - warn: 正文含 todo-marker 标记（提示性）

---

## 2026-08-30T12:33:38.744Z（jay-alammar）

- 错误总数：0

无错误。
