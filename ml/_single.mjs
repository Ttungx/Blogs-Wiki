import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const url = env.CONTENT_SYNC_URL;
const token = env.CONTENT_SYNC_TOKEN;
const d = JSON.parse(readFileSync('ml/.tmp-import-articles.json', 'utf8').trim());
const art = d.articles[40];
async function try_(label, articles) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sources: d.sources, articles }) });
  const text = await res.text();
  console.log(`${label}: HTTP ${res.status} ${text.slice(0, 90)}`);
}
await try_(`全文 ${art.id}`, [art]);
await try_(`仅en ${art.id}`, [{ ...art, versions: art.versions.filter((v) => v.language === 'en') }]);
await try_(`仅zh ${art.id}`, [{ ...art, versions: art.versions.filter((v) => v.language === 'zh-cn') }]);
