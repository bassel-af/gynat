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
});
