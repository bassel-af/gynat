import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: ['/', '/auth/login?'],
      allow: ['/', '/policy', '/islamic-gedcom', '/features', '/auth/login', '/auth/signup', '/auth/forgot-password'],
    },
    sitemap: 'https://gynat.com/sitemap.xml',
  };
}
