import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// getCollectionListingReadiness — the ONE source of "is a collection
// fully-listable" (every servable leaf is public_listed). Splits public-but-
// not-listed (public_link) leaves into own-workspace vs cross-workspace borrows.
// listIndexableCollectionSlugs consumes this + public_listed + enableCollections.
// ---------------------------------------------------------------------------

const mockCollectionFindUnique = vi.fn();
const mockCollectionFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    collection: {
      findUnique: (...a: unknown[]) => mockCollectionFindUnique(...a),
      findMany: (...a: unknown[]) => mockCollectionFindMany(...a),
    },
  },
  isUniqueViolation: () => false,
}));

import {
  getCollectionListingReadiness,
  getCollectionListingReadinessById,
  listIndexableCollectionSlugs,
} from '@/lib/collections/public-serve';

const WS = 'ws-pub';

function mockRecord(visibility = 'public_listed') {
  mockCollectionFindUnique.mockResolvedValue({
    id: 'root',
    workspaceId: WS,
    titleAr: 'مجموعتي',
    descriptionAr: null,
    visibility,
    publicSlug: 'collslug',
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    workspace: { enableCollections: true },
  });
}

beforeEach(() => {
  mockCollectionFindUnique.mockReset();
  mockCollectionFindMany.mockReset();
});

describe('getCollectionListingReadiness', () => {
  test('returns null when the collection is not publicly servable', async () => {
    mockCollectionFindUnique.mockResolvedValue(null);
    expect(await getCollectionListingReadiness('nope')).toBeNull();
  });

  test('fullyListable=true when every servable leaf is public_listed', async () => {
    mockRecord();
    mockCollectionFindMany.mockResolvedValue([
      {
        id: 'root',
        visibility: 'public_listed',
        nameAr: 'مجموعتي',
        items: [
          { kind: 'tree', titleAr: 'A', treeId: 't1', childCollectionId: null, branchPointerId: null, tree: { id: 't1', workspaceId: WS, nameAr: 'A', visibility: 'public_listed' }, branchPointer: null, childCollection: null },
        ],
      },
    ]);

    const r = await getCollectionListingReadiness('collslug');
    expect(r).not.toBeNull();
    expect(r!.fullyListable).toBe(true);
    expect(r!.notListedOwnTrees).toEqual([]);
    expect(r!.notListedBorrowedTrees).toEqual([]);
  });

  test('an own public_link leaf makes it not fully-listable and lands in notListedOwnTrees', async () => {
    mockRecord();
    mockCollectionFindMany.mockResolvedValue([
      {
        id: 'root',
        visibility: 'public_listed',
        nameAr: 'مجموعتي',
        items: [
          { kind: 'tree', titleAr: 'A', treeId: 't1', childCollectionId: null, branchPointerId: null, tree: { id: 't1', workspaceId: WS, nameAr: 'شجرتي', visibility: 'public_link' }, branchPointer: null, childCollection: null },
        ],
      },
    ]);

    const r = await getCollectionListingReadiness('collslug');
    expect(r!.fullyListable).toBe(false);
    expect(r!.notListedOwnTrees).toEqual([{ treeId: 't1', titleAr: 'شجرتي' }]);
    expect(r!.notListedBorrowedTrees).toEqual([]);
  });

  test('a cross-workspace public_link borrow lands in notListedBorrowedTrees with its source workspace name', async () => {
    mockRecord();
    mockCollectionFindMany.mockResolvedValue([
      {
        id: 'root',
        visibility: 'public_listed',
        nameAr: 'مجموعتي',
        items: [
          {
            kind: 'tree',
            titleAr: 'فرع',
            treeId: null,
            childCollectionId: null,
            branchPointerId: 'bp1',
            tree: null,
            branchPointer: {
              status: 'active',
              rootIndividual: {
                tree: { id: 'tx', workspaceId: 'other-ws', nameAr: 'شجرة الجار', visibility: 'public_link', allowReuse: true, workspace: { nameAr: 'عائلة الجار' } },
              },
            },
            childCollection: null,
          },
        ],
      },
    ]);

    const r = await getCollectionListingReadiness('collslug');
    expect(r!.fullyListable).toBe(false);
    expect(r!.notListedOwnTrees).toEqual([]);
    expect(r!.notListedBorrowedTrees).toEqual([
      { titleAr: 'شجرة الجار', sourceWorkspaceNameAr: 'عائلة الجار' },
    ]);
  });
});

describe('getCollectionListingReadinessById', () => {
  test('returns null when the collection does not exist', async () => {
    mockCollectionFindUnique.mockResolvedValue(null);
    expect(await getCollectionListingReadinessById('missing')).toBeNull();
  });

  test('computes readiness pre-publish even when the collection itself is private', async () => {
    // Admin needs the breakdown BEFORE publishing — the collection's own
    // visibility must NOT gate this id-keyed path. Looked up by id → workspaceId.
    mockCollectionFindUnique.mockResolvedValue({ id: 'root', workspaceId: WS });
    mockCollectionFindMany.mockResolvedValue([
      {
        id: 'root',
        // The collection is still PRIVATE — the walk uses each item's own live
        // visibility, and the root-node gate is satisfied via the id entrypoint.
        visibility: 'private',
        nameAr: 'مجموعتي',
        items: [
          { kind: 'tree', titleAr: 'A', treeId: 't1', childCollectionId: null, branchPointerId: null, tree: { id: 't1', workspaceId: WS, nameAr: 'شجرتي', visibility: 'public_link' }, branchPointer: null, childCollection: null },
        ],
      },
    ]);

    const r = await getCollectionListingReadinessById('root');
    expect(r).not.toBeNull();
    expect(r!.fullyListable).toBe(false);
    expect(r!.notListedOwnTrees).toEqual([{ treeId: 't1', titleAr: 'شجرتي' }]);
  });
});

describe('listIndexableCollectionSlugs', () => {
  test('includes a public_listed collection only when fully-listable', async () => {
    // First call: the listing query for candidate collections.
    mockCollectionFindMany.mockImplementation((arg: { where?: { visibility?: string } }) => {
      if (arg?.where?.visibility === 'public_listed') {
        return Promise.resolve([
          { publicSlug: 'good', updatedAt: new Date('2026-06-02T00:00:00Z') },
        ]);
      }
      // The readiness walk's loadWalkNodes query for workspace 'ws-pub'.
      return Promise.resolve([
        {
          id: 'root',
          visibility: 'public_listed',
          nameAr: 'مجموعتي',
          items: [
            { kind: 'tree', titleAr: 'A', treeId: 't1', childCollectionId: null, branchPointerId: null, tree: { id: 't1', workspaceId: WS, nameAr: 'A', visibility: 'public_listed' }, branchPointer: null, childCollection: null },
          ],
        },
      ]);
    });
    mockRecord();

    const result = await listIndexableCollectionSlugs();
    expect(result).toEqual([
      { slug: 'good', lastModified: new Date('2026-06-02T00:00:00Z') },
    ]);
  });
});
