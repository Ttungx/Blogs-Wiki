"""把 shadow 打分记录与本地文章文件对齐，生成复核索引 + 规则初筛标记。

输出 ml/correction/index.jsonl：每行 = 一篇待复核文章的完整上下文
  {source_id, url, title, language, file, score, wouldReject, chars,
   headings, links, code_blocks, flags: [..], }

flags（规则初筛，仅供排优先级，不代替人工阅读）：
  skeleton   空小节骨架（≥2 个相邻空标题节）
  too_short  正文 < 800 字符
  index_like URL 是列表/索引页形态（/posts、/blog、/news 等结尾）
  weird_date published_at 年份 < 2019-01-01 但来源为公司源（窗口外应为 REJECT 不在盘）或解析异常
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARTICLES = ROOT.parent / 'src' / 'content' / 'articles'
OUT_DIR = ROOT / 'correction'
OUT_DIR.mkdir(exist_ok=True)

INDEX_FLAGS = re.compile(r'/(posts|blog|news|archive|archives|categories?|tags?|index|feed|updates?)/?$')


def walk(md_dir):
    out = []
    for p in md_dir.rglob('*.md'):
        out.append(p)
    return out


def parse_fm(path):
    raw = path.read_text(encoding='utf-8', errors='replace')
    m = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n?(.*)$', raw, re.S)
    if not m:
        return {}, raw
    fm = {}
    for line in m.group(1).split('\n'):
        kv = re.match(r'^([a-z_]+):\s*"?(.*?)"?\s*$', line.strip())
        if kv and kv.group(2):
            fm[kv.group(1)] = kv.group(2)
    return fm, m.group(2)


def body_flags(body):
    flags = []
    lines = body.split('\n')
    # 空小节骨架：连续标题节内无正文
    empty_sections = 0
    in_section = False
    section_empty = True
    for ln in lines:
        if re.match(r'^#{1,6} ', ln):
            if in_section and section_empty:
                empty_sections += 1
            in_section, section_empty = True, True
        elif ln.strip() and in_section:
            section_empty = False
    if in_section and section_empty:
        empty_sections += 1
    if empty_sections >= 2:
        flags.append('skeleton')
    if len(re.sub(r'\s+', '', body)) < 800:
        flags.append('too_short')
    return flags, body


def main():
    # url → file 索引（slug 兜底：发现 URL 与落盘 canonical URL 可能存在
    # /cn/ 前缀、en/zh 版本差异，精确匹配不上时按末段 slug 匹配）
    url_map = {}
    slug_map = {}
    for p in walk(ARTICLES):
        fm, _ = parse_fm(p)
        u = fm.get('original_url')
        if u:
            key = u.rstrip('/')
            url_map[key] = (p, fm)
            slug_map.setdefault(key.rstrip('/').split('/')[-1].lower(), (p, fm))
    records = []
    for g in (1, 2, 3, 4):
        f = ROOT / f'shadow-scores-g{g}.jsonl'
        if f.exists():
            for line in f.read_text(encoding='utf-8').splitlines():
                if line.strip():
                    records.append(json.loads(line))
    rows = []
    for r in records:
        key = r['url'].rstrip('/')
        hit = url_map.get(key) or slug_map.get(key.split('/')[-1].lower())
        if not hit:
            rows.append({**r, 'source_id': r['sourceId'], 'url': r['url'], 'title': r.get('title', ''),
                         'file': None, 'flags': ['missing_file'], 'chars': 0, 'links': 0,
                         'language': ''})
            continue
        path, fm = hit
        body = Path(path).read_text(encoding='utf-8', errors='replace')
        fm2, body_text = parse_fm(path)
        flags, body_text = body_flags(body_text)
        if INDEX_FLAGS.search(re.sub(r'/+#.*$', '', r['url'])):
            flags.append('index_like')
        pub = fm2.get('published_at', '')
        ym = re.match(r'(20\d\d)', pub)
        if ym and int(ym.group(1)) < 2019:
            src_type = 'company'
            try:
                src_type = next(s['type'] for s in json.load(open(ROOT.parent / 'src' / 'data' / 'sources.json', encoding='utf-8')) if s['id'] == r['sourceId'])
            except StopIteration:
                pass
            if src_type == 'company':
                flags.append('outside_window')
            elif pub.startswith(('2001', '2000', '1970')):
                flags.append('weird_date')
        rows.append({
            'source_id': r['sourceId'], 'url': r['url'], 'title': r.get('title', ''),
            'language': fm2.get('language', ''), 'file': str(path.relative_to(ROOT.parent)).replace('\\', '/'),
            'score': r['score'], 'wouldReject': r['wouldReject'],
            'chars': len(re.sub(r'\s+', '', body_text)),
            'links': body_text.count(']('),
            'flags': flags,
        })
    with open(OUT_DIR / 'index.jsonl', 'w', encoding='utf-8') as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + '\n')

    from collections import Counter
    by_src = Counter(r['source_id'] for r in rows)
    wr = sum(1 for r in rows if r['wouldReject'])
    band = sum(1 for r in rows if 0.30 <= r['score'] < 0.67 and not r['wouldReject'])
    flagged = Counter(f for r in rows for f in r['flags'])
    print(f'索引 {len(rows)} 条 → ml/correction/index.jsonl')
    print(f'wouldReject={wr}｜边界带(0.30-0.67 keep)={band}｜规则命中: {dict(flagged)}')
    print('各源条数（分片用）:')
    for sid, n in by_src.most_common():
        w = sum(1 for r in rows if r['source_id'] == sid and r['wouldReject'])
        b = sum(1 for r in rows if r['source_id'] == sid and 0.30 <= r['score'] < 0.67 and not r['wouldReject'])
        print(f'  {sid:24s} 共{n:5d}｜wouldReject {w:4d}｜边界带 {b:4d}')


if __name__ == '__main__':
    main()
