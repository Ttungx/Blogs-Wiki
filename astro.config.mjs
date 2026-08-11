import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { loadEnv } from 'vite';
import { localImageProxy } from './scripts/dev/image-proxy.mjs';
import { remarkImageProxy } from './scripts/dev/remark-image-proxy.mjs';

const env = { ...process.env, ...loadEnv('development', process.cwd(), '') };
const [owner, repository] = (env.GITHUB_REPOSITORY ?? '').split('/');
const onGitHubPages = env.GITHUB_ACTIONS === 'true' && owner && repository;
const site = env.SITE_URL || (onGitHubPages ? `https://${owner}.github.io` : 'https://blogs-wiki.1323593614.workers.dev');
const base = env.BASE_PATH || (onGitHubPages ? `/${repository}` : '/');

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  output: 'static',
  integrations: [sitemap(), localImageProxy({ base, env })],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
    remarkPlugins: [remarkMath, remarkImageProxy({ dev: import.meta.env.DEV, base })],
    rehypePlugins: [rehypeKatex],
  },
});
