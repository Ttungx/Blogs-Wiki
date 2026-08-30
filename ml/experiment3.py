"""组合实验：balanced × word × C × title2x（6 折 source-holdout pooled OOF）。
选点标准：precision ≥ 0.85 且 FR ≤ 2% 下 coverage 最大（同时报告 LB）。"""
import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score
import train as T
from experiment2 import oof_scores

_, train, _, y = T.load()
variants = [
    ('v1 基线',                 dict(clf='lr', C=0.25, min_df=5)),
    ('balanced',                dict(clf='lr', C=0.25, min_df=5, balanced=True)),
    ('balanced +word',          dict(clf='lr', C=0.25, min_df=5, balanced=True, word=True)),
    ('balanced C=0.1',          dict(clf='lr', C=0.1, min_df=5, balanced=True)),
    ('balanced title2x',        dict(clf='lr', C=0.25, min_df=5, balanced=True, title2x=True)),
    ('balanced +word C=0.1',    dict(clf='lr', C=0.1, min_df=5, balanced=True, word=True)),
    ('balanced +word title2x',  dict(clf='lr', C=0.25, min_df=5, balanced=True, word=True, title2x=True)),
]
print(f'{"变体":26s} {"AUC":>6s} {"AP":>6s}   prec-coverage 曲线（t: prec/lb/cov/FP率）')
for name, v in variants:
    oof, covered = oof_scores(train, y, v)
    auc = roc_auc_score(y[covered], oof[covered]); ap = average_precision_score(y[covered], oof[covered])
    parts = []
    for t in (0.9, 0.75, 0.6, 0.5, 0.4):
        pred = oof[covered] >= t
        tp, fp = int((pred & (y[covered]==1)).sum()), int((pred & (y[covered]==0)).sum())
        if tp == 0: continue
        prec = tp/(tp+fp); cov = tp/max(1,int(y[covered].sum()))
        fr = fp/max(1,int((y[covered]==0).sum()))
        parts.append(f'{t:.2f}: {prec:.2f}/{T.wilson_lb(tp,tp+fp):.2f}/{cov:.2f}/FR{fr:.3f}')
    print(f'{name:28s} {auc:.4f} {ap:.4f}   ' + ' | '.join(parts), flush=True)
