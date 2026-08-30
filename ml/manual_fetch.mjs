/**
 * 真实样本手动验证（不进训练集）：抓取 → Readability 抽取 → 存档。
 * 用法：node ml/manual_fetch.mjs [索引]  （只打印候选列表时无参数）
 */
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';

// 与生产 fetch.ts 的 HTML→markdown 转换保持一致（门禁吃的是 contentMarkdown）
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

const CANDIDATES = [
  // expect=keep：独立知识价值
  { url: 'https://norvig.com/spell-correct.html', expect: 'keep', why: '经典机制解释（拼写纠正的概率模型+实现+评估）' },
  { url: 'https://norvig.com/lispy.html', expect: 'keep', why: '经典深文（Lisp 解释器实现）' },
  { url: 'https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/', expect: 'keep', why: '经典工程复盘（Netscape 重写教训）' },
  { url: 'http://www.paulgraham.com/avg.html', expect: 'keep', why: 'PG 经典（Beating the Averages，Blub 语言思想）——语料未收' },
  { url: 'https://coolshell.cn/articles/4990.html', expect: 'keep', why: '中文深文（程序员技术练级攻略）' },
  { url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents', expect: 'keep', why: 'AI agent 工程深度' },
  // expect=reject：公告/营销/roundup/浅内容
  { url: 'https://openai.com/index/introducing-gpt-5/', expect: 'reject', why: '产品发布公告' },
  { url: 'https://openai.com/index/chatgpt-agent/', expect: 'reject', why: '产品发布公告' },
  { url: 'https://openai.com/index/gpt-5-new-era-of-work/', expect: 'reject', why: '营销向公告' },
  { url: 'https://www.ruanyifeng.com/blog/2026/08/weekly-issue-409.html', expect: 'reject', why: '周刊 roundup（语料只收了 405/410）' },
  { url: 'https://zapier.com/blog/best-ai-chatbot/', expect: 'reject', why: 'SEO 榜单/带货' },
  { url: 'https://www.geeksforgeeks.org/artificial-intelligence/', expect: 'reject', why: 'SEO 浅教程页' },
  // ── 第二批（扩充验证集，排除偶然性）──
  { url: 'https://www.anthropic.com/news/claude-sonnet-5', expect: 'reject', why: '模型发布公告' },
  { url: 'https://www.anthropic.com/news/position-open-weights-models', expect: 'reject', why: '立场/政策公告' },
  { url: 'https://aws.amazon.com/what-is/artificial-intelligence/', expect: 'reject', why: '云厂商 SEO 名词解释页' },
  { url: 'https://norvig.com/ngrams.html', expect: 'keep', why: '自然语言统计深章（N-grams）' },
  { url: 'https://ciechanow.ski/gears/', expect: 'keep', why: '交互式机制讲解（齿轮）' },
  { url: 'http://www.yinwang.org/blog-cn/2015/11/21/programming-in-math', expect: 'keep', why: '中文编程思想深文（王垠）' },
  { url: 'https://blog.codinghorror.com/parsing-html-the-cthulhu-way/', expect: 'keep', why: '经典工程随笔（HTML 解析）' },
  { url: 'https://www.anthropic.com/news/expanding-support-for-scientists', expect: 'reject', why: '合作/项目公告' },
];

const args = process.argv.slice(2);
const append = args.includes('--append');
const idxArgs = args.filter((a) => !a.startsWith('--'));
const list = idxArgs.length ? CANDIDATES.filter((_, i) => idxArgs.includes(String(i))) : CANDIDATES;
const out = [];
for (const c of list) {
  process.stdout.write(`fetch ${c.url} ... `);
  try {
    const res = await fetch(c.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' }, redirect: 'follow' });
    const html = await res.text();
    if (!res.ok) { console.log(`HTTP ${res.status}`); out.push({ ...c, error: `HTTP ${res.status}` }); continue; }
    const doc = new JSDOM(html, { url: c.url });
    const article = new Readability(doc.window.document.cloneNode(true)).parse();
    if (!article || !article.textContent || article.textContent.length < 500) {
      console.log(`抽取失败（len=${article?.textContent?.length ?? 0}）`);
      out.push({ ...c, error: 'extract-failed' });
      continue;
    }
    const md = turndown.turndown(article.content ?? '');
    console.log(`「${article.title}」${md.length} 字符（markdown）`);
    out.push({ ...c, title: article.title?.trim(), text: md });
  } catch (e) {
    console.log(`ERROR ${e.message}`);
    out.push({ ...c, error: e.message });
  }
}
if (append) {
  const { readFileSync } = await import('node:fs');
  const prev = JSON.parse(readFileSync(new URL('./manual-test-samples.json', import.meta.url), 'utf8'));
  prev.push(...out);
  writeFileSync(new URL('./manual-test-samples.json', import.meta.url), JSON.stringify(prev, null, 1));
  const ok = out.filter((o) => !o.error);
  console.log(`\n追加 ${ok.length}/${out.length}；总计 ${prev.filter((o) => o.text).length} 篇`);
} else if (!idxArgs.length) {
  writeFileSync(new URL('./manual-test-samples.json', import.meta.url), JSON.stringify(out, null, 1));
  const ok = out.filter((o) => !o.error);
  console.log(`\n成功 ${ok.length}/${out.length}；明细在 ml/manual-test-samples.json`);
  for (const o of out) console.log(`  [${o.error ?? 'ok'}] expect=${o.expect} ${o.url}`);
}
