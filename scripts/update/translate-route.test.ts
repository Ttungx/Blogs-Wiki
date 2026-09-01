/**
 * routeTranslator 路由测试：英文短文走 V1 整篇；官方中文 / CJK 占比过半正文
 * 直通 V2 passthrough（仅分类 1 次请求，不再白耗整篇翻译）；forceV2 与超长
 * 兜底走 V2 分块。只验证路由决策，不触网。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SUPER_LONG_THRESHOLD, routeTranslator } from './translate';
import type { ExtractedArticle, TranslateArticle, TranslationResult } from './types';

function article(overrides: Partial<ExtractedArticle> = {}): ExtractedArticle {
  return {
    url: 'https://example.com/post-1/',
    title: 'A fine title',
    publishedAt: '2026-08-01',
    originalLanguage: 'en',
    contentMarkdown: 'Hello world, this is an English article body.',
    ...overrides,
  };
}

function result(model: string): TranslationResult {
  return {
    translatedTitle: '译题',
    categories: [],
    contentMarkdown: '正文',
    model,
  };
}

function makePair() {
  const calls: string[] = [];
  const v1: TranslateArticle = async () => {
    calls.push('v1');
    return result('v1');
  };
  const v2: TranslateArticle = async () => {
    calls.push('v2');
    return result('v2');
  };
  return { calls, v1, v2 };
}

test('短英文正文走 V1 整篇', async () => {
  const { calls, v1, v2 } = makePair();
  await routeTranslator(v1, v2, false)(article(), ['ai']);
  assert.deepEqual(calls, ['v1']);
});

test('官方中文直通 V2 passthrough', async () => {
  const { calls, v1, v2 } = makePair();
  await routeTranslator(v1, v2, false)(
    article({ contentSource: 'official-zh', contentMarkdown: '这是官方中文版本的正文内容。' }),
    ['ai'],
  );
  assert.deepEqual(calls, ['v2']);
});

test('原生中文正文（CJK 占比过半）直通 V2 passthrough', async () => {
  const { calls, v1, v2 } = makePair();
  await routeTranslator(v1, v2, false)(
    article({
      originalLanguage: 'zh',
      contentMarkdown: '这是一篇纯中文的文章正文，讨论的是机器学习与工程实践中的取舍，以及长期主义的思考。',
    }),
    ['ai'],
  );
  assert.deepEqual(calls, ['v2']);
});

test('forceV2 强制全部分块', async () => {
  const { calls, v1, v2 } = makePair();
  await routeTranslator(v1, v2, true)(article(), ['ai']);
  assert.deepEqual(calls, ['v2']);
});

test('超长英文兜底走 V2 分块', async () => {
  const { calls, v1, v2 } = makePair();
  await routeTranslator(v1, v2, false)(
    article({ contentMarkdown: 'a'.repeat(SUPER_LONG_THRESHOLD + 1) }),
    ['ai'],
  );
  assert.deepEqual(calls, ['v2']);
});
