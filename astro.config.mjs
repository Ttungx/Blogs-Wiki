import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const onGitHubPages = process.env.GITHUB_ACTIONS === 'true' && owner && repository;
const site = process.env.SITE_URL ?? (onGitHubPages ? `https://${owner}.github.io` : 'http://localhost:4321');
const base = process.env.BASE_PATH ?? (onGitHubPages ? `/${repository}` : '/');

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
