import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const url = env.CONTENT_SYNC_URL;
const token = env.CONTENT_SYNC_TOKEN;
const d = JSON.parse(readFileSync('ml/.tmp-import-articles.json', 'utf8').trim());
const { articles: arts, sources } = d;

async function post(n) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sources, articles: arts.slice(0, n) }) });
  const text = await res.text();
  return [res.status, text.slice(0, 200)];
}

let lo = 0, hi = arts.length;
while (lo + 1 < hi) {
  const mid = (lo + hi) >> 1;
  const [code, msg] = await post(mid);
  const ok = code < 400;
  console.log(`n=${mid}: HTTP ${code}${ok ? ' OK' : ' FAIL ' + msg}`);
  if (ok) lo = mid; else hi = mid;
}
const [code, msg] = await post(hi);
console.log(`首个失败文章 #${hi}/${arts.length}: ${arts[hi].sourceId} ${arts[hi].originalUrl.slice(0, 70)}`);
console.log('详情:', msg);
