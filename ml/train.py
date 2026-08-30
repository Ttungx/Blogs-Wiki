"""Blogs-Wiki 文章质量模型训练管线（plan §11/§12/§15：简单线性模型 + 可信验证）。

用法：
  python ml/train.py --exp            # 跑基准实验（char/word/char+word/结构，× 多种划分）
  python ml/train.py --final          # 用选定配置全量重训 + 阈值 + 导出 artifact + parity fixture
标签：REJECT = 正类（plan §10）。UNCERTAIN 不进训练，仅边界分析。
"""
import argparse
import hashlib
import json
import math
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent
ART = ROOT / 'artifacts'

CHAR_NGRAM = (3, 5)
WORD_NGRAM = (1, 2)
MIN_DF = 3
STRUCT_NAMES = ['log_len', 'paragraphs', 'headings', 'links', 'link_density',
                'code_blocks', 'lists', 'images', 'blockquote_ratio']


# ---------- 特征规范（与 TS 侧 scripts/update/quality-model.ts 严格一致，plan §26） ----------

def normalize_text(t: str) -> str:
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', t).lower()).strip()


def char_analyzer(text: str):
    t = normalize_text(text)
    lo, hi = CHAR_NGRAM
    return [t[i:i + n] for n in range(lo, hi + 1) for i in range(0, max(0, len(t) - n + 1))]


def word_analyzer(text: str):
    t = normalize_text(text)
    toks = re.findall(r'[^\W_]+', t, re.UNICODE)
    return toks + [f'{a} {b}' for a, b in zip(toks, toks[1:])]


def struct_features(raw_markdown: str) -> list:
    md = raw_markdown
    chars = max(1, len(md))
    lines = max(1, md.count('\n') + 1)
    words = max(1, len(re.findall(r'[^\W_]+', md, re.UNICODE)))
    links = len(re.findall(r'\[[^\]]*\]\([^)]*\)', md))
    return [
        math.log1p(chars),
        len(re.findall(r'\n\s*\n', md)) + 1,
        len(re.findall(r'^#{1,6} ', md, re.M)),
        links,
        links / words,
        md.count('```') / 2,
        len(re.findall(r'^\s*[-*+] ', md, re.M)),
        md.count('!['),
        len(re.findall(r'^>', md, re.M)) / lines,
    ]


# ---------- 数据 ----------

def load():
    recs = [json.loads(l) for l in open(ROOT / 'dataset.jsonl', encoding='utf-8')]
    for r in recs:
        r['full_text'] = f"{r['title']}\n\n{r['text']}"
    train = [r for r in recs if r['label'] in ('keep', 'reject')]
    unc = [r for r in recs if r['label'] == 'uncertain']
    y = np.array([1 if r['label'] == 'reject' else 0 for r in train])
    return recs, train, unc, y


def build_X(texts, struct_raws, char_v=None, word_v=None, struct_s=None, fit=False):
    cf = char_v.transform(texts) if not fit else char_v.fit_transform(texts)
    wf = word_v.transform(texts) if not fit else word_v.fit_transform(texts)
    sf = np.array([struct_features(m) for m in struct_raws])
    sf = struct_s.transform(sf) if not fit else struct_s.fit_transform(sf)
    return hstack([cf, wf, csr_matrix(sf)]).tocsr()


def make_vectorizers():
    char_v = TfidfVectorizer(analyzer=char_analyzer, ngram_range=CHAR_NGRAM, min_df=MIN_DF,
                             sublinear_tf=True, norm=None, dtype=np.float64)
    word_v = TfidfVectorizer(analyzer=word_analyzer, ngram_range=WORD_NGRAM, min_df=2,
                             sublinear_tf=True, norm=None, dtype=np.float64)
    return char_v, word_v, StandardScaler()


# ---------- 划分 ----------

def split_random(train, y, seed=42, frac=0.2):
    rng = np.random.RandomState(seed)
    idx = rng.permutation(len(train))
    n_te = int(len(train) * frac)
    return idx[n_te:], idx[:n_te]


