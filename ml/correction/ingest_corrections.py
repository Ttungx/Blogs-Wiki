"""把复核结论中「判定与模型不一致」的样本纠偏入库（plan §19 定向纠偏）。

输入：ml/correction/review-{rejects,boundary,keeps}.jsonl（merge_reviews.py 归一后）
规则：
  - verdict=KEEP  且 model_says=reject → 入库为 KEEP 样本（教模型别误杀）
  - verdict=REJECT 且 model_says=keep  → 入库为 REJECT 样本（教模型补拒）
  - verdict=UNCERTAIN → 不入库，写 ml/correction/uncertain-hold.jsonl 留人工复审
  - verdict 与模型一致 → 不入库（无边界信息增量）
去重：URL 已在 Gold manifest 的跳过；同文 en/zh 双版本只入原文语言版本。
dataset_id 续号；正文取 src/content/articles 工作文件（生产同路径抽取）。
用法：python ml/correction/ingest_corrections.py [--dry]
跑完必须 python ml/build_dataset.py && python ml/train.py --final（主 agent 执行）。
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
DATA = REPO / 'tran' / 'data'
DRY = '--dry' in sys.argv

REVIEW_FILES = ['review-rejects.jsonl', 'review-boundary.jsonl', 'review-keeps.jsonl']
manifest_path = DATA / 'manifest.jsonl'
existing = [json.loads(l) for l in open(manifest_path, encoding='utf-8')]
have_urls = {r['url'].rstrip('/') for r in existing}
max_ids = {}
for r in existing:
    m = re.match(r'bw-([pcr])-(\d+)', r['dataset_id'])
    if m:
        max_ids[m.group(1)] = max(max_ids.get(m.group(1), 0), int(m.group(2)))

# 源注册信息（name/type/domain）取自生产 sources.json
sources = {s['id']: s for s in json.load(open(REPO / 'src' / 'data' / 'sources.json', encoding='utf-8'))}
# Gold 语料已有的 primary_domain 沿用（保持口径一致）
known_domain = {}
for r in existing:
    known_domain.setdefault(r['source_id'], r.get('primary_domain', 'ai-ml'))

rows = []
for name in REVIEW_FILES:
    f = ROOT / name
    if f.exists():
        rows.extend(json.loads(l) for l in f.read_text(encoding='utf-8').splitlines() if l.strip())
hold_rows = [r for r in rows if r.get('verdict') == 'UNCERTAIN']

# plan §19：只入「判定与模型不一致」的纠偏样本（误拒→KEEP，误收→REJECT）；
# 判定一致的样本无边界信息增量，不入。
def is_mismatch(r):
    model_reject = r.get('model_says') == 'reject'
    human_reject = r.get('verdict') == 'REJECT'
    return model_reject != human_reject

rows = [r for r in rows if r.get('verdict') in ('KEEP', 'REJECT') and is_mismatch(r)]

# 同文 en/zh 去重：同一文章双版本落在同 source 下相同 slug 的不同语言目录，
# 按 (source_id, file basename) 分组，优先原文语言版本
groups = {}
for r in rows:
    if r['verdict'] not in ('KEEP', 'REJECT'):
        continue
    base = (r.get('file') or '').replace('\\', '/').split('/')[-1].lower()
    key = (r['source_id'], base)
    groups.setdefault(key, []).append(r)

added, skipped, hold = [], [], []
for key, grp in groups.items():
    pick = None
    for r in grp:
        fm_lang = None
        p = REPO / r['file'] if r.get('file') else None
        if p and p.exists():
            head = p.read_text(encoding='utf-8', errors='replace')[:2000]
            m2 = re.search(r'^original_language:\s*"?([a-z-]+)', head, re.M)
            lang_m = re.search(r'^language:\s*"?([a-z-]+)', head, re.M)
            fm_lang = lang_m.group(1) if lang_m else None
            if m2 and lang_m and m2.group(1) == lang_m.group(1):
                pick = r
                break
    if pick is None:
        pick = grp[0]
    if pick['url'].rstrip('/') in have_urls:
        skipped.append((pick, 'url-already-in-gold'))
        continue
    src_path = REPO / pick['file']
    if not src_path.exists():
        skipped.append((pick, 'work-file-missing'))
        continue
    raw = src_path.read_text(encoding='utf-8', errors='replace')
    m3 = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n?(.*)$', raw, re.S)
    if not m3:
        skipped.append((pick, 'no-frontmatter'))
        continue
    fm = {}
    for line in m3.group(1).split('\n'):
        kv = re.match(r'^([a-z_]+):\s*"?(.*?)"?\s*$', line.strip())
        if kv and kv.group(2):
            fm[kv.group(1)] = kv.group(2)
    body = m3.group(2).strip()
    if len(re.sub(r'\s+', '', body)) < 500:
        skipped.append((pick, 'body-too-short'))
        continue

    src = sources.get(pick['source_id'], {})
    stype = src.get('type', 'company')
    is_reject = pick['verdict'] == 'REJECT'
    if is_reject:
        prefix = 'r'
    elif stype == 'personal':
        prefix = 'p'
    else:
        prefix = 'c'
    max_ids[prefix] = max_ids.get(prefix, 0) + 1
    did = f'bw-{prefix}-{max_ids[prefix]}'
    lang = fm.get('language', 'en')
    if lang not in ('en', 'zh'):
        lang = 'zh' if lang.startswith('zh') else 'en'
    pub = (fm.get('published_at') or '')[:10]
    mismatch = (pick['model_says'] == 'reject') != is_reject
    subtype_dir = 'company' if stype == 'company' else 'personal'
    decision_dir = 'reject' if is_reject else 'keep'
    slug = re.sub(r'[^a-z0-9-]+', '-', pick['url'].rstrip('/').split('/')[-1].lower())[:70]
    rel_path = f'articles/{decision_dir}/{subtype_dir}/{pick["source_id"]}/{did}-{slug}.md'
    abs_path = DATA / rel_path
    reason = pick.get('reason', 'CONTESTED')
    rationale = f"{pick.get('note', '')}（纠偏复核 reviewer={pick.get('reviewer', '?')}，model={pick['model_says']}/score={pick['model_score']:.3f}）"
    fm_text = f"""---
