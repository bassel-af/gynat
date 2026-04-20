import type { MetadataRoute } from 'next';

const BASE_URL = 'https://gynat.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE_URL}/policy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/islamic-gedcom`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/features`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/auth/login`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/auth/signup`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