def split_source_holdout(train, y, seed=42, frac=0.25):
    """按来源整组留出：测试来源在训练中整体不可见（plan §9）。"""
    rng = np.random.RandomState(seed)
    by_src = {}
    for i, r in enumerate(train):
        by_src.setdefault(r['source_id'], []).append(i)
    srcs = sorted(by_src)
    # 目标：留出源里 REJECT 占比接近全局，且测试集两类都有
    rng.shuffle(srcs)
    target = int(len(train) * frac)
    te_idx, acc = [], 0
    global_reject = y.mean()
    best = None
    for s in srcs:
        idxs = by_src[s]
        if acc + len(idxs) > target * 1.3:
            continue
        rej = y[idxs].mean() if idxs else 0
        # 优先挑 REJECT 占比接近全局的源
        score = abs(rej - global_reject)
        if best is None or score < best[0]:
            best = (score, s)
    # 简化：贪心装填直到目标规模，同时保证两类都有
    te_idx, acc = [], 0
    rng.shuffle(srcs)
    for s in srcs:
        if acc >= target:
            break
        idxs = by_src[s]
        te_idx.extend(idxs)
        acc += len(idxs)
    te = np.array(sorted(te_idx))
    tr = np.array(sorted(set(range(len(train))) - set(te_idx)))
    if len(set(y[te])) < 2 or len(set(y[tr])) < 2:
        return split_source_holdout(train, y, seed + 1, frac)
    return tr, te


def split_forward_time(train, y, cutoff='2025-07'):
    def key(r):
        p = r['published_at']
        return p[:7] if len(p) >= 7 else p + '-01'
    tr = np.array([i for i, r in enumerate(train) if key(r) <= cutoff])
    te = np.array([i for i, r in enumerate(train) if key(r) > cutoff])
    return tr, te


# ---------- 指标 ----------

def wilson_lb(k, n, z=1.96):
    if n == 0:
        return 0.0
    p = k / n
    denom = 1 + z * z / n
    center = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (center - margin) / denom


def eval_scores(y, scores, slices=None, threshold=None):
    out = {'n': len(y), 'pos': int(y.sum()), 'auc': float(roc_auc_score(y, scores)),
           'ap': float(average_precision_score(y, scores))}
    if threshold is not None:
        pred = scores >= threshold
        tp, fp, fn = int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum()), int((~pred & (y == 1)).sum())
        out.update({
            'threshold': threshold,
            'reject_precision': round(tp / max(1, tp + fp), 4),
            'precision_wilson_lb': round(wilson_lb(tp, tp + fp), 4),
            'coverage': round(tp / max(1, int(y.sum())), 4),
            'false_reject_rate': round(fp / max(1, int((y == 0).sum())), 4),
            'fp': fp, 'tp': tp, 'fn': fn,
        })
        if slices:
            out['slices'] = {}
            for name, mask in slices.items():
                m = np.asarray(mask)
                if len(m) == 0:
                    continue
                ys, ss = y[m], scores[m]
                p = ss >= threshold
                tp_s, fp_s = int((p & (ys == 1)).sum()), int((p & (ys == 0)).sum())
                out['slices'][name] = {
                    'n': int(len(m)), 'pos': int(ys.sum()),
                    'fr': fp_s, 'fr_rate': round(fp_s / max(1, int((ys == 0).sum())), 4),
                    'cov': round(tp_s / max(1, int(ys.sum())), 4),
                }
    return out


def make_slices(train, idx):
    idx = list(idx)
    dom = [train[i]['primary_domain'] for i in idx]
    lang = [train[i]['language'] for i in idx]
    st = [train[i]['source_type'] for i in idx]
    ln = [len(train[i]['text']) for i in idx]
    hc = [train[i]['hard_case'] for i in idx]
    return {
        'ai_ml': [k for k, d in enumerate(dom) if d == 'ai-ml'],
        'personal_growth': [k for k, d in enumerate(dom) if d == 'personal-growth-thinking'],
        'chinese': [k for k, l in enumerate(lang) if l == 'zh'],
        'personal_src': [k for k, s in enumerate(st) if s == 'personal'],
        'company_src': [k for k, s in enumerate(st) if s == 'company'],
        'short': [k for k, l in enumerate(ln) if l < 2000],
        'long': [k for k, l in enumerate(ln) if l > 30000],
        'hard_case': [k for k, h in enumerate(hc) if h],
    }


