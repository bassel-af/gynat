/**
 * Phase 1 — Platform Owner Dashboard / Engagement metrics.
 *
 * Unit tests for `getEngagementMetrics()` at `src/lib/admin/queries.ts`.
 * All Prisma reads are mocked; fixtures are crafted so the k-anonymity rule
 * (top-N list excludes workspaces with fewer than 5 total members) is
 * explicitly exercised.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockFamilyTreeCount = vi.fn();
const mockTreeEditLogCount = vi.fn();
const mockTreeEditLogGroupBy = vi.fn();
const mockMembershipGroupBy = vi.fn();
const mockWorkspaceFindMany = vi.fn();
const mockBranchPointerGroupBy = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: {
      count: (...args: unknown[]) => mockFamilyTreeCount(...args),
    },
    treeEditLog: {
      count: (...args: unknown[]) => mockTreeEditLogCount(...args),
      groupBy: (...args: unknown[]) => mockTreeEditLogGroupBy(...args),
    },
    workspaceMembership: {
      groupBy: (...args: unknown[]) => mockMembershipGroupBy(...args),
    },
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
    branchPointer: {
      groupBy: (...args: unknown[]) => mockBranchPointerGroupBy(...args),
    },
  },
}));

import { getEngagementMetrics } from '@/lib/admin/queries';

describe('getEngagementMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFamilyTreeCount.mockResolvedValue(0);
    mockTreeEditLogCount.mockResolvedValue(0);
    mockTreeEditLogGroupBy.mockResolvedValue([]);
    mockMembershipGroupBy.mockResolvedValue([]);
    mockWorkspaceFindMany.mockResolvedValue([]);
    mockBranchPointerGroupBy.mockResolvedValue([]);
  });

  test('weeklyActiveWorkspaces counts FamilyTree rows with lastModifiedAt gte now-7d', async () => {
    mockFamilyTreeCount.mockImplementation((args?: { where?: { lastModifiedAt?: { gte?: Date } } }) => {
      const gte = args?.where?.lastModifiedAt?.gte;
      if (!gte) return Promise.resolve(0);
      const deltaMs = Date.now() - gte.getTime();
      if (Math.abs(deltaMs - 7 * 86_400_000) < 2_000) return Promise.resolve(11);
      return Promise.resolve(0);
    });

    const metrics = await getEngagementMetrics();
    expect(metrics.weeklyActiveWorkspaces).toBe(11);
  });

  test('editsLast7d and editsLast30d count TreeEditLog rows in the correct windows', async () => {
    mockTreeEditLogCount.mockImplementation((args?: { where?: { timestamp?: { gte?: Date } } }) => {
      const gte = args?.where?.timestamp?.gte;
      if (!gte) return Promise.resolve(0);
      const deltaMs = Date.now() - gte.getTime();
      if (Math.abs(deltaMs - 7 * 86_400_000) < 2_000) return Promise.resolve(40);
      if (Math.abs(deltaMs - 30 * 86_400_000) < 2_000) return Promise.resolve(160);
      return Promise.resolve(0);
    });

    const metrics = await getEngagementMetrics();
    expect(metrics.editsLast7d).toBe(40);
    expect(metrics.editsLast30d).toBe(160);
  });

  test('avgEditsPerActiveWorkspace = editsLast7d / weeklyActiveWorkspaces, rounded to 2 decimals', async () => {
    mockFamilyTreeCount.mockResolvedValue(4);
    mockTreeEditLogCount.mockImplementation((args?: { where?: { timestamp?: { gte?: Date } } }) => {
      const gte = args?.where?.timestamp?.gte;
      if (!gte) return Promise.resolve(0);
      const deltaMs = Date.now() - gte.getTime();
      if (Math.abs(deltaMs - 7 * 86_400_000) < 2_000) return Promise.resolve(10);
      return Promise.resolve(0);
    });

    const metrics = await getEngagementMetrics();
    expect(metrics.avgEditsPerActiveWorkspace).toBe(2.5);
  });

  test('avgEditsPerActiveWorkspace is null when weeklyActiveWorkspaces is 0', async () => {
    mockFamilyTreeCount.mockResolvedValue(0);
    mockTreeEditLogCount.mockResolvedValue(100);

    const metrics = await getEngagementMetrics();
    expect(metrics.avgEditsPerActiveWorkspace).toBeNull();
  });

  test('workspacesWithMultipleMembers counts workspaces with >= 2 memberships', async () => {
    mockMembershipGroupBy.mockResolvedValue([
      { workspaceId: 'ws1', _count: { userId: 3 } },
      { workspaceId: 'ws2', _count: { userId: 2 } },
      { workspaceId: 'ws3', _count: { userId: 1 } }, // single member — ignore
      { workspaceId: 'ws4', _count: { userId: 5 } },
    ]);

    const metrics = await getEngagementMetrics();
    expect(metrics.workspacesWithMultipleMembers).toBe(3);
  });

  test('topActiveWorkspaces7d excludes workspaces with fewer than 5 members (k-anonymity)', async () => {
    // ws-small has the most edits BUT only 2 members → must be filtered out.
    mockTreeEditLogGroupBy.mockResolvedValue([
      { treeId: 'tree-small', _count: { _all: 999 } },
      { treeId: 'tree-big-a', _count: { _all: 50 } },
      { treeId: 'tree-big-b', _count: { _all: 30 } },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'ws-small', nameAr: 'آل صغير', familyTrees: [{ id: 'tree-small' }], _count: { memberships: 2 } },
      { id: 'ws-big-a', nameAr: 'آل كبير أ', familyTrees: [{ id: 'tree-big-a' }], _count: { memberships: 7 } },
      { id: 'ws-big-b', nameAr: 'آل كبير ب', familyTrees: [{ id: 'tree-big-b' }], _count: { memberships: 5 } },
    ]);

    const metrics = await getEngagementMetrics();

    expect(metrics.topActiveWorkspaces7d).toEqual([
      { workspaceId: 'ws-big-a', name: 'آل كبير أ', editCount: 50 },
      { workspaceId: 'ws-big-b', name: 'آل كبير ب', editCount: 30 },
    ]);
    // Confirm small one is excluded
    const ids = metrics.topActiveWorkspaces7d.map((w) => w.workspaceId);
    expect(ids).not.toContain('ws-small');
  });

  test('topActiveWorkspaces7d caps at 10 entries after k-anonymity filter', async () => {
    const groups = Array.from({ length: 15 }, (_, i) => ({
      treeId: `tree-${i}`,
      _count: { _all: 100 - i },
    }));
    mockTreeEditLogGroupBy.mockResolvedValue(groups);
    mockWorkspaceFindMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        id: `ws-${i}`,
        nameAr: `family-${i}`,
        familyTrees: [{ id: `tree-${i}` }],
        _count: { memberships: 5 },
      })),
    );

    const metrics = await getEngagementMetrics();
    expect(metrics.topActiveWorkspaces7d.length).toBe(10);
  });

  test('topActiveWorkspaces7d ordered by editCount desc', async () => {
    mockTreeEditLogGroupBy.mockResolvedValue([
      { treeId: 'tree-a', _count: { _all: 10 } },
      { treeId: 'tree-b', _count: { _all: 50 } },
      { treeId: 'tree-c', _count: { _all: 30 } },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'ws-a', nameAr: 'a', familyTrees: [{ id: 'tree-a' }], _count: { memberships: 5 } },
      { id: 'ws-b', nameAr: 'b', familyTrees: [{ id: 'tree-b' }], _count: { memberships: 5 } },
      { id: 'ws-c', nameAr: 'c', familyTrees: [{ id: 'tree-c' }], _count: { memberships: 5 } },
    ]);

    const metrics = await getEngagementMetrics();
    expect(metrics.topActiveWorkspaces7d.map((w) => w.editCount)).toEqual([50, 30, 10]);
  });

  test('topActiveWorkspaces7d rows contain only workspaceId, name, editCount — no user data', async () => {
    mockTreeEditLogGroupBy.mockResolvedValue([
      { treeId: 'tree-a', _count: { _all: 10 } },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([
      {
        id: 'ws-a',
        nameAr: 'a',
        familyTrees: [{ id: 'tree-a' }],
        _count: { memberships: 5 },
      },
    ]);

    const metrics = await getEngagementMetrics();
    expect(metrics.topActiveWorkspaces7d).toHaveLength(1);
    expect(Object.keys(metrics.topActiveWorkspaces7d[0]).sort()).toEqual(
      ['editCount', 'name', 'workspaceId'].sort(),
    );
  });

  test('branchPointers counts rows by status', async () => {
    mockBranchPointerGroupBy.mockResolvedValue([
      { status: 'active', _count: { _all: 3 } },
      { status: 'revoked', _count: { _all: 1 } },
      { status: 'broken', _count: { _all: 2 } },
    ]);
    const metrics = await getEngagementMetrics();
    expect(metrics.branchPointers).toEqual({ active: 3, revoked: 1, broken: 2 });
  });

  test('branchPointers defaults to 0 for any missing status', async () => {
    mockBranchPointerGroupBy.mockResolvedValue([
      { status: 'active', _count: { _all: 5 } },
    ]);
    const metrics = await getEngagementMetrics();
    expect(metrics.branchPointers).toEqual({ active: 5, revoked: 0, broken: 0 });
  });
});
