import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// listIndexableTreeSlugs — the sitemap data source for published trees.
// Indexable predicate (single source): kind:'main' && visibility:'public_listed'.
// A by-link or private tree must never appear (no enumeration oracle).
// ---------------------------------------------------------------------------

const mockTreeFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: { findMany: (...a: unknown[]) => mockTreeFindMany(...a) },
  },
  isUniqueViolation: () => false,
}));

import { listIndexableTreeSlugs } from '@/lib/tree/public-serve';

beforeEach(() => {
  mockTreeFindMany.mockReset();
});

describe('listIndexableTreeSlugs', () => {
  test('returns slug + lastModified for each public_listed main tree', async () => {
    const ts = new Date('2026-06-01T00:00:00Z');
    mockTreeFindMany.mockResolvedValue([
      { publicSlug: 'alpha', lastModifiedAt: ts },
      { publicSlug: 'beta', lastModifiedAt: ts },
    ]);

    const result = await listIndexableTreeSlugs();

    expect(result).toEqual([
      { slug: 'alpha', lastModified: ts },
      { slug: 'beta', lastModified: ts },
    ]);
  });

  test('queries only kind:main and visibility:public_listed (predicate is single-source)', async () => {
    mockTreeFindMany.mockResolvedValue([]);

    await listIndexableTreeSlugs();

    const arg = mockTreeFindMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ kind: 'main', visibility: 'public_listed' });
  });
});
