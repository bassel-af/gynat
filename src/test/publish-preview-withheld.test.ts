import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBranchPointerFindMany = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: { findMany: (...a: unknown[]) => mockBranchPointerFindMany(...a) },
    familyTree: { findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a) },
  },
}));

import { getWithheldBorrowedBranches } from '@/lib/tree/public-serve';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getWithheldBorrowedBranches', () => {
  test('returns branches whose source tree is private', async () => {
    mockBranchPointerFindMany.mockResolvedValue([
      {
        sourceWorkspaceId: 'priv-ws',
        rootIndividualId: 'r1',
        sourceWorkspace: { nameAr: 'العائلة الخاصة' },
        rootIndividual: { givenName: 'سعد', surname: 'الخاص' },
      },
    ]);
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'private' });

    const withheld = await getWithheldBorrowedBranches('home-ws');
    expect(withheld).toHaveLength(1);
    expect(withheld[0].sourceWorkspaceNameAr).toBe('العائلة الخاصة');
    expect(withheld[0].rootName).toContain('سعد');
  });

  test('does NOT return branches whose source tree is public', async () => {
    mockBranchPointerFindMany.mockResolvedValue([
      {
        sourceWorkspaceId: 'pub-ws',
        rootIndividualId: 'r1',
        sourceWorkspace: { nameAr: 'العائلة العامة' },
        rootIndividual: { givenName: 'علي', surname: '' },
      },
    ]);
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'public_link' });

    const withheld = await getWithheldBorrowedBranches('home-ws');
    expect(withheld).toHaveLength(0);
  });

  test('treats a missing source tree as withheld (fail-closed)', async () => {
    mockBranchPointerFindMany.mockResolvedValue([
      {
        sourceWorkspaceId: 'gone-ws',
        rootIndividualId: 'r1',
        sourceWorkspace: { nameAr: 'مفقودة' },
        rootIndividual: { givenName: 'x', surname: '' },
      },
    ]);
    mockFamilyTreeFindFirst.mockResolvedValue(null);

    const withheld = await getWithheldBorrowedBranches('home-ws');
    expect(withheld).toHaveLength(1);
  });

  test('returns empty when there are no active pointers', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    const withheld = await getWithheldBorrowedBranches('home-ws');
    expect(withheld).toEqual([]);
  });

  // S20: collection-link pointers (anchorless, isCollectionLink=true) must be
  // excluded at the DB level — they are NOT real borrowed branches and must not
  // be listed as withheld in the publish preview. The query has to filter them
  // out (fail-closed) rather than rely on post-fetch logic.
  test('excludes collection-link pointers via the query WHERE (isCollectionLink: false)', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    await getWithheldBorrowedBranches('home-ws');
    const whereArg = mockBranchPointerFindMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      targetWorkspaceId: 'home-ws',
      status: 'active',
      isCollectionLink: false,
    });
  });
});
