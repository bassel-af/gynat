import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { PublicCollectionRecord } from '@/lib/collections/public-serve';

// ---------------------------------------------------------------------------
// Mocks — generateMetadata pulls in the serve layer + a client component + CSS.
// We only exercise generateMetadata, so stub the heavy imports.
// ---------------------------------------------------------------------------

const mockGetPublicCollectionForRequest = vi.fn();
const mockGetCollectionListingReadiness = vi.fn();
vi.mock('@/lib/collections/public-serve', () => ({
  getPublicCollectionForRequest: (...a: unknown[]) =>
    mockGetPublicCollectionForRequest(...a),
  buildPublicCollectionPayload: vi.fn(),
  getCollectionListingReadiness: (...a: unknown[]) =>
    mockGetCollectionListingReadiness(...a),
}));

vi.mock('@/app/collections/[slug]/PublicCollectionPageClient', () => ({
  default: () => null,
}));
vi.mock('@/app/collections/[slug]/page.module.css', () => ({ default: {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { generateMetadata } from '@/app/collections/[slug]/page';

function record(overrides: Partial<PublicCollectionRecord>): PublicCollectionRecord {
  return {
    collectionId: 'c1',
    workspaceId: 'ws1',
    titleAr: 'مجموعة العائلات',
    descriptionAr: 'وصف',
    visibility: 'public_listed',
    publicSlug: 'slug',
    updatedAt: new Date(),
    ...overrides,
  };
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => vi.clearAllMocks());

describe('public collection page — generateMetadata robots', () => {
  test('public_listed + fully listable -> indexable', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(
      record({ visibility: 'public_listed' }),
    );
    mockGetCollectionListingReadiness.mockResolvedValue({
      fullyListable: true,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [],
    });
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: true });
  });

  test('public_listed but NOT fully listable (contains a link-only tree) -> noindex', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(
      record({ visibility: 'public_listed' }),
    );
    mockGetCollectionListingReadiness.mockResolvedValue({
      fullyListable: false,
      notListedOwnTrees: [{ treeId: 't1', titleAr: 'فرع' }],
      notListedBorrowedTrees: [],
    });
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('public_link collection -> noindex (link-only)', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(
      record({ visibility: 'public_link' }),
    );
    mockGetCollectionListingReadiness.mockResolvedValue({
      fullyListable: true,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [],
    });
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('readiness null (fail-closed) -> noindex', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(
      record({ visibility: 'public_listed' }),
    );
    mockGetCollectionListingReadiness.mockResolvedValue(null);
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });
});

describe('public collection page — generateMetadata content', () => {
  test('canonical + openGraph.url point at /collections/{slug}', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(record({}));
    mockGetCollectionListingReadiness.mockResolvedValue({
      fullyListable: true,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [],
    });
    const meta = await generateMetadata(params('col-slug'));
    expect(meta.alternates?.canonical).toBe('/collections/col-slug');
    expect(meta.openGraph).toMatchObject({
      url: '/collections/col-slug',
      siteName: 'جينات',
    });
  });

  test('falls back to a generic description when descriptionAr is null', async () => {
    mockGetPublicCollectionForRequest.mockResolvedValue(
      record({ titleAr: 'آل النور', descriptionAr: null }),
    );
    mockGetCollectionListingReadiness.mockResolvedValue(null);
    const meta = await generateMetadata(params('slug'));
    expect(meta.description).toBe('مجموعة آل النور من أشجار العائلة الموثقة على جينات');
  });
});
