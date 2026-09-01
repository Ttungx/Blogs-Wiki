import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTitle } from '../../src/lib/text';

test('cleanTitle 剥行首 Markdown 标题标记', () => {
  assert.equal(cleanTitle('# Claude在机器人任务上的表现如何？'), 'Claude在机器人任务上的表现如何？');
  assert.equal(cleanTitle('### 三级标题'), '三级标题');
});

test('cleanTitle 剥标签状 token（模型/抓取泄漏）', () => {
  assert.equal(cleanTitle('\u003ctitle>人们向Claude寻求个人指导的方式\u003c/title>'), '人们向Claude寻求个人指导的方式');
  assert.equal(cleanTitle('\u003cthink\u003e...\u003c/think> QwQ-Max-Preview'), '... QwQ-Max-Preview');
});

test('cleanTitle 不伤合法尖括号与正文', () => {
  assert.equal(cleanTitle('Rust vs C++: when a < b'), 'Rust vs C++: when a < b');
  assert.equal(cleanTitle('普通标题'), '普通标题');
});

test('cleanTitle 空白归一', () => {
  assert.equal(cleanTitle('  多   空格\n标题  '), '多 空格 标题');
});