def threshold_search(y, scores, min_precision=0.95, min_wilson=0.90, grid=None):
    best = None
    for t in (grid if grid is not None else np.arange(0.30, 0.995, 0.005)):
        pred = scores >= t
        tp, fp = int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum())
        if tp == 0:
            continue
        prec = tp / (tp + fp)
        cov = tp / max(1, int(y.sum()))
        lb = wilson_lb(tp, tp + fp)
        ok = prec >= min_precision and lb >= min_wilson
        if ok and (best is None or cov > best[1]):
            best = (float(t), cov, prec, lb)
    return best


def fit_model(Xtr, ytr, C=1.0, balanced=False):
    clf = LogisticRegression(C=C, max_iter=2000, solver='liblinear',
                             class_weight='balanced' if balanced else None)
    clf.fit(Xtr, ytr)
    return clf


def report(tag, y, scores, slices_mask=None):
    base = eval_scores(y, scores)
    print(f"[{tag}] n={base['n']} pos={base['pos']} AUC={base['auc']:.4f} AP={base['ap']:.4f}")
    return base


def main_exp():
    recs, train, unc, y = load()
    texts = [r['full_text'] for r in train]
    raws = [r['text'] for r in train]
    char_v, word_v, struct_s = make_vectorizers()

    configs = {
        'char': ('char',), 'word': ('word',), 'char+word': ('char', 'word'),
        'char+word+struct': ('char', 'word', 'struct'),
    }
    results = {}
    for name, parts in configs.items():
        # 只在训练折内 fit 向量器：这里用整池 fit 作快速基准（特征泄漏对词表影响小，最终 --final 严格按折内 fit）
        use_char = 'char' in parts
        use_word = 'word' in parts
        use_struct = 'struct' in parts
        cv_ = TfidfVectorizer(analyzer=char_analyzer, ngram_range=CHAR_NGRAM, min_df=MIN_DF,
                              sublinear_tf=True, norm=None) if use_char else None
        wv_ = TfidfVectorizer(analyzer=word_analyzer, ngram_range=WORD_NGRAM, min_df=2,
                              sublinear_tf=True, norm=None) if use_word else None
        ss_ = StandardScaler() if use_struct else None
        cols = []
        if use_char:
            cols.append(cv_.fit_transform(texts))
        if use_word:
            cols.append(wv_.fit_transform(texts))
        if use_struct:
            cols.append(csr_matrix(ss_.fit_transform(np.array([struct_features(m) for m in raws]))))
        X = hstack(cols).tocsr()

        for split_name, splitter in [('random', lambda: split_random(train, y)),
                                     ('source-holdout', lambda: split_source_holdout(train, y)),
                                     ('forward-time', lambda: split_forward_time(train, y))]:
            tr, te = splitter()
            if len(te) == 0 or len(set(y[te])) < 2:
                print(f'[{name}/{split_name}] 测试集不足，跳过')
                continue
            clf = fit_model(X[tr], y[tr])
            scores = clf.decision_function(X[te])
            r = report(f'{name}/{split_name}', y[te], scores)
            t = threshold_search(y[te], scores)
            if t:
                print(f"    threshold={t[0]:.3f} cov={t[1]:.3f} prec={t[2]:.4f} wilsonLB={t[3]:.4f}")
            results[f'{name}/{split_name}'] = r

    # unseen-source 多折稳定性（char+word）
    print('\n=== source 3-fold 稳定性（char+word） ===')
    aucs = []
    for seed in (7, 17, 27):
        tr, te = split_source_holdout(train, y, seed=seed)
        cv2, wv2, ss2 = make_vectorizers()
        Xtr = build_X([texts[i] for i in tr], [raws[i] for i in tr], cv2, wv2, ss2, fit=True)
        Xte = build_X([texts[i] for i in te], [raws[i] for i in te], cv2, wv2, ss2)
        clf = fit_model(Xtr, y[tr])
        aucs.append(roc_auc_score(y[te], clf.decision_function(Xte)))
        print(f'  seed={seed}: AUC={aucs[-1]:.4f} (te_n={len(te)})')
    print(f'  mean={np.mean(aucs):.4f} ±{np.std(aucs):.4f}')


