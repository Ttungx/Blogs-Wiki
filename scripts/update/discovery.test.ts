import { gzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { decodeFetchedBytes, diagnoseSourceDiscovery, parseSitemap } from './discovery';
import type { FetchLike, SourceConfig } from './types';

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ai.meta.com/blog/hello-world</loc><lastmod>2026-07-09</lastmod></url>
</urlset>`;

test('decodeFetchedBytes: 解压 .gz sitemap', async () => {
  const gz = gzipSync(SITEMAP_XML);
  const xml = await decodeFetchedBytes('https://ai.meta.com/sitemap/ai.xml.gz', gz);
  const entries = parseSitemap(xml, 'https://ai.meta.com/sitemap/ai.xml.gz');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.url, 'https://ai.meta.com/blog/hello-world');
});

test('discovery: gzip sitemap 计入候选', async () => {
  const gz = gzipSync(SITEMAP_XML);
  const source: SourceConfig = {
    id: 'meta-ai',
    name: 'Meta AI',
    type: 'company',
    homepage_url: 'https://ai.meta.com/',
    blog_url: 'https://ai.meta.com/blog/',
    domain: 'ai.meta.com',
    update_mode: 'active',
    article_paths: ['/blog'],
    sitemap_url: 'https://ai.meta.com/sitemap/ai.xml.gz',
  };
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.endsWith('.gz')) {
      const copy = new Uint8Array(gz);
      return new Response(copy, {
        status: 200,
        headers: { 'content-type': 'application/gzip' },
      });
    }
    return new Response('not found', { status: 404 });
  };
  const diagnosis = await diagnoseSourceDiscovery(source, fetchImpl);
  const sitemap = diagnosis.paths.find((path) => path.name === 'sitemap');
  assert.ok(sitemap);
  assert.equal(sitemap.ok, true);
  assert.equal(sitemap.candidateCount, 1);
});
