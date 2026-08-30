"""针对性纠偏实验（plan §16：错误 → 假设 → 修改 → 重训 → 重验证）。

假设：C=1.0 下模型对长篇个人指南/年度回顾产生 1.0 置信度的 False Reject，
属于对个人成长类表面风格过拟合。更强正则（小 C）应压低自信错误、抬高
高阈值区间的精度。同时试 min_df=2 保留稀有判别 n-gram。
"""
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

import train as T


def oof_curve(train, y, texts, C, min_df, seeds=(7, 17, 27, 37, 47, 57)):
    n = len(train)
    oof = np.full(n, np.nan)
    for seed in seeds:
        tr, te = T.split_source_holdout(train, y, seed=seed)
        cv = TfidfVectorizer(analyzer=T.char_analyzer, min_df=min_df, sublinear_tf=True, norm=None)
        Xtr = cv.fit_transform([texts[i] for i in tr])
        Xte = cv.transform([texts[i] for i in te])
        clf = T.fit_model(Xtr, y[tr], C=C)
        oof[te] = np.nanmax([oof[te], clf.predict_proba(Xte)[:, 1]], axis=0)
    covered = ~np.isnan(oof)
    return oof, covered


def main():
    _, train, _, y = T.load()
    texts = [r['full_text'] for r in train]
    for C, min_df in [(1.0, 3), (0.5, 3), (0.25, 3), (0.1, 3), (0.25, 2), (0.25, 5)]:
        oof, cov = oof_curve(train, y, texts, C, min_df)
        auc = roc_auc_score(y[cov], oof[cov])
        line = [f'C={C:<5} min_df={min_df} AUC={auc:.4f}']
        for t in (0.7, 0.8, 0.9, 0.95):
            pred = oof[cov] >= t
            tp, fp = int((pred & (y[cov] == 1)).sum()), int((pred & (y[cov] == 0)).sum())
            prec = tp / max(1, tp + fp)
            covr = tp / max(1, int(y[cov].sum()))
            line.append(f't{t}: p={prec:.3f} lb={T.wilson_lb(tp, tp+fp):.3f} cov={covr:.3f} fp={fp}')
        print(' | '.join(line))


if __name__ == '__main__':
    main()