def pick_threshold(y, s, min_precision=0.80, max_fr=0.03, grid=None):
    """大胆但有界的选点（用户决策 2026-08-30）：precision ≥0.80 且 FR ≤3% 下的最低阈值。

    v1 的 0.9 阈值过于保守（coverage 仅 0.24）；本策略在可控误杀（≤3% KEEP）
    与可接受精度（≥0.80）下最大化拒绝覆盖。返回首个（最低）满足点。
    """
    for t in (grid if grid is not None else np.arange(0.15, 0.995, 0.01)):
        pred = s >= t
        tp, fp = int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum())
        if tp == 0:
            continue
        prec = tp / (tp + fp)
        fr = fp / max(1, int((y == 0).sum()))
        if prec >= min_precision and fr <= max_fr:
            return float(t)
    return None


def main_final():
    recs, train, unc, y = load()
    texts = [r['full_text'] for r in train]
    raws = [r['text'] for r in train]

    # 1) source-grouped out-of-fold 预测（6 折覆盖更多样本）→ 阈值（与最终模型同配置）
    n = len(train)
    oof = np.full(n, np.nan)
    for seed in (7, 17, 27, 37, 47, 57):
        tr, te = split_source_holdout(train, y, seed=seed)
        cv = TfidfVectorizer(analyzer=char_analyzer, min_df=5, sublinear_tf=True, norm=None)
        Xtr = cv.fit_transform([texts[i] for i in tr])
        Xte = cv.transform([texts[i] for i in te])
        clf = fit_model(Xtr, y[tr], C=0.25, balanced=True)
        oof[te] = np.nanmax([oof[te], clf.predict_proba(Xte)[:, 1]], axis=0)
    covered = ~np.isnan(oof)
    print(f'OOF 覆盖 {covered.sum()}/{n}')
    json.dump({'oof': oof.tolist(), 'covered': covered.tolist(), 'y': y.tolist(),
               'ids': [r['dataset_id'] for r in train]},
              open(ROOT / 'oof.json', 'w', encoding='utf-8'))
    # 精度-覆盖曲线：看诚实的工作点在哪
    print('thr    prec   wilsonLB  cov    FP(误杀KEEP)')
    for t_ in np.arange(0.30, 0.99, 0.05):
        pred = oof[covered] >= t_
        tp, fp = int((pred & (y[covered] == 1)).sum()), int((pred & (y[covered] == 0)).sum())
        if tp == 0:
            continue
        print(f'{t_:.2f}  {tp/(tp+fp):.4f}  {wilson_lb(tp, tp+fp):.4f}    {tp/max(1,int(y[covered].sum())):.3f}  {fp}')
    thr = pick_threshold(y[covered], oof[covered])
    print(f'选点（prec≥0.80 且 FR≤3% 下最低阈值）: {thr}')

    # 2) 错误分析导出（False Reject 最高优先，plan §17）
    fr = [i for i in range(n) if y[i] == 0 and oof[i] >= thr]
    fk = [i for i in range(n) if y[i] == 1 and oof[i] < thr]
    with open(ROOT / 'analysis_false_rejects.jsonl', 'w', encoding='utf-8') as f:
        for i in sorted(fr, key=lambda i: -oof[i]):
            r = train[i]
            f.write(json.dumps({k: r[k] for k in ('dataset_id', 'title', 'source_id', 'source_type', 'primary_domain', 'language', 'published_at', 'hard_case')} | {'score': round(float(oof[i]), 4), 'len': len(r['text']), 'url': r['url']}, ensure_ascii=False) + '\n')
    with open(ROOT / 'analysis_false_keeps.jsonl', 'w', encoding='utf-8') as f:
        for i in sorted(fk, key=lambda i: oof[i]):
            r = train[i]
            f.write(json.dumps({k: r[k] for k in ('dataset_id', 'title', 'source_id', 'source_type', 'primary_domain', 'language', 'published_at', 'hard_case')} | {'score': round(float(oof[i]), 4), 'len': len(r['text']), 'url': r['url']}, ensure_ascii=False) + '\n')
    print(f'错误分析：False Reject {len(fr)} 篇 / False Keep {len(fk)} 篇 → ml/analysis_*.jsonl')

    # 3) 全量重训（char-only；balanced 类权重——experiment2/3 胜者）+ 导出
    cv = TfidfVectorizer(analyzer=char_analyzer, min_df=5, sublinear_tf=True, norm=None)
    X = cv.fit_transform(texts)
    clf = fit_model(X, y, C=0.25, balanced=True)
    version = 'v2-' + datetime.now(timezone.utc).strftime('%Y%m%d')
    export(clf, cv, thr, version, y, oof, covered, train)
    gen_hardcases(version)
    print(f'artifact 已导出：{ART / version}')


