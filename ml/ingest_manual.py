"""定向纠偏入库（plan §19：错误 → 原因 → 补少量人工语料）。

背景：手动验证 3 篇漏放暴露语料负样本缺口——anthropic news 公告型（语料 11 篇
anthropic 全 KEEP，零公告负样本）与教科书式 SEO 浅文（GENERIC_TUTORIAL，零代表）。
本脚本把手动验证时已完整读取、类型无争议的 4 篇真实文章作为 REJECT 入库：
  bw-r-348 claude-opus-5 公告      (anthropic, ANNOUNCEMENT_MARKETING, hard_case)
  bw-r-349 claude-sonnet-5 公告    (anthropic, ANNOUNCEMENT_MARKETING)
  bw-r-350 open-weights 立场公告   (anthropic, ANNOUNCEMENT_MARKETING)
  bw-r-351 AI Overview 教科书页    (tutorialspoint, GENERIC_TUTORIAL，新来源)
正文取自生产同路径抽取（Readability+Turndown）的已存档 markdown。跑完须重建 dataset。
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / 'tran' / 'data'

NEW = [
    dict(dataset_id='bw-r-348', url='https://www.anthropic.com/news/claude-opus-5',
         reason='ANNOUNCEMENT_MARKETING', source_id='anthropic', source_name='Anthropic',
         source_type='company', primary_domain='ai-ml', language='en', published_at='2026-08',
         hard_case=True, author='Anthropic',
         title_key='claude-opus-5',
         rationale='完整阅读后确认正文以新模型发布、能力宣传与价格/渠道为主，虽有 benchmark 数字但无机制、实验过程或失败边界说明；手动验证中模型漏放（0.23）的定向纠偏样本，标注 hard_case。'),
    dict(dataset_id='bw-r-349', url='https://www.anthropic.com/news/claude-sonnet-5',
         reason='ANNOUNCEMENT_MARKETING', source_id='anthropic', source_name='Anthropic',
         source_type='company', primary_domain='ai-ml', language='en', published_at='2026-08',
         hard_case=False, author='Anthropic',
         title_key='claude-sonnet-5',
         rationale='模型发布公告：能力宣称与可用渠道为主，缺独立知识增量。'),
    dict(dataset_id='bw-r-350', url='https://www.anthropic.com/news/position-open-weights-models',
         reason='ANNOUNCEMENT_MARKETING', source_id='anthropic', source_name='Anthropic',
         source_type='company', primary_domain='ai-ml', language='en', published_at='2026-07',
         hard_case=False, author='Anthropic',
         title_key='position-open-weights',
         rationale='公司立场/政策公告：陈述自身策略与承诺，非机制解释或一手经验。'),
    dict(dataset_id='bw-r-351', url='https://www.tutorialspoint.com/artificial_intelligence/artificial_intelligence_overview.htm',
         reason='GENERIC_TUTORIAL', source_id='tutorialspoint', source_name='TutorialsPoint',
         source_type='company', primary_domain='ai-ml', language='en', published_at='2026-08',
         hard_case=False, author='TutorialsPoint',
         title_key='tutorialspoint',
         rationale='SEO 教科书式名词页：通用定义罗列，无作者独立经验、实验或观点；手动验证漏放（0.03）暴露该表面类型在负样本中零代表。'),
]

manifest_path = DATA / 'manifest.jsonl'
existing = [json.loads(l) for l in open(manifest_path, encoding='utf-8')]
have_urls = {r['url'].rstrip('/') for r in existing}
samples = {s['url']: s for s in json.load(open(ROOT / 'manual-test-samples.json', encoding='utf-8')) if s.get('text')}

added = []
for item in NEW:
    assert item['dataset_id'] not in {r['dataset_id'] for r in existing}, 'dataset_id 冲突'
    if item['url'].rstrip('/') in have_urls:
        print(f"跳过（URL 已在库）: {item['url']}")
        continue
    sample = next(s for u, s in samples.items() if item['title_key'] in u)
    slug = item['url'].split('/')[-2] if item['url'].endswith('/') else item['url'].split('/')[-1]
    slug = re_slug = ''.join(ch if ch.isalnum() else '-' for ch in slug).lower()[:70]
    rel_path = f"articles/reject/{item['source_type']}/{item['source_id']}/{item['dataset_id']}-{re_slug}.md"
    abs_path = DATA / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    fm = f"""---
dataset_id: "{item['dataset_id']}"
decision: "REJECT"
reason: "{item['reason']}"
source_id: "{item['source_id']}"
source_name: "{item['source_name']}"
source_type: "{item['source_type']}"
primary_domain: "{item['primary_domain']}"
url: "{item['url']}"
canonical_url: "{item['url']}"
title: "{item.get('title') or sample.get('title', '').replace('"', "'")}"
author: "{item['author']}"
published_at: "{item['published_at']}"
language: "{item['language']}"
retrieved_from: "web"
local_original_path: ""
hard_case: {'true' if item['hard_case'] else 'false'}
review_confidence: "high"
manual_review: true
quality_rationale: >
  {item['rationale']} published_at 无页面日期，按检索月份记录。
duplicate_group: ""
reviewed_at: "2026-08-30"
---
"""
    abs_path.write_text(fm + '\n' + sample['text'] + '\n', encoding='utf-8')
    manifest_line = {
        'dataset_id': item['dataset_id'], 'decision': 'REJECT', 'reason': item['reason'],
        'source_id': item['source_id'], 'source_name': item['source_name'],
        'source_type': item['source_type'], 'primary_domain': item['primary_domain'],
        'url': item['url'], 'title': item.get('title') or sample.get('title', ''),
        'language': item['language'], 'published_at': item['published_at'],
        'hard_case': item['hard_case'], 'review_confidence': 'high', 'manual_review': True,
        'path': rel_path.replace('\\', '/'),
    }
    existing.append(manifest_line)
    added.append(item['dataset_id'])
    print(f"入库 {item['dataset_id']} → {rel_path}（{len(sample['text'])} 字符）")

manifest_path.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in existing) + '\n', encoding='utf-8')
print(f'manifest {len(existing)} 行；本次新增 {len(added)}；下一步：python ml/build_dataset.py && python ml/train.py --final')