dataset_id: "{did}"
decision: "{pick['verdict']}"
reason: "{reason}"
source_id: "{pick['source_id']}"
source_name: "{src.get('name', pick['source_id'])}"
source_type: "{stype}"
primary_domain: "{known_domain.get(pick['source_id'], 'ai-ml')}"
url: "{pick['url']}"
canonical_url: "{pick['url']}"
title: "{(pick.get('title') or fm.get('title', '')).replace('"', "'")}"
author: "{fm.get('author', src.get('name', ''))}"
published_at: "{pub}"
language: "{lang}"
retrieved_from: "web"
local_original_path: ""
hard_case: {'true' if mismatch else 'false'}
review_confidence: "high"
manual_review: true
quality_rationale: >
  {rationale}
duplicate_group: ""
reviewed_at: "2026-08-30"
---
"""
    if not DRY:
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(fm_text + '\n' + body + '\n', encoding='utf-8')
        existing.append({
            'dataset_id': did, 'decision': pick['verdict'], 'reason': reason,
            'source_id': pick['source_id'], 'source_name': src.get('name', pick['source_id']),
            'source_type': stype, 'primary_domain': known_domain.get(pick['source_id'], 'ai-ml'),
            'url': pick['url'], 'title': pick.get('title') or fm.get('title', ''),
            'language': lang, 'published_at': pub, 'hard_case': mismatch,
            'review_confidence': 'high', 'manual_review': True,
            'path': rel_path.replace('\\', '/'),
        })
    have_urls.add(pick['url'].rstrip('/'))
    added.append((did, pick['verdict'], pick['source_id'], pick['url'][:70]))

if not DRY:
    manifest_path.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in existing) + '\n', encoding='utf-8')

(ROOT / 'uncertain-hold.jsonl').write_text(
    '\n'.join(json.dumps(r, ensure_ascii=False) for r in hold_rows) + '\n', encoding='utf-8')

print(f"{'(dry) ' if DRY else ''}入库 {len(added)}｜跳过 {len(skipped)}｜UNCERTAIN 搁置 {len(hold_rows)}")
for did, v, sid, u in added:
    print(f'  {did} {v:7s} {sid:20s} {u}')
for r, why in skipped:
    print(f'  skip[{why}] {r["url"][:70]}')
print('下一步：python ml/build_dataset.py && python ml/train.py --final')
