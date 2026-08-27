/**
 * 远端去重预检（dedupe.fetchKnownRemoteUrls）单元测试。
 *
 * 重点覆盖 fail-open 语义：任何失败（HTTP 错误、形状异常、网络抛错、
 * 配置缺失）都返回空集合并告警，绝不阻塞主管线。
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchKnownRemoteUrls } from './dedupe';
import type { FetchLike, Logger } from './types';

const ENDPOINT = 'https://site.example/api/content-sync/check/';

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
  const logger: Logger = {
    info() {},
    warn(message) {
      warnings.push(message);
    },
    error() {},
  };
  return { logger, warnings };
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

// 不加 as const：urls 必须保持 string[] 才能赋给 RemoteDedupeOptions。
const BASE = {
  endpoint: ENDPOINT,
  token: 'secret-token',
  sourceId: 'some-blog',
  urls: ['https://a.example/1', 'https://a.example/2'],
};

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

test('fail-open：HTTP 非 200 返回空集合并告警', async () => {
  const calls: CapturedCall[] = [];
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ status: 500 }, calls);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
  assert.equal(calls.length, 1);
  assert.ok(warnings.some((message) => message.includes('HTTP 500')));
});

test('fail-open：响应形状异常返回空集合并告警', async () => {
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ body: { nope: true } }, []);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
  assert.ok(warnings.some((message) => message.includes('unexpected response shape')));
});

test('fail-open：网络异常返回空集合并告警', async () => {
  const { logger, warnings } = makeLogger();
  const fetchImpl = mockFetch({ throw: new Error('boom') }, []);

  const known = await fetchKnownRemoteUrls({ ...BASE, fetchImpl, logger });

  assert.equal(known.size, 0);
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
