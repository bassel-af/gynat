/**
 * Platform Owner Dashboard / Content metrics.
 *
 * Unit tests for `getContentMetrics()` at `src/lib/admin/queries.ts`.
 * Prisma is mocked: `workspace.findMany` returns the workspace+tree fixtures
 * and `individual.groupBy` returns per-tree headcounts. We assert the join,
 * the descending sort, empty-workspace handling, and the aggregate totals.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockWorkspaceFindMany = vi.fn();
const mockIndividualGroupBy = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
    individual: {
      groupBy: (...args: unknown[]) => mockIndividualGroupBy(...args),
    },
  },
}));

import { getContentMetrics } from '@/lib/admin/queries';

describe('getContentMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('joins individual counts onto each workspace tree and sorts by people desc', async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'w-small', nameAr: 'صغيرة', familyTree: { id: 't-small' } },
      { id: 'w-big', nameAr: 'كبيرة', familyTree: { id: 't-big' } },
      { id: 'w-mid', nameAr: 'وسطى', familyTree: { id: 't-mid' } },
    ]);
    mockIndividualGroupBy.mockResolvedValue([
      { treeId: 't-big', _count: { _all: 100 } },
      { treeId: 't-small', _count: { _all: 5 } },
      { treeId: 't-mid', _count: { _all: 40 } },
    ]);

    const m = await getContentMetrics();

    expect(m.workspaces.map((w) => [w.workspaceId, w.people])).toEqual([
      ['w-big', 100],
      ['w-mid', 40],
      ['w-small', 5],
    ]);
    expect(m.totalPeople).toBe(145);
    expect(m.emptyWorkspaces).toBe(0);
  });

  test('workspace without a familyTree reports 0 people', async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'w-none', nameAr: 'بلا شجرة', familyTree: null },
      { id: 'w-has', nameAr: 'لها شجرة', familyTree: { id: 't-has' } },
    ]);
    mockIndividualGroupBy.mockResolvedValue([{ treeId: 't-has', _count: { _all: 3 } }]);

    const m = await getContentMetrics();

    expect(m.workspaces.find((w) => w.workspaceId === 'w-none')?.people).toBe(0);
    expect(m.workspaces.find((w) => w.workspaceId === 'w-has')?.people).toBe(3);
  });

  test('workspace with a tree but no matching group entry reports 0 people', async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'w-empty', nameAr: 'فارغة', familyTree: { id: 't-empty' } },
    ]);
    // groupBy omits trees with zero rows entirely.
    mockIndividualGroupBy.mockResolvedValue([]);

    const m = await getContentMetrics();

    expect(m.workspaces[0].people).toBe(0);
    expect(m.emptyWorkspaces).toBe(1);
  });

  test('counts every empty workspace and sums totalPeople across all', async () => {
    mockWorkspaceFindMany.mockResolvedValue([
      { id: 'a', nameAr: 'أ', familyTree: { id: 'ta' } },
      { id: 'b', nameAr: 'ب', familyTree: { id: 'tb' } },
      { id: 'c', nameAr: 'ج', familyTree: null },
    ]);
    mockIndividualGroupBy.mockResolvedValue([{ treeId: 'ta', _count: { _all: 7 } }]);

    const m = await getContentMetrics();

    expect(m.totalPeople).toBe(7);
    expect(m.emptyWorkspaces).toBe(2); // b (tree, no rows) + c (no tree)
    // Empty workspaces sink to the bottom; tie broken by Arabic name order.
    expect(m.workspaces[0].workspaceId).toBe('a');
  });

  test('return shape is flat with the documented keys', async () => {
    mockWorkspaceFindMany.mockResolvedValue([]);
    mockIndividualGroupBy.mockResolvedValue([]);

    const m = await getContentMetrics();

    expect(Object.keys(m).sort()).toEqual(
      ['emptyWorkspaces', 'totalPeople', 'workspaces'].sort(),
    );
    expect(Array.isArray(m.workspaces)).toBe(true);
    expect(m.totalPeople).toBe(0);
    expect(m.emptyWorkspaces).toBe(0);
  });
});
