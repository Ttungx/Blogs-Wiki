/**
 * D1ArticleRepository 测试。
 * 用 vitest-pool-workers 的真实 Miniflare D1 binding。
 * 每个测试用唯一 URL 避免数据污染（D1 存储测试间不隔离）。
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { D1ArticleRepository } from "../../repositories/d1/d1-article-repository.ts";
import { makeSaveInput, seedSources, seedCategories, source, ALL_CATEGORIES } from "./helpers.ts";

/** 每个测试用唯一 URL，避免同一 D1 存储测试间数据污染。 */
let urlCounter = 0;
function uniqueUrl(): string {
  urlCounter += 1;
  return `https://example.com/blog/test-${urlCounter}/`;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedSources(env.DB, source);
  await seedCategories(env.DB, ...ALL_CATEGORIES);
});

describe("D1ArticleRepository.save", () => {
  test("新建文章返回 created:true", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    const result = await repo.save(makeSaveInput({ article: { url } }));

    expect(result.created).toBe(true);
    expect(result.id).toBe(`smoke-blog/test-${urlCounter}`);
  });

  test("同 originalUrl 幂等返回 created:false", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    const input = makeSaveInput({ article: { url } });

    const first = await repo.save(input);
    const second = await repo.save(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  test("无 publishedAt 抛错", async () => {
    const repo = new D1ArticleRepository(env.DB);
    await expect(
      repo.save(makeSaveInput({ article: { publishedAt: "" } })),
    ).rejects.toThrow(/no published date/);
  });

  test("categories 写入关联表", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    await repo.save(makeSaveInput({ article: { url }, translation: { categories: ["AI", "Agent"] } }));

    const record = await repo.getByOriginalUrl(source.id, url);
    expect(record?.categories).toEqual(["AI", "Agent"]);
  });

  test("excerpt 自动生成", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    await repo.save(
      makeSaveInput({
        article: { url },
        translation: { contentMarkdown: "这是一段足够长的正文内容用于测试摘要提取功能是否正常工作。" },
      }),
    );

    const record = await repo.getByOriginalUrl(source.id, url);
    expect(record?.excerpt).toBeTruthy();
  });
});

describe("D1ArticleRepository 读取", () => {
  test("getById 存在和不存在", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    const result = await repo.save(makeSaveInput({ article: { url } }));

    const found = await repo.getById(result.id);
    expect(found).not.toBeNull();
    expect(found?.translatedTitle).toBe("你好世界");

    const missing = await repo.getById("smoke-blog/nonexistent");
    expect(missing).toBeNull();
  });

  test("getByOriginalUrl 按 (sourceId, url) 查找", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    await repo.save(makeSaveInput({ article: { url } }));

    const found = await repo.getByOriginalUrl(source.id, url);
    expect(found).not.toBeNull();
    expect(found?.originalTitle).toBe("Hello World");
  });

  test("listBySource 过滤 sourceId", async () => {
    const repo = new D1ArticleRepository(env.DB);
    await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));
    await repo.save(makeSaveInput({ article: { url: uniqueUrl(), title: "Second" } }));

    const list = await repo.listBySource(source.id);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  test("listAll 返回所有文章", async () => {
    const repo = new D1ArticleRepository(env.DB);
    await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));

    const list = await repo.listAll();
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  test("exists 判断", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    expect(await repo.exists(source.id, url)).toBe(false);

    await repo.save(makeSaveInput({ article: { url } }));
    expect(await repo.exists(source.id, url)).toBe(true);
  });
});
