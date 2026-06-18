import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// buildPublicCollectionPayload — turns the surviving (public) leaf trees into
// lightweight CARDS (slug + titleAr + peopleCount) that link out to each tree's
// own /family/[slug] page. The withholding walk decides inclusion; this file
// pins the card resolution: slug lookup, people count, and the final
// fail-closed drop of a leaf with no current public slug.
// ---------------------------------------------------------------------------

const mockCollectionFindMany = vi.fn();
const mockTreeFindMany = vi.fn();
const mockIndividualGroupBy = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    collection: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    familyTree: { findMany: (...a: unknown[]) => mockTreeFindMany(...a) },
    individual: { groupBy: (...a: unknown[]) => mockIndividualGroupBy(...a) },
  },
  isUniqueViolation: () => false,
}));

import {
  buildPublicCollectionPayload,
  type PublicCollectionRecord,
} from '@/lib/collections/public-serve';

const WS = 'ws-pub';
const record: PublicCollectionRecord = {
  collectionId: 'root',
  workspaceId: WS,
  titleAr: 'مجموعتي',
  descriptionAr: 'وصف',
  visibility: 'public_listed',
  publicSlug: 'collslug',
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

// One root collection holding two PUBLIC own-tree items (t1, t2) — both survive
// the walk. Card resolution then resolves their slugs + counts.
function rootWithTwoPublicTrees() {
  mockCollectionFindMany.mockResolvedValue([
    {
      id: 'root',
      visibility: 'public_listed',
      items: [
        { kind: 'tree', titleAr: 'الأولى', treeId: 't1', childCollectionId: null, branchPointerId: null, tree: { id: 't1', workspaceId: WS, visibility: 'public_link' }, branchPointer: null, childCollection: null },
        { kind: 'tree', titleAr: 'الثانية', treeId: 't2', childCollectionId: null, branchPointerId: null, tree: { id: 't2', workspaceId: WS, visibility: 'public_listed' }, branchPointer: null, childCollection: null },
      ],
    },
  ]);
}

beforeEach(() => vi.clearAllMocks());

describe('buildPublicCollectionPayload — cards', () => {
  test('emits a card per surviving leaf with its own slug + people count', async () => {
    rootWithTwoPublicTrees();
    mockTreeFindMany.mockResolvedValue([
      { id: 't1', publicSlug: 'slug-1' },
      { id: 't2', publicSlug: 'slug-2' },
    ]);
    mockIndividualGroupBy.mockResolvedValue([
      { treeId: 't1', _count: { _all: 5 } },
      { treeId: 't2', _count: { _all: 9 } },
    ]);

    const payload = await buildPublicCollectionPayload(record);

    expect(payload.titleAr).toBe('مجموعتي');
    expect(payload.trees).toEqual([
      { slug: 'slug-1', titleAr: 'الأولى', peopleCount: 5 },
      { slug: 'slug-2', titleAr: 'الثانية', peopleCount: 9 },
    ]);
    // No per-tree GedcomData is inlined.
    expect((payload.trees[0] as unknown as Record<string, unknown>).payload).toBeUndefined();
  });

  test('drops a surviving leaf that has no current public slug (fail-closed race)', async () => {
    rootWithTwoPublicTrees();
    mockTreeFindMany.mockResolvedValue([
      { id: 't1', publicSlug: 'slug-1' },
      { id: 't2', publicSlug: null }, // unpublished between walk and card resolve
    ]);
    mockIndividualGroupBy.mockResolvedValue([{ treeId: 't1', _count: { _all: 3 } }]);

    const payload = await buildPublicCollectionPayload(record);
    expect(payload.trees.map((t) => t.slug)).toEqual(['slug-1']);
  });
});
