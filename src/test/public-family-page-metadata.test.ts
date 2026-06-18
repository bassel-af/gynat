import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { PublicTreeRecord } from '@/lib/tree/public-serve';

// ---------------------------------------------------------------------------
// Mocks — the page pulls in a client component + CSS module + the serve layer.
// We only exercise generateMetadata, so stub the heavy imports.
// ---------------------------------------------------------------------------

const mockGetPublicTreeForRequest = vi.fn();
vi.mock('@/lib/tree/public-serve', () => ({
  getPublicTreeForRequest: (...a: unknown[]) => mockGetPublicTreeForRequest(...a),
  buildPublicTreePayload: vi.fn(),
  isPublicTreeIndexable: (r: PublicTreeRecord) =>
    r.kind === 'main' && r.visibility === 'public_listed',
}));

vi.mock('@/app/family/[slug]/PublicTreePageClient', () => ({ default: () => null }));
vi.mock('@/app/family/[slug]/page.module.css', () => ({ default: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import { generateMetadata } from '@/app/family/[slug]/page';

function record(overrides: Partial<PublicTreeRecord>): PublicTreeRecord {
  return {
    treeId: 't1',
    workspaceId: 'ws1',
    workspaceNameAr: 'آل السعيد',
    nameAr: 'آل السعيد',
    kind: 'main',
    visibility: 'public_listed',
    lastModifiedAt: new Date(),
    publicSlug: 'slug',
    enableKunya: true,
    hideBirthDateForFemale: false,
    hideBirthDateForMale: false,
    ...overrides,
  };
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => vi.clearAllMocks());

describe('public family page — generateMetadata robots', () => {
  test('a public_listed MAIN tree is indexable', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'main', visibility: 'public_listed' }));
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: true });
  });

  test('a public_listed EXTRA tree is FORCED noindex', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'extra', visibility: 'public_listed' }));
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('a public_link EXTRA tree is noindex (same as link-level)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'extra', visibility: 'public_link' }));
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('a public_link MAIN tree is noindex (link-only, kept out of search)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'main', visibility: 'public_link' }));
    const meta = await generateMetadata(params('slug'));
    expect(meta.robots).toMatchObject({ index: false });
  });
});

describe('public family page — generateMetadata content', () => {
  test('title is the bare family name (template adds · جينات, no hand suffix)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    const meta = await generateMetadata(params('slug'));
    expect(meta.title).toBe('آل السعيد');
  });

  test('canonical + openGraph.url point at /family/{slug}', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({}));
    const meta = await generateMetadata(params('my-slug'));
    expect(meta.alternates?.canonical).toBe('/family/my-slug');
    expect(meta.openGraph).toMatchObject({ url: '/family/my-slug', siteName: 'جينات' });
  });
});
