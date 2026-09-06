import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModelProviders, modelProviderFilePath } from './model-providers';
import { resolveAiProvider, resolveAiProviderChain } from './ai-provider';

function makeProviderFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mp-test-'));
  const p = join(dir, 'providers.yaml');
  writeFileSync(p, body);
  return p;
}

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test('model-providers: 多模型扁平化按 priority 全局排序,组成回退链', () => {
  const file = makeProviderFile(`
providers:
- name: beta
  base_url: https://b.example/v1
  api_key: kb
  models:
  - model: m-beta-2
    priority: 20
  - model: m-beta-1
    priority: 5
    rate_limit:
      requests_per_minute: 30
      tokens_per_minute: 100000
- name: alpha
  base_url: https://a.example/v1
  api_key: ka
  reasoning_effort: low
  models:
  - model: m-alpha
    priority: 1
    role: 主翻译
`);
  const { providers } = loadModelProviders({ MODEL_PROVIDER_FILE: file });
  assert.deepEqual(
    providers.map((p) => `${p.provider}/${p.model}@${p.priority}`),
    ['alpha/m-alpha@1', 'beta/m-beta-1@5', 'beta/m-beta-2@20'],
  );
  // 模型级 rate_limit 与服务商级 reasoning_effort 继承
  assert.equal(providers[0].role, '主翻译');
  assert.equal(providers[0].reasoningEffort, 'low');
  assert.equal(providers[1].rateLimit?.requests_per_minute, 30);
  assert.equal(providers[1].provider, 'beta');

  // 完整回退链
  const chain = resolveAiProviderChain({ MODEL_PROVIDER_FILE: file });
  assert.equal(chain.length, 3);
  assert.equal(chain[0].model, 'm-alpha');
  assert.equal(chain[2].model, 'm-beta-2');
  const single = resolveAiProvider({ MODEL_PROVIDER_FILE: file });
  assert.equal(single.model, 'm-alpha');
});

test('model-providers: 服务商级 expire 过期 → 整商剔除(同文件其他商保留)', () => {
  const file = makeProviderFile(`
providers:
- name: dead
  base_url: https://d.example/v1
  api_key: kd
  expire: "${yesterday}"
  models:
  - model: m-dead
    priority: 1
- name: alive
  base_url: https://a.example/v1
  api_key: ka
  models:
  - model: m-alive
    priority: 2
`);
  const { providers } = loadModelProviders({ MODEL_PROVIDER_FILE: file });
  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider, 'alive');
});

test('model-providers: models 缺失/必填字段缺失抛错(带条目定位)', () => {
  const noModels = makeProviderFile(`
providers:
- name: broken
  base_url: https://x.example/v1
  api_key: k
`);
  assert.throws(() => loadModelProviders({ MODEL_PROVIDER_FILE: noModels }), /models must be a non-empty list/);

  const noModelField = makeProviderFile(`
providers:
- name: broken2
  base_url: https://x.example/v1
  api_key: k
  models:
  - priority: 1
`);
  assert.throws(() => loadModelProviders({ MODEL_PROVIDER_FILE: noModelField }), /models\[0\]: missing model/);
});

test('model-providers: 未启用文件时抛错;env 老路径不受影响', () => {
  assert.throws(() => loadModelProviders({}), /MODEL_PROVIDER_YAML \/ MODEL_PROVIDER_FILE 均未设置/);
  const provider = resolveAiProvider({
    OPENAI_API_KEY: 'k',
    OPENAI_BASE_URL: 'https://flat.example/v1',
    TRANSLATION_MODEL: 'm-flat',
  });
  assert.equal(provider.model, 'm-flat');
  const pair = resolveAiProviderChain({
    AI_PROVIDER: '1',
    AI_PROVIDER_1_BASE_URL: 'https://s1.example/v1',
    AI_PROVIDER_1_API_KEY: 'k1',
    AI_PROVIDER_1_MODEL: 'm1',
    AI_PROVIDER_FALLBACK: '2',
    AI_PROVIDER_2_BASE_URL: 'https://s2.example/v1',
    AI_PROVIDER_2_API_KEY: 'k2',
    AI_PROVIDER_2_MODEL: 'm2',
  });
  assert.deepEqual(pair.map((p) => p.model), ['m1', 'm2']);
});

test('model-providers: MODEL_PROVIDER_YAML 内联模式(生产激活通道),且优先于文件', () => {
  const inline = `
providers:
- name: inline-test
  base_url: https://inline.example/v1
  api_key: ki
  models:
  - model: m-inline
    priority: 1
`;
  const { providers, path } = loadModelProviders({ MODEL_PROVIDER_YAML: inline });
  assert.equal(path, '(MODEL_PROVIDER_YAML)');
  assert.equal(providers[0].model, 'm-inline');
  assert.equal(providers[0].provider, 'inline-test');

  const file = makeProviderFile(`
providers:
- name: from-file
  base_url: https://f.example/v1
  api_key: kf
  models:
  - model: m-file
    priority: 1
`);
  const chain = resolveAiProviderChain({ MODEL_PROVIDER_YAML: inline, MODEL_PROVIDER_FILE: file });
  assert.equal(chain[0].model, 'm-inline', '内联应优先于文件');
});

test('model-providers: modelProviderFilePath 相对路径基于 cwd 解析', () => {
  assert.equal(modelProviderFilePath({}), null);
  assert.equal(
    modelProviderFilePath({ MODEL_PROVIDER_FILE: 'model_provider.yaml' }),
    join(process.cwd(), 'model_provider.yaml'),
  );
});