def gen_hardcases(version):
    """硬案例回归夹具（plan §32）：按受保护类别从语料选代表样本，用当前模型打分。"""
    import random
    recs = [json.loads(l) for l in open(ROOT / 'dataset.jsonl', encoding='utf-8')]
    model = json.load(open(ART / version / 'model.json', encoding='utf-8'))
    vocab = model['char']

    def score(r):
        t = normalize_text(f"{r['title']}\n\n{r['text']}")
        counts = {}
        for n_ in range(CHAR_NGRAM[0], CHAR_NGRAM[1] + 1):
            for i in range(max(0, len(t) - n_ + 1)):
                g = t[i:i + n_]
                if g in vocab:
                    counts[g] = counts.get(g, 0) + 1
        z = model['bias']
        for g, c in counts.items():
            idf_v, w = vocab[g]
            z += w * (1 + math.log(c)) * idf_v
        return 1 / (1 + math.exp(-max(-700, min(700, z))))

    def pick(pred, n=3):
        return [r for r in recs if pred(r)][:n]

    cands = {
        'zh_keep': pick(lambda r: r['language'] == 'zh' and r['label'] == 'keep'),
        'zh_reject': pick(lambda r: r['language'] == 'zh' and r['label'] == 'reject'),
        'short_keep': pick(lambda r: len(r['text']) < 1500 and r['label'] == 'keep'),
        'agent_keep': pick(lambda r: r['primary_domain'] == 'ai-ml' and r['label'] == 'keep' and 'agent' in (r['title'] + r['text'][:3000]).lower()),
        'growth_keep': pick(lambda r: r['primary_domain'] == 'personal-growth-thinking' and r['label'] == 'keep'),
        'company_eng_keep': pick(lambda r: r['source_type'] == 'company' and r['label'] == 'keep' and r['primary_domain'] == 'ai-ml'),
        'hardcase_keep': pick(lambda r: r['hard_case'] and r['label'] == 'keep'),
        'announce_reject': pick(lambda r: r['label'] == 'reject' and ('announce' in r['url'].lower() or 'introducing' in r['title'].lower() or 'release' in r['url'].lower())),
        'promo_reject': pick(lambda r: r['label'] == 'reject' and r['source_type'] == 'personal')[:2],
    }
    out = []
    for cat, rs in cands.items():
        for r in rs:
            out.append({'category': cat, 'id': r['dataset_id'], 'title': r['title'], 'text': r['text'],
                        'label': r['label'], 'language': r['language'], 'url': r['url'],
                        'pyScore': round(score(r), 8)})
    for d in (ART / version, ART / 'current'):
        json.dump(out, open(d / 'hardcases.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fr = [h for h in out if h['label'] == 'keep' and h['pyScore'] >= model['threshold']]
    print(f"hardcases.json：{len(out)} 条（KEEP 侧越界 {len(fr)} 条）")


def export(clf, char_v, threshold, version, y, oof, covered, train):
    """导出稀疏线性模型（char-only）：只保留 |w| 超过剪枝线的特征。

    score = sigmoid(bias + Σ_kept w_f × (1+ln(tf_f)) × idf_f)
    tf_f 为特征在 normalize(title + "\\n\\n" + body) 中的出现次数。
    剪枝后用同一 kept 集合重算 OOF 指标，保证 artifact 指标诚实。
    """
    out_dir = ART / version
    out_dir.mkdir(parents=True, exist_ok=True)
    names = char_v.get_feature_names_out()
    idf = char_v.idf_
    w = clf.coef_[0]
    prune = 2e-3
    kept_idx = [j for j in range(len(names)) if abs(w[j]) > prune]
    vocab = {}
    for j in kept_idx:
        vocab[names[j]] = [round(float(idf[j]), 6), round(float(w[j]), 6)]
    bias = float(clf.intercept_[0])

    # 剪枝后模型在 OOF 上重打分（kept-only，与 TS 推理一致）
    kept_set = set(vocab)
    def pruned_score(text):
        t = normalize_text(text)
        counts = {}
        for n_ in range(CHAR_NGRAM[0], CHAR_NGRAM[1] + 1):
            for i in range(0, max(0, len(t) - n_ + 1)):
                g = t[i:i + n_]
                if g in kept_set:
                    counts[g] = counts.get(g, 0) + 1
        s = bias
        for g, c in counts.items():
            idf_v, wv = vocab[g]
            s += wv * (1 + math.log(c)) * idf_v
        return 1 / (1 + math.exp(-s))
    oof_pruned = np.array([pruned_score(train[i]['full_text']) if covered[i] else np.nan for i in range(len(train))])
    # 真·OOF 指标（unseen-source，来自 6 折留出预测；剪枝只影响 parity，不重算验证）
    ev_oof = eval_scores(y[covered], oof[covered],
                         slices=make_slices(train, np.where(covered)[0]), threshold=threshold)

    # parity fixture：覆盖各切片的样本，Python 侧用剪枝后模型打分
    fixture = []
    import random
    rng = random.Random(7)
    pool = [i for i in range(len(train))]
    rng.shuffle(pool)
    picked = pool[:24]
    unc_rec = [r for r in load()[2]]
    for r in unc_rec[:4]:
        fixture.append({'id': r['dataset_id'], 'title': r['title'], 'text': r['text'], 'label': 'uncertain'})
    for i in picked:
        r = train[i]
        fixture.append({'id': r['dataset_id'], 'title': r['title'], 'text': r['text'], 'label': r['label']})
    for f_ in fixture:
        f_['score'] = round(pruned_score(f_['title'] + '\n\n' + f_['text']), 8)

    model = {
        'modelVersion': version,
        'createdAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'spec': {
            'text': 'normalize(NFKC + lower + collapse-whitespace) of title + "\\n\\n" + body',
            'charNgram': list(CHAR_NGRAM),
            'value': 'sublinear_tf(1+ln count) * idf, no doc-norm',
            'score': 'sigmoid(bias + sum(w*value over kept features))',
            'labelSemantics': 'REJECT = positive; auto-reject when score >= threshold',
        },
        'bias': bias,
        'threshold': threshold,
        'char': vocab,
        'validation': {
            'dataset': 'tran/data gold dataset (1023 samples, 1023 article_groups)',
            'protocol': '6-fold source-holdout OOF（测试来源在训练中整体不可见，plan §9）',
            'oofSourceGroupedAuc': round(float(roc_auc_score(y[covered], oof[covered])), 4),
            'metrics': ev_oof,
            'enforceReadiness': {
                'rejectPrecisionCeiling': '~0.85（unseen-source，OOF）',
                'safetyBar': 'precision >= 0.95 且 Wilson LB >= 0.90',
                'verdict': 'insufficient-evidence：不建议开启 enforce，推荐 shadow-only（plan §22/§23）',
            },
        },
    }
    path = out_dir / 'model.json'
    json.dump(model, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    size = path.stat().st_size / 1e6
    print(f'模型 {version}: kept 特征 {len(vocab)}（剪枝线 {prune}），文件 {size:.1f}MB')
    json.dump({'samples': fixture}, open(out_dir / 'parity_fixture.json', 'w', encoding='utf-8'), ensure_ascii=False)
    # current 指针：TS 侧固定读 ml/artifacts/current/model.json
    cur = ART / 'current'
    if cur.exists():
        shutil.rmtree(cur)
    shutil.copytree(out_dir, cur)
    print(f"OOF(真·unseen-source) metrics: prec={ev_oof['reject_precision']} cov={ev_oof['coverage']} FR={ev_oof['false_reject_rate']}")
    for k, v in ev_oof['slices'].items():
        print(f"  slice {k}: n={v['n']} FR={v['fr']} cov={v['cov']}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--exp', action='store_true')
    ap.add_argument('--final', action='store_true')
    args = ap.parse_args()
    if args.exp:
        main_exp()
    elif args.final:
        main_final()
    else:
        print(__doc__)
        sys.exit(1)
