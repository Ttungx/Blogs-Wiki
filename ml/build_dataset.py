"""从 tran/data Gold Dataset 构建训练数据集。

输出 ml/dataset.jsonl：每行一个样本
  {dataset_id, label, source_id, source_type, primary_domain, language,
   published_at, hard_case, url, title, group_id, text}

泄漏分组（plan §7 硬约束）：同一 group 绝不能同时进 Train/Test。
group 由两类键 union-find 得出：
  1) 规范化 URL（host+path，去掉 scheme/www/末斜杠/fragment）
  2) 规范化正文哈希（NFKC + 小写 + 空白折叠后 sha1）——抓同文异 URL、slug 漂移
"""
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / 'tran' / 'data'


def normalize_text(t: str) -> str:
    t = unicodedata.normalize('NFKC', t).lower()
    return re.sub(r'\s+', ' ', t).strip()


def norm_url(u: str) -> str:
    u = re.match(r'https?://([^/]+)(/[^?#]*)?', u or '')
    if not u:
        return ''
    host, path = u.group(1).lower(), u.group(2) or '/'
    if host.startswith('www.'):
        host = host[4:]
    return host + path.rstrip('/')


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def main() -> None:
    rows = [json.loads(l) for l in open(DATA / 'manifest.jsonl', encoding='utf-8')]
    uf = UF()
    recs = []
    for r in rows:
        path = DATA / r['path']
        raw = path.read_text(encoding='utf-8')
        m = re.match(r'^---\r?\n.*?\r?\n---\r?\n?', raw, re.S)
        body = raw[m.end():] if m else raw
        rec = {
            'dataset_id': r['dataset_id'],
            'label': r['decision'].lower(),
            'source_id': r['source_id'],
            'source_type': r['source_type'],
            'primary_domain': r.get('primary_domain', ''),
            'language': r.get('language', ''),
            'published_at': r.get('published_at', ''),
            'hard_case': bool(r.get('hard_case')),
            'url': r['url'],
            'title': r.get('title', ''),
            'text': body.strip(),
        }
        recs.append(rec)
        nu, bh = norm_url(rec['url']), hashlib.sha1(normalize_text(rec['text']).encode()).hexdigest()
        rec['_nu'], rec['_bh'] = nu, bh
        uf.union('u:' + nu, 'u:' + nu)
        uf.union('h:' + bh, 'h:' + bh)
        if nu:
            uf.union('u:' + nu, 'h:' + bh)  # 同 URL 与同正文互连

    # 标题+语言 之外的跨语言同文检测：规范化标题相同即并入同组（保守：仅当正文哈希不同但标题相同）
    by_title = defaultdict(list)
    for rec in recs:
        by_title[normalize_text(rec['title'])].append(rec)
    for recs_t in by_title.values():
        if len(recs_t) > 1:
            base = recs_t[0]
            for other in recs_t[1:]:
                uf.union('h:' + base['_bh'], 'h:' + other['_bh'])

    groups = {}
    out = open(ROOT / 'dataset.jsonl', 'w', encoding='utf-8')
    for rec in recs:
        gid = 'g' + hashlib.sha1(uf.find('h:' + rec['_bh']).encode()).hexdigest()[:12]
        rec.pop('_nu'), rec.pop('_bh')
        rec['group_id'] = gid
        groups.setdefault(gid, []).append(rec['dataset_id'])
        out.write(json.dumps(rec, ensure_ascii=False) + '\n')
    out.close()

    multi = {g: ids for g, ids in groups.items() if len(ids) > 1}
    print(f'样本 {len(recs)}｜group {len(groups)}｜多成员组 {len(multi)}')
    for g, ids in list(multi.items())[:15]:
        members = []
        for i in ids:
            r = next(x for x in recs if x['dataset_id'] == i)
            members.append(f"{i}({r['label'][:4]},{r['language']},{r['url'][:40]})")
        print('  ' + ' | '.join(members))
    # 跨语言同组（翻译副本检测）
    cross_lang = 0
    for g, ids in multi.items():
        ls = {next(x for x in recs if x['dataset_id'] == i)['language'] for i in ids}
        if len(ls) > 1:
            cross_lang += 1
    print(f'跨语言同组（疑似翻译副本）: {cross_lang}')
    # 分布概览
    lab = Counter(r['label'] for r in recs)
    print('标签:', dict(lab))
    both = [s for s, c in Counter(r['source_id'] for r in recs).items()]
    mixed = [s for s in both if len({r['label'] for r in recs if r['source_id'] == s}) > 1]
    print(f'来源 {len(both)} 个，其中 KEEP/REJECT 混合来源 {len(mixed)} 个（grouped split 需关注）')


if __name__ == '__main__':
    sys.exit(main())
