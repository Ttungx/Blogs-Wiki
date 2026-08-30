import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORIES } from './config/categories';

const category = z.enum(CATEGORIES);
const webUrl = z.string().url();

const blogs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blogs' }),
  schema: z
    .object({
      name: z.string().min(1),
      type: z.enum(['company', 'personal']),
      author: z.string().min(1).optional(),
      description: z.string().min(1),
      homepage_url: webUrl,
      blog_url: webUrl,
      domain: z.string().min(1),
      rss_url: webUrl.optional(),
      sitemap_url: webUrl.optional(),
      logo: z.string().optional(),
      avatar: z.string().optional(),
      logo_scale: z.number().positive().optional(),
      categories: z.array(category).min(1),
      demo: z.boolean().default(false),
    })
    .transform((blog) => ({
      ...blog,
      homepageUrl: blog.homepage_url,
      blogUrl: blog.blog_url,
      rssUrl: blog.rss_url,
      sitemapUrl: blog.sitemap_url,
      logoScale: blog.logo_scale,
    })),
});

// 注：src/content/articles/（文件后端的本地工作目录）不再注册为 Astro 内容集合——
// SSR 自 Phase 7 起全面读 D1，该集合已无消费者；注册反而会让回填期间的工作文件
// 触发 schema 校验、打断 astro build（2026-08-30 全量回填时踩坑）。
export const collections = { blogs };
