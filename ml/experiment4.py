"""v3 排查：纠偏样本入库后 OOF 曲线下移。分离「评估集变难」与「模型真退化」。"""
import json
import numpy as np
from sklearn.metrics import roc_auc_score
import train as T
import experiment2
experiment2.SEEDS = (7, 17, 27)
from experiment2 import oof_scores

def curve(y, oof, cov, tag):
    auc = roc_auc_score(y[cov], oof[cov])
    parts = []
    for t in (0.6, 0.75, 0.9):
        pred = oof[cov] >= t
        tp, fp = int((pred & (y[cov]==1)).sum()), int((pred & (y[cov]==0)).sum())
        if tp: parts.append(f't{t}: p={tp/(tp+fp):.2f} cov={tp/max(1,int(y[cov].sum())):.2f} FR={fp/max(1,int((y[cov]==0).sum())):.3f}')
    print(f'{tag:20s} AUC={auc:.4f} | ' + ' | '.join(parts), flush=True)

_, train_new, _, y_new = T.load()
texts_new = [r['full_text'] for r in train_new]

oof, cov = oof_scores(train_new, y_new, dict(clf='lr', C=0.25, min_df=5))
curve(y_new, oof, cov, 'NEW C=0.25')

rev_urls = set()
for f in ('review-rejects.jsonl', 'review-boundary.jsonl', 'review-keeps.jsonl'):
    for l in open(f'correction/{f}', encoding='utf-8'):
        if l.strip():
            rev_urls.add(json.loads(l)['url'].rstrip('/'))
rows = [json.loads(l) for l in open('dataset.jsonl', encoding='utf-8')]
old_train = [r for r in rows if r['url'].rstrip('/') not in rev_urls and r['label'] in ('keep', 'reject')]
for r in old_train:
    r['full_text'] = r['title'] + '\n\n' + r['text']
old_y = np.array([1 if r['label'] == 'reject' else 0 for r in old_train])
print(f'旧语料对照 n={len(old_train)}')
oof, cov = oof_scores(old_train, old_y, dict(clf='lr', C=0.25, min_df=5))
curve(old_y, oof, cov, 'OLD C=0.25')
