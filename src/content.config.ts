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

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z
    .object({
      blog_id: z.string().min(1),
      original_url: webUrl,
      language: z.enum(['en', 'zh-cn']),
      is_original: z.boolean(),
      image_url: webUrl.optional(),
      title: z.string().min(1),
      published_at: z.coerce.date(),
      categories: z.array(category).default([]),
      source_domain: z.string().min(1),
      original_language: z.string().min(2).default('en'),
      provenance: z.enum(['original', 'official-zh', 'native-zh', 'model']),
      translation_model: z.string().min(1).optional(),
      original_alt_url: webUrl.optional(),
      version_at: z.coerce.date(),
      author: z.string().min(1).optional(),
      excerpt: z.string().min(1).optional(),
      demo: z.boolean().default(false),
    })
    .transform((article) => ({
      ...article,
      blogId: article.blog_id,
      originalUrl: article.original_url,
      imageUrl: article.image_url,
      publishedAt: article.published_at,
      sourceDomain: article.source_domain,
      originalLanguage: article.original_language,
      versionAt: article.version_at,
      translationModel: article.translation_model,
      originalAltUrl: article.original_alt_url,
    })),
});

export const collections = { blogs, articles };
