import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockFamilyTreeFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: { findUnique: (...a: unknown[]) => mockFamilyTreeFindUnique(...a) },
  },
}));

import { loadPublicTreeBySlug } from '@/lib/tree/public-serve';

const baseTree = {
  id: 'tree-1',
  workspaceId: 'ws-1',
  nameAr: 'آل السعيد',
  lastModifiedAt: new Date(),
  publicSlug: 'abc123xyz',
  kind: 'main',
  workspace: {
    nameAr: 'آل السعيد',
    enableKunya: true,
    hideBirthDateForFemale: false,
    hideBirthDateForMale: false,
  },
};

beforeEach(() => vi.clearAllMocks());

describe('loadPublicTreeBySlug — deny-by-default', () => {
  test('returns null for an unknown slug', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(null);
    expect(await loadPublicTreeBySlug('nope')).toBeNull();
  });

  test('returns null for a PRIVATE tree (even though the slug is kept)', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({ ...baseTree, visibility: 'private' });
    expect(await loadPublicTreeBySlug('abc123xyz')).toBeNull();
  });

  test('returns null for an extra tree when collections is OFF (fail-closed)', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({
      ...baseTree,
      kind: 'extra',
      visibility: 'public_link',
      workspace: { ...baseTree.workspace, enableCollections: false },
    });
    expect(await loadPublicTreeBySlug('abc123xyz')).toBeNull();
  });

  test('returns null for an extra tree when enableCollections is absent (deny-by-default)', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({
      ...baseTree,
      kind: 'extra',
      visibility: 'public_link',
    });
    expect(await loadPublicTreeBySlug('abc123xyz')).toBeNull();
  });

  test('returns the record for a public extra tree when collections is ON', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({
      ...baseTree,
      kind: 'extra',
      visibility: 'public_link',
      workspace: { ...baseTree.workspace, enableCollections: true },
    });
    const rec = await loadPublicTreeBySlug('abc123xyz');
    expect(rec?.visibility).toBe('public_link');
    expect(rec?.treeId).toBe('tree-1');
  });

  test('returns the record for a public_link tree', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({ ...baseTree, visibility: 'public_link' });
    const rec = await loadPublicTreeBySlug('abc123xyz');
    expect(rec?.visibility).toBe('public_link');
    expect(rec?.publicSlug).toBe('abc123xyz');
  });

  test('returns the record for a public_listed tree', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({ ...baseTree, visibility: 'public_listed' });
    const rec = await loadPublicTreeBySlug('abc123xyz');
    expect(rec?.visibility).toBe('public_listed');
  });
});
