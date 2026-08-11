/**
 * D1SourceStateRepository 测试。
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { D1SourceStateRepository } from "../../repositories/d1/d1-source-state-repository.ts";
import { seedSources } from "./helpers.ts";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  // 插入测试用的 source 记录（满足 source_items 的外键约束）
  await seedSources(
    env.DB,
    { id: "openai", name: "OpenAI", type: "company", homepageUrl: "https://openai.com/", blogUrl: "https://openai.com/news/", domain: "openai.com" },
    { id: "cloudflare", name: "Cloudflare", type: "company", homepageUrl: "https://cloudflare.com/", blogUrl: "https://blog.cloudflare.com/", domain: "cloudflare.com" },
    { id: "anthropic", name: "Anthropic", type: "company", homepageUrl: "https://anthropic.com/", blogUrl: "https://anthropic.com/news/", domain: "anthropic.com" },
    { id: "test-load", name: "Test Load", type: "company", homepageUrl: "https://example.com/", blogUrl: "https://example.com/", domain: "example.com" },
    { id: "reconcile-test", name: "Reconcile", type: "company", homepageUrl: "https://example.com/", blogUrl: "https://example.com/", domain: "example.com" },
  );
});

describe("D1SourceStateRepository", () => {
  test("hasSeen 未记录返回 false", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    expect(await repo.hasSeen("openai", "https://openai.com/index/test/")).toBe(false);
  });

  test("markProcessed 后 hasSeen 变 true", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    await repo.markProcessed("openai", "https://openai.com/index/test/");
    expect(await repo.hasSeen("openai", "https://openai.com/index/test/")).toBe(true);
  });

  test("markProcessed 重复幂等", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    await repo.markProcessed("cloudflare", "https://blog.cloudflare.com/test/");
    await repo.markProcessed("cloudflare", "https://blog.cloudflare.com/test/");

    const list = await repo.listProcessed("cloudflare");
    expect(list.filter((url) => url === "https://blog.cloudflare.com/test/").length).toBe(1);
  });

  test("listProcessed 返回已处理 URL", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    await repo.markProcessed("anthropic", "https://www.anthropic.com/news/a");
    await repo.markProcessed("anthropic", "https://www.anthropic.com/news/b");

    const list = await repo.listProcessed("anthropic");
    expect(list).toContain("https://www.anthropic.com/news/a");
    expect(list).toContain("https://www.anthropic.com/news/b");
  });

  test("loadAll 返回完整快照", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    await repo.markProcessed("test-load", "https://example.com/x");

    const snapshot = await repo.loadAll();
    expect(snapshot.version).toBe(1);
    expect(snapshot.blogs["test-load"]).toContain("https://example.com/x");
  });

  test("reconcile 回填未记录条目", async () => {
    const repo = new D1SourceStateRepository(env.DB);
    const added = await repo.reconcile([
      { sourceId: "reconcile-test", url: "https://example.com/1" },
      { sourceId: "reconcile-test", url: "https://example.com/2" },
    ]);
    expect(added).toBe(2);

    // 再次 reconcile 同样的条目，新增数应为 0
    const added2 = await repo.reconcile([
      { sourceId: "reconcile-test", url: "https://example.com/1" },
      { sourceId: "reconcile-test", url: "https://example.com/2" },
    ]);
    expect(added2).toBe(0);
  });
});
