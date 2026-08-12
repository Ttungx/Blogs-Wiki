/**
 * D1ArticleRepository 测试（多语言架构）。
 *
 * 多语言架构下文章拆为两层：
 * - articles：身份行（id、url、发布日期、作者、来源域），UNIQUE(source_id, original_url)。
 * - article_versions：语言版本行（title、contentMarkdown、excerpt、provenance），
 *   PK(article_id, language)。
 *
 * save() 写身份 + 原文版本（原文无分类，provenance='original'）；
 * saveVersion() 为已有文章追加/更新语言版本，并把翻译带来的分类同步到文章身份。
 *
 * 用 vitest-pool-workers 的真实 Miniflare D1 binding。
 * 每个测试用唯一 URL 避免数据污染（D1 存储测试间不隔离）；
 * 第一个测试用默认 hello-world URL 验证 id 派生，其余均走 uniqueUrl()。
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { D1ArticleRepository } from "../../repositories/d1/d1-article-repository.ts";
import {
  makeSaveInput,
  makeSaveVersionInput,
  seedSources,
  seedCategories,
  source,
  ALL_CATEGORIES,
} from "./helpers.ts";
import type { ArticleRecord, ArticleVersionRecord } from "../../domain/types.ts";

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
  test("新建文章返回 created:true，并写入身份与原文版本", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const result = await repo.save(makeSaveInput());

    expect(result.created).toBe(true);
    expect(result.id).toContain("smoke-blog/hello-world");

    // getById 返回 ArticleRecord（身份字段，无内容字段）
    const record = await repo.getById(result.id);
    expect(record).not.toBeNull();
    const identity = record as ArticleRecord;
    expect(identity.id).toBe(result.id);
    expect(identity.sourceId).toBe("smoke-blog");
    expect(identity.originalUrl).toBe("https://example.com/blog/hello-world/");
    expect(identity.originalLanguage).toBe("en");
    expect(identity.sourceDomain).toBe("example.com");
    // ArticleRecord 不再含内容字段
    const extra = identity as unknown as Record<string, unknown>;
    expect(extra).not.toHaveProperty("originalTitle");
    expect(extra).not.toHaveProperty("translatedTitle");
    expect(extra).not.toHaveProperty("contentMarkdown");
    expect(extra).not.toHaveProperty("excerpt");
    expect(extra).not.toHaveProperty("translatedAt");

    // getVersion 返回原文版本（save 写入的 language=originalLanguage 行）
    const enVersion = await repo.getVersion(result.id, "en");
    expect(enVersion).not.toBeNull();
    const en = enVersion as ArticleVersionRecord;
    expect(en.title).toBe("Hello World");
    expect(en.contentMarkdown).toBe("# Hello\n\nThis is the original body.");
    expect(en.provenance).toBe("original");
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

  test("exists 在 save 前后返回正确值", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();

    expect(await repo.exists(source.id, url)).toBe(false);
    await repo.save(makeSaveInput({ article: { url } }));
    expect(await repo.exists(source.id, url)).toBe(true);
  });
});

describe("D1ArticleRepository 读取", () => {
  test("getByOriginalUrl 按 (sourceId, url) 查找", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    const saved = await repo.save(makeSaveInput({ article: { url } }));

    const found = await repo.getByOriginalUrl(source.id, url);
    expect(found).not.toBeNull();
    const record = found as ArticleRecord;
    expect(record.id).toBe(saved.id);
    expect(record.sourceId).toBe(source.id);
    expect(record.originalUrl).toBe(url);
  });

  test("listBySource 过滤 sourceId", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const urlA = uniqueUrl();
    const urlB = uniqueUrl();
    await repo.save(makeSaveInput({ article: { url: urlA } }));
    await repo.save(makeSaveInput({ article: { url: urlB } }));

    const list = await repo.listBySource(source.id);
    const urls = list.map((r) => r.originalUrl);
    expect(urls).toContain(urlA);
    expect(urls).toContain(urlB);
    expect(list.every((r) => r.sourceId === source.id)).toBe(true);
  });

  test("listAll 返回所有文章", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const url = uniqueUrl();
    await repo.save(makeSaveInput({ article: { url } }));

    const list = await repo.listAll();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((r) => r.originalUrl === url)).toBe(true);
  });
});

describe("D1ArticleRepository.saveVersion", () => {
  test("写入翻译版本，原文版本不受影响", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const saved = await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));

    const versionResult = await repo.saveVersion(makeSaveVersionInput(saved.id));
    expect(versionResult.created).toBe(true);

    const zhVersion = await repo.getVersion(saved.id, "zh-cn");
    expect(zhVersion).not.toBeNull();
    const zh = zhVersion as ArticleVersionRecord;
    expect(zh.title).toBe("你好世界");
    expect(zh.provenance).toBe("model");
    expect(zh.translationModel).toBe("smoke-model");

    // 原文版本仍然存在
    const enVersion = await repo.getVersion(saved.id, "en");
    expect(enVersion).not.toBeNull();
    expect((enVersion as ArticleVersionRecord).provenance).toBe("original");
  });

  test("同 language 幂等返回 created:false", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const saved = await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));

    const first = await repo.saveVersion(makeSaveVersionInput(saved.id));
    const second = await repo.saveVersion(makeSaveVersionInput(saved.id));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  test("模型译文保留首次生成时间，重译不覆盖", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const saved = await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));
    const firstTranslatedAt = "2026-08-10T01:02:03.000Z";
    const laterTranslatedAt = "2026-08-12T04:05:06.000Z";

    await repo.saveVersion(
      makeSaveVersionInput(saved.id, {
        translatedAt: firstTranslatedAt,
      }),
    );
    await repo.saveVersion(
      makeSaveVersionInput(saved.id, {
        title: "重译后的你好世界",
        translatedAt: laterTranslatedAt,
      }),
    );

    const version = await repo.getVersion(saved.id, "zh-cn");
    expect(version).not.toBeNull();
    expect((version as ArticleVersionRecord).title).toBe("重译后的你好世界");
    expect((version as ArticleVersionRecord).translatedAt).toBe(firstTranslatedAt);
  });

  test("不存在的 articleId 抛错", async () => {
    const repo = new D1ArticleRepository(env.DB);
    await expect(
      repo.saveVersion(makeSaveVersionInput("smoke-blog/nonexistent")),
    ).rejects.toThrow(/does not exist/);
  });

  test("categories 随 saveVersion 同步到文章身份", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const saved = await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));

    // save 写原文版本，原文无分类 → 身份 categories 为空
    const afterSave = await repo.getById(saved.id);
    expect((afterSave as ArticleRecord).categories).toEqual([]);

    // saveVersion 带分类，同步到文章身份
    await repo.saveVersion(makeSaveVersionInput(saved.id, { categories: ["AI"] }));
    const afterVersion = await repo.getById(saved.id);
    expect((afterVersion as ArticleRecord).categories).toEqual(["AI"]);
  });
});

describe("D1ArticleRepository.listVersions", () => {
  test("返回文章的所有语言版本", async () => {
    const repo = new D1ArticleRepository(env.DB);
    const saved = await repo.save(makeSaveInput({ article: { url: uniqueUrl() } }));
    await repo.saveVersion(makeSaveVersionInput(saved.id));

    const versions = await repo.listVersions(saved.id);
    const languages = versions.map((v) => v.language);
    expect(languages).toEqual(expect.arrayContaining(["en", "zh-cn"]));
    expect(versions).toHaveLength(2);
  });
});
