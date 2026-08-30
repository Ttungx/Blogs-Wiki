"""合并 reviewer 结论文件 → 权威三文件 + summary.md。

子 reviewer 写带后缀的文件（review-*.w01a.jsonl 等），w03 直接写过权威名。
合并时 reviewer id 归一（w01a→w01），并核对行数与抽样数（R1=150/R2=60/R3=193）。
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECT = {'rejects': 150, 'boundary': 60, 'keeps': 193}
NORMALIZE = {'w01a': 'w01', 'w01b': 'w01', 'w02a': 'w02', 'w02b': 'w02', 'w05a': 'w05', 'w05b': 'w05'}

for task in EXPECT:
    rows = []
    seen = set()
    # w03 直接写过权威名；子 reviewer 写后缀名
    sources = [ROOT / f'review-{task}.jsonl'] + sorted(ROOT.glob(f'review-{task}.*.jsonl'))
    for f in sources:
        if not f.exists():
            continue
        for line in f.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            d = json.loads(line)
            d['reviewer'] = NORMALIZE.get(d.get('reviewer', ''), d.get('reviewer', ''))
            key = (d['url'], d.get('verdict'))
            if key in seen:
                continue
            seen.add(key)
            rows.append(d)
    out = ROOT / f'review-{task}.jsonl'
    with open(out, 'w', encoding='utf-8') as fh:
        for d in rows:
            fh.write(json.dumps(d, ensure_ascii=False) + '\n')
    cross = Counter((r['verdict'], r['model_says']) for r in rows)
    print(f"{task}: {len(rows)}/{EXPECT[task]} 行" + ('' if len(rows) == EXPECT[task] else f'  ⚠️ 差 {EXPECT[task]-len(rows)}'))
    for k, n in sorted(cross.items()):
        print(f"    {k[0]:9s} × model_{k[1]:6s} = {n}")
    Path(str(out) + '.merged').write_text('ok')
