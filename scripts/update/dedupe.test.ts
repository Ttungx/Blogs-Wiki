/**
 * 远端去重预检 + 门禁拒绝上报（dedupe）单元测试。
 *
 * 重点覆盖 fail-open 语义：预检任何失败（HTTP 错误、形状异常、网络抛错、
 * 配置缺失）重试一次后仍返回空集合并告警，绝不阻塞主管线；拒绝上报
 * 单次尝试，失败只告警（丢失靠下轮重报自愈）。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchKnownRemoteUrls, reportRejectedUrls } from './dedupe';
import type { FetchLike, Logger } from './types';

const ENDPOINT = 'https://site.example/api/content-sync/check/';
const ITEMS_ENDPOINT = 'https://site.example/api/content-sync/items/';

interface MockResponse {
  status?: number;
  body?: unknown;
  throw?: Error;
}

interface CapturedCall {
  input: string | URL | Request;
  init?: RequestInit;
}

function makeLogger() {
  const warnings: string[] = [];
  const infos: string[] = [];
  const logger: Logger = {
    info(message) {
      infos.push(message);
    },
    warn(message) {
      warnings.push(message);
    },
    error() {},
  };
  return { logger, warnings, infos };
}

function mockFetch(
  response: MockResponse,
  calls: CapturedCall[],
): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });
    if (response.throw) throw response.throw;
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

/** 依次返回多个预设响应（用尽后重复最后一个）。 */
function mockSequenceFetch(
  responses: MockResponse[],
  calls: CapturedCall[],
): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });
    const response = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (response.throw) throw response.throw;
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

// 不加 as const：urls 必须保持 string[] 才能赋给 RemoteDedupeOptions。
const BASE = {
  endpoint: ENDPOINT,
  token: 'secret-token',
  sourceId: 'some-blog',
  urls: ['https://a.example/1', 'https://a.example/2'],
  retryDelayMs: 1,
};

// ── 读侧：fetchKnownRemoteUrls ───────────────────────

test('正常路径：POST check 接口并返回已存在 URL 集合', async () => {
  const calls: CapturedCall[] = [];
  const { logger } = makeLogger();
  const fetchImpl = mockFetch(
    { body: { existing: [{ sourceId: 'some-blog', url: 'https://a.example/1' }] } },
    calls,
  );

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 1);
  assert.ok(known.has('https://a.example/1'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.input, ENDPOINT);
  const init = calls[0]!.init!;
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), 'Bearer secret-token');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(init.body)), {
    items: [
      { sourceId: 'some-blog', url: 'https://a.example/1' },
      { sourceId: 'some-blog', url: 'https://a.example/2' },
    ],
  });
});

test('瞬时失败重试一次后成功：返回结果', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockSequenceFetch(
    [
      { status: 503 },
      { body: { existing: [{ sourceId: 'some-blog', url: 'https://a.example/2' }] } },
    ],
    calls,
  );

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 1);
  assert.ok(known.has('https://a.example/2'));
  assert.equal(calls.length, 2);
  assert.ok(warnings.some((message) => message.includes('HTTP 503')));
});

test('fail-open：HTTP 非 200 重试后仍失败，返回空集合并告警', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ status: 500 }, calls);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
  assert.equal(calls.length, 2);
  assert.ok(warnings.some((message) => message.includes('HTTP 500')));
  assert.ok(warnings.some((message) => message.includes('continuing unfiltered')));
});

test('fail-open：响应形状异常重试后仍失败，返回空集合并告警', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ body: { nope: true } }, calls);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
  assert.equal(calls.length, 2);
  assert.ok(warnings.some((message) => message.includes('unexpected response shape')));
});

test('fail-open：网络异常重试后仍失败，返回空集合并告警', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ throw: new Error('boom') }, calls);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
  assert.equal(calls.length, 2);
  assert.ok(warnings.some((message) => message.includes('boom')));
});

test('token 缺失：跳过请求直接返回空集合并告警', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({}, calls);

  const known = await fetchKnownRemoteUrls({
    ...BASE,
    token: '',
    fetchImpl,
    logger,
  });

  assert.equal(known.size, 0);
  assert.equal(calls.length, 0);
  assert.ok(warnings.some((message) => message.includes('CONTENT_SYNC_TOKEN is empty')));
});

test('urls 为空或 endpoint 缺失：不发请求', async () => {
  const calls: CapturedCall[] = [];
  const { logger } = makeLogger();
  const fetchImpl = mockFetch({}, calls);

  const emptyUrls = await fetchKnownRemoteUrls({
    ...BASE,
    urls: [],
    fetchImpl,
    logger,
  });
  const noEndpoint = await fetchKnownRemoteUrls({
    ...BASE,
    endpoint: '',
    fetchImpl,
    logger,
  });

  assert.equal(emptyUrls.size, 0);
  assert.equal(noEndpoint.size, 0);
  assert.equal(calls.length, 0);
});

// ── 写侧：reportRejectedUrls ─────────────────────────

const REJECT_BASE = {
  endpoint: ITEMS_ENDPOINT,
  token: 'secret-token',
  sourceId: 'some-blog',
  items: [
    { url: 'https://a.example/junk-1', code: 'content-too-short' },
    { url: 'https://a.example/junk-2', code: 'missing-published-date' },
  ],
};

test('拒绝上报：POST items 端点，body 含 url+code', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ body: { ok: true } }, calls);

  await reportRejectedUrls({ ...REJECT_BASE, fetchImpl, logger });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.input, ITEMS_ENDPOINT);
  const init = calls[0]!.init!;
  assert.equal(init.method, 'POST');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('authorization'), 'Bearer secret-token');
  assert.deepEqual(JSON.parse(String(init.body)), {
    items: [
      { sourceId: 'some-blog', url: 'https://a.example/junk-1', code: 'content-too-short' },
      { sourceId: 'some-blog', url: 'https://a.example/junk-2', code: 'missing-published-date' },
    ],
  });
  assert.equal(warnings.length, 0);
});

test('拒绝上报 fail-open：HTTP 错误只告警不抛出', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ status: 502 }, calls);

  await reportRejectedUrls({ ...REJECT_BASE, fetchImpl, logger });

  assert.equal(calls.length, 1);
  assert.ok(warnings.some((message) => message.includes('HTTP 502')));
});

test('拒绝上报 fail-open：网络异常只告警不抛出', async () => {
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ throw: new Error('network down') }, []);

  await reportRejectedUrls({ ...REJECT_BASE, fetchImpl, logger });

  assert.ok(warnings.some((message) => message.includes('network down')));
});

test('拒绝上报：token 缺失 / items 为空 / endpoint 缺失 均不发请求', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({}, calls);

  await reportRejectedUrls({ ...REJECT_BASE, token: '', fetchImpl, logger });
  await reportRejectedUrls({ ...REJECT_BASE, items: [], fetchImpl, logger });
  await reportRejectedUrls({ ...REJECT_BASE, endpoint: '', fetchImpl, logger });

  assert.equal(calls.length, 0);
  assert.ok(warnings.some((message) => message.includes('CONTENT_SYNC_TOKEN is empty')));
});
