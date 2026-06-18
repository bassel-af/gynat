import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// promoteOwnTreesToListed (Slice C) — flips the caller-workspace public_link
// leaf trees of a collection to public_listed in one updateMany.
//
// Privacy non-negotiable: the WHERE clause is scoped to the caller's workspace
// AND visibility:'public_link' — a foreign-workspace treeId in the input list
// can never be flipped (it simply doesn't match the scope).
// ---------------------------------------------------------------------------

const mockUpdateMany = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: { updateMany: (...a: unknown[]) => mockUpdateMany(...a) },
  },
  isUniqueViolation: () => false,
}));

import { promoteOwnTreesToListed } from '@/lib/collections/queries';

const WS = 'ws-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 2 });
});

describe('promoteOwnTreesToListed', () => {
  test('flips only public_link trees in the caller workspace to public_listed', async () => {
    await promoteOwnTreesToListed(['t1', 't2'], WS);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mockUpdateMany.mock.calls[0][0];
    expect(arg.where.id).toEqual({ in: ['t1', 't2'] });
    expect(arg.where.workspaceId).toBe(WS);
    expect(arg.where.visibility).toBe('public_link');
    expect(arg.data.visibility).toBe('public_listed');
  });

  test('is a no-op (no DB write) when the tree id list is empty', async () => {
    await promoteOwnTreesToListed([], WS);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test('uses the provided transaction client when one is passed', async () => {
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { familyTree: { updateMany: txUpdateMany } };

    await promoteOwnTreesToListed(['t1'], WS, tx as never);

    expect(txUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
