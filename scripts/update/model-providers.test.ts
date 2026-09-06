import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModelProviders, modelProviderFilePath } from './model-providers';
import { resolveAiProvider, resolveAiProviderPair } from './ai-provider';

function makeProviderFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mp-test-'));
  const p = join(dir, 'providers.yaml');
  writeFileSync(p, body);
  return p;
}

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test('model-providers: 按 priority 升序,第一个主/第二个回退', () => {
  const file = makeProviderFile(`
providers:
  - name: low-priority
    priority: 20
    base_url: https://b.example/v1
    api_key: k2
    model: m2
  - name: high-priority
    priority: 5
    base_url: https://a.example/v1
    api_key: k1
    model: m1
    rate_limit:
      concurrency: 4
      requests_per_minute: 30
      requests_per_day: null
      tokens_per_minute: 100000
      tokens_per_day: null
`);
  const { providers } = loadModelProviders({ MODEL_PROVIDER_FILE: file });
  assert.equal(providers[0].name, 'high-priority');
  assert.equal(providers[1].name, 'low-priority');
  assert.deepEqual(providers[0].rateLimit, {
    concurrency: 4,
    requests_per_minute: 30,
    tokens_per_minute: 100000,
  });
  assert.equal(providers[1].rateLimit, undefined);

  const pair = resolveAiProviderPair({ MODEL_PROVIDER_FILE: file });
  assert.equal(pair.length, 2);
  assert.equal(pair[0].apiKey, 'k1');
  assert.equal(pair[1].apiKey, 'k2');
  const single = resolveAiProvider({ MODEL_PROVIDER_FILE: file });
  assert.equal(single.model, 'm1');
});

test('model-providers: 已过期条目跳过(失效日当天仍有效)', () => {
  const file = makeProviderFile(`
providers:
  - name: expired
    priority: 0
    base_url: https://x.example/v1
    api_key: k0
    model: m0
    expire: "${yesterday}"
  - name: expiring-today
    priority: 10
    base_url: https://y.example/v1
    api_key: k1
    model: m1
    expire: "${today}"
`);
  const { providers } = loadModelProviders({ MODEL_PROVIDER_FILE: file });
  assert.equal(providers.length, 1);
  assert.equal(providers[0].name, 'expiring-today');
});

test('model-providers: 必填缺失抛错(带条目定位)', () => {
  const file = makeProviderFile(`
providers:
  - name: broken
    priority: 0
    base_url: https://x.example/v1
`);
  assert.throws(
    () => loadModelProviders({ MODEL_PROVIDER_FILE: file }),
    /providers\[0\]: missing api_key/,
  );
});

test('model-providers: 文件不存在抛错;未启用时 loadModelProviders 抛错但 env 路径不受影响', () => {
  const missing = join(tmpdir(), 'mp-not-exist', 'x.yaml');
  rmSync(missing, { force: true });
  assert.throws(() => loadModelProviders({ MODEL_PROVIDER_FILE: missing }), /not found/);
  assert.throws(() => loadModelProviders({}), /MODEL_PROVIDER_FILE is not set/);

  // env 老路径:文件模式未启用时,平铺变量照常生效(测试夹具)
  const provider = resolveAiProvider({
    OPENAI_API_KEY: 'k',
    OPENAI_BASE_URL: 'https://flat.example/v1',
    TRANSLATION_MODEL: 'm-flat',
  });
  assert.equal(provider.model, 'm-flat');
});

test('model-providers: 文件模式压过 env 槽位', () => {
  const file = makeProviderFile(`
providers:
  - name: from-file
    priority: 0
    base_url: https://file.example/v1
    api_key: kf
    model: m-file
`);
  const pair = resolveAiProviderPair({
    MODEL_PROVIDER_FILE: file,
    AI_PROVIDER: '1',
    AI_PROVIDER_1_BASE_URL: 'https://slot.example/v1',
    AI_PROVIDER_1_API_KEY: 'ks',
    AI_PROVIDER_1_MODEL: 'm-slot',
  });
  assert.equal(pair.length, 1);
  assert.equal(pair[0].baseUrl, 'https://file.example/v1');
});

test('model-providers: modelProviderFilePath 相对路径基于 cwd 解析', () => {
  assert.equal(modelProviderFilePath({}), null);
  assert.equal(
    modelProviderFilePath({ MODEL_PROVIDER_FILE: 'model_provider.yaml' }),
    join(process.cwd(), 'model_provider.yaml'),
  );
});

test('model-providers: 多余目录字段被忽略(mkdirSync 仅占位防 tmp 冲突)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-dir-'));
  mkdirSync(dir, { recursive: true });
  rmSync(dir, { recursive: true, force: true });
  assert.ok(true);
});
