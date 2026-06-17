import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// S20 item 8 — the GET branch-pointers LIST route (the incoming-branches list)
// must EXCLUDE collection-link pointers via its own `findMany` WHERE. They are
// collection items, not member-tree branch links, and must never appear in the
// workspace's incoming-branches list.
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockBranchPointerFindMany = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    branchPointer: { findMany: (...a: unknown[]) => mockBranchPointerFindMany(...a) },
  },
}));

// Encryption is irrelevant to the discriminator; stub it so the mapper runs.
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: () => Promise.resolve(Buffer.from('k')),
  decryptIndividualRow: (row: { givenName: unknown; surname: unknown }) => row,
}));

import { NextRequest } from 'next/server';

const WS = 'ws-uuid-0001';
const user = { id: 'user-1', email: 'a@b.com' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  mockMembershipFindUnique.mockResolvedValue({ userId: user.id, workspaceId: WS, role: 'workspace_member', permissions: [] });
});

function getReq() {
  return new NextRequest(`http://localhost:3000/api/workspaces/${WS}/branch-pointers`, {
    method: 'GET',
    headers: { authorization: 'Bearer t' },
  });
}

describe('GET branch-pointers list excludes collection-link pointers', () => {
  test('the list query filters isCollectionLink:false', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const res = await GET(getReq(), { params: Promise.resolve({ id: WS }) });
    expect(res.status).toBe(200);
    const where = mockBranchPointerFindMany.mock.calls[0][0].where;
    expect(where.targetWorkspaceId).toBe(WS);
    expect(where.isCollectionLink).toBe(false);
  });
});
