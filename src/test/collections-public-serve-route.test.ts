import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// GET /api/collections/[slug]/tree — anonymous, deny-by-default public serve.
// Mirrors /api/family/[slug]/tree. Unknown / private / collections-off slug →
// ONE generic 404 (no oracle). enableCollections gating lives in the loader.
// ---------------------------------------------------------------------------

const mockLoad = vi.fn();
const mockBuild = vi.fn();
vi.mock('@/lib/collections/public-serve', () => ({
  loadPublicCollectionBySlug: (...a: unknown[]) => mockLoad(...a),
  buildPublicCollectionPayload: (...a: unknown[]) => mockBuild(...a),
}));

// Allow every request through the limiter in these tests.
vi.mock('@/lib/api/rate-limit', () => ({
  publicTreeLimiter: { check: () => ({ allowed: true }) },
  clientIpKey: () => 'ip',
  rateLimitResponse: () => new Response('rl', { status: 429 }),
}));

import { GET } from '@/app/api/collections/[slug]/tree/route';

function req(): Request {
  return new Request('https://x/api/collections/abc/tree');
}
function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/collections/[slug]/tree', () => {
  test('unknown / private / collections-off slug → 404 (loader returns null)', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(req() as never, params('nope') as never);
    expect(res.status).toBe(404);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  test('published collection → composed payload, noindex header', async () => {
    mockLoad.mockResolvedValue({
      collectionId: 'c1',
      workspaceId: 'ws1',
      titleAr: 'مجموعة',
      descriptionAr: 'وصف',
      visibility: 'public_listed',
      publicSlug: 'abc',
    });
    mockBuild.mockResolvedValue({
      titleAr: 'مجموعة',
      descriptionAr: 'وصف',
      trees: [{ slug: 't-slug', titleAr: 'شجرة', peopleCount: 12 }],
    });

    const res = await GET(req() as never, params('abc') as never);
    expect(res.status).toBe(200);
    // Always noindex (collections are never search-listed at the API surface).
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    const body = await res.json();
    expect(body.titleAr).toBe('مجموعة');
    expect(body.trees).toHaveLength(1);
    expect(body.trees[0].slug).toBe('t-slug');
    expect(body.trees[0].peopleCount).toBe(12);
  });
});
