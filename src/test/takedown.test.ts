import { describe, test, expect } from 'vitest';
import { planTakedown, type ProvenanceRow } from '@/lib/admin/takedown';

function row(overrides: Partial<ProvenanceRow>): ProvenanceRow {
  return {
    id: 'pv-1',
    copiedTreeId: 'tree-A',
    copiedRootId: 'root-A',
    sourceWorkspaceId: 'src-ws',
    sourceTreeId: 'src-tree',
    sourceRootId: 'src-root',
    reason: 'going_private',
    ...overrides,
  };
}

describe('planTakedown', () => {
  test('groups copied roots by their copied tree', () => {
    const rows: ProvenanceRow[] = [
      row({ copiedTreeId: 'tree-A', copiedRootId: 'r1' }),
      row({ copiedTreeId: 'tree-A', copiedRootId: 'r2' }),
      row({ copiedTreeId: 'tree-B', copiedRootId: 'r3' }),
    ];
    const plan = planTakedown(rows);
    expect(plan).toHaveLength(2);
    const a = plan.find((p) => p.copiedTreeId === 'tree-A');
    expect(a?.copiedRootIds.sort()).toEqual(['r1', 'r2']);
    const b = plan.find((p) => p.copiedTreeId === 'tree-B');
    expect(b?.copiedRootIds).toEqual(['r3']);
  });

  test('deduplicates a copied root that appears twice in one tree', () => {
    const rows: ProvenanceRow[] = [
      row({ copiedTreeId: 'tree-A', copiedRootId: 'r1' }),
      row({ copiedTreeId: 'tree-A', copiedRootId: 'r1' }),
    ];
    const plan = planTakedown(rows);
    expect(plan).toHaveLength(1);
    expect(plan[0].copiedRootIds).toEqual(['r1']);
  });

  test('returns an empty plan for no rows', () => {
    expect(planTakedown([])).toEqual([]);
  });
});
