import type { MetadataRoute } from 'next';
import { listIndexableTreeSlugs, listIndexablePersonUrls } from '@/lib/tree/public-serve';
import { listIndexableCollectionSlugs } from '@/lib/collections/public-serve';

const BASE_URL = 'https://gynat.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Re-queried LIVE per build. The indexable predicate is single-source in the
  // serve layer (tree = main && public_listed; collection = public_listed AND
  // fully-listable) — a tree/collection flipped private or by-link simply isn't
  // returned, so it vanishes from the sitemap. Fail-closed: no entry.
  // Person URLs carry a second gate on top of the tree one: the owner's
  // per-person opt-in (`isPublicPersonPageIndexable`, mirrored as SQL).
  const [trees, collections, people] = await Promise.all([
    listIndexableTreeSlugs(),
    listIndexableCollectionSlugs(),
    listIndexablePersonUrls(),
  ]);

  return [
    { url: BASE_URL, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE_URL}/policy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/islamic-gedcom`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/auth/login`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/auth/signup`, changeFrequency: 'yearly', priority: 0.2 },
    ...trees.map((t) => ({
      url: `${BASE_URL}/family/${t.slug}`,
      lastModified: t.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...collections.map((c) => ({
      url: `${BASE_URL}/collections/${c.slug}`,
      lastModified: c.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...people.map((p) => ({
      url: `${BASE_URL}/family/${p.slug}/person/${p.individualId}`,
      lastModified: p.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];
}
