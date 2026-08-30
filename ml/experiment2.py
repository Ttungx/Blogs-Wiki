"""第二期纠偏实验（plan §16）：目标=同等 Reject Precision 下提高 Coverage。

相对 v1（char 3-5, LR C=0.25, min_df=5, OOF precision 0.85 / coverage 0.236）的变体矩阵：
  - 正则强度 C ∈ {0.1, 0.25, 0.5}
  - min_df ∈ {2, 5}（稀有判别 n-gram）
  - char ngram (2,5)（中文 bigram）
  - +word 1-2gram（重新验证 v1 结论在更多折下是否稳定）
  - class_weight=balanced（提升 REJECT 召回）
  - title×2（标题权重加倍，公告/主题信号）
  - no-sublinear tf
  - ComplementNB（文本经典基线）
每变体 6 折 source-holdout pooled OOF → precision-coverage 曲线 + Wilson LB。
选择标准（plan §10/§22）：Wilson LB(precision) ≥ 0.85 且 point precision ≥ 0.90 下覆盖最大。
"""
import math
import sys

import numpy as np
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.naive_bayes import ComplementNB
from sklearn.svm import LinearSVC

import train as T

SEEDS = (7, 17, 27, 37, 47, 57)


def make_clf(v):
    if v['clf'] == 'lr':
        return LogisticRegression(C=v['C'], max_iter=2000, solver='liblinear',
                                  class_weight='balanced' if v.get('balanced') else None)
    if v['clf'] == 'cnb':
        return ComplementNB(alpha=0.5)
    if v['clf'] == 'svc':
        return LinearSVC(C=v['C'], max_iter=5000)
    raise ValueError(v['clf'])


def texts_of(train, v):
    if v.get('title2x'):
        return [f"{r['title']}\n\n{r['title']}\n\n{r['text']}" for r in train]
    return [r['full_text'] for r in train]


def oof_scores(train, y, v):
    n = len(train)
    oof = np.full(n, np.nan)
    texts = texts_of(train, v)
    for seed in SEEDS:
        tr, te = T.split_source_holdout(train, y, seed=seed)
        cols = []
        cv = TfidfVectorizer(analyzer=T.char_analyzer, ngram_range=v.get('ngram', (3, 5)),
                             min_df=v['min_df'], sublinear_tf=v.get('sub', True), norm=None)
        if v['clf'] == 'cnb':
            cv.set_params(sublinear_tf=False, binary=True)
        cols.append(cv.fit_transform([texts[i] for i in tr]))
        Xte_c = cv.transform([texts[i] for i in te])
        if v.get('word'):
            wv = TfidfVectorizer(analyzer=T.word_analyzer, min_df=2, sublinear_tf=True, norm=None)
            cols.append(wv.fit_transform([texts[i] for i in tr]))
            Xte_c = hstack([Xte_c, wv.transform([texts[i] for i in te])]).tocsr()
        Xtr = (hstack(cols).tocsr() if v.get('word') else cols[0])
        clf = make_clf(v)
        clf.fit(Xtr, y[tr])
        s = clf.predict_proba(Xte_c)[:, 1] if v['clf'] != 'svc' else clf.decision_function(Xte_c)
        oof[te] = np.nanmax([oof[te], s], axis=0)
    covered = ~np.isnan(oof)
    return oof, covered


def curve(y, s, covered, grid):
    best = None
    for t in grid:
        pred = s >= t
        tp, fp = int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum())
        if tp == 0:
            continue
        prec = tp / (tp + fp)
        lb = T.wilson_lb(tp, tp + fp)
        cov = tp / max(1, int(y.sum()))
        if prec >= 0.90 and lb >= 0.85 and (best is None or cov > best['cov']):
            best = {'t': round(float(t), 3), 'cov': round(cov, 3), 'prec': round(prec, 3), 'lb': round(lb, 3), 'fp': fp}
    return best


def main():
    _, train, _, y = T.load()
    variants = [
        ('v1 基线 LR C=.25 md=5', dict(clf='lr', C=0.25, min_df=5)),
        ('LR C=0.1  md=5', dict(clf='lr', C=0.1, min_df=5)),
        ('LR C=0.5  md=5', dict(clf='lr', C=0.5, min_df=5)),
        ('LR C=0.25 md=2', dict(clf='lr', C=0.25, min_df=2)),
        ('LR C=0.1  md=2', dict(clf='lr', C=0.1, min_df=2)),
        ('LR C=0.25 md=5 ngram(2,5)', dict(clf='lr', C=0.25, min_df=5, ngram=(2, 5))),
        ('LR C=0.25 md=5 +word', dict(clf='lr', C=0.25, min_df=5, word=True)),
        ('LR C=0.25 md=5 balanced', dict(clf='lr', C=0.25, min_df=5, balanced=True)),
        ('LR C=0.25 md=5 title2x', dict(clf='lr', C=0.25, min_df=5, title2x=True)),
        ('LR C=0.25 md=5 noSub', dict(clf='lr', C=0.25, min_df=5, sub=False)),
        ('SVC C=0.25 md=5', dict(clf='svc', C=0.25, min_df=5)),
        ('ComplementNB md=5', dict(clf='cnb', min_df=5)),
    ]
    grid = np.arange(0.15, 0.99, 0.01)
    print(f'{"变体":32s} {"AUC":>6s} {"AP":>6s}  覆盖最大工作点(prec≥0.90, LB≥0.85)')
    for name, v in variants:
        oof, covered = oof_scores(train, y, v)
        auc = roc_auc_score(y[covered], oof[covered])
        ap = average_precision_score(y[covered], oof[covered])
        b = curve(y[covered], oof[covered], covered, grid)
        bs = f"t={b['t']:.2f} cov={b['cov']:.3f} prec={b['prec']:.3f} lb={b['lb']:.3f} fp={b['fp']}" if b else '无满足点'
        print(f'{name:34s} {auc:.4f} {ap:.4f}  {bs}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
