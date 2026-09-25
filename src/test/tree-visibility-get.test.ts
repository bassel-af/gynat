import { describe, test, expect, vi, beforeEach } from 'vitest';

// GET /api/workspaces/[id]/tree/visibility — the tree's CURRENT publish level,
// for the sources «من يرى هذا المصدر؟» live status line. Admin-only (the only
// role that can pick the public level), selects the level only.

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    familyTree: { findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a) },
  },
}));

import { GET } from '@/app/api/workspaces/[id]/tree/visibility/route';

const WS = 'ws-1';
const TREE = '11111111-1111-4111-8111-111111111111';

function auth(role: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({ userId: 'u1', workspaceId: WS, role, permissions: [] });
}

function req(qs = '') {
  return new Request(`http://localhost/api/workspaces/${WS}/tree/visibility${qs}`, {
    headers: { authorization: 'Bearer tok' },
  }) as unknown as import('next/server').NextRequest;
}

const params = Promise.resolve({ id: WS });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET tree visibility', () => {
  test('admin gets the main tree level', async () => {
    auth('workspace_admin');
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'public_link' });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ visibility: 'public_link' });
    expect(mockFamilyTreeFindFirst.mock.calls[0][0].where).toEqual({ workspaceId: WS, kind: 'main' });
  });

  test('treeId scopes the lookup to this workspace', async () => {
    auth('workspace_admin');
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'private' });
    await GET(req(`?treeId=${TREE}`), { params });
    expect(mockFamilyTreeFindFirst.mock.calls[0][0].where).toEqual({
      id: TREE,
      workspaceId: WS,
      kind: { in: ['main', 'extra'] },
    });
  });

  test('unknown tree is 404', async () => {
    auth('workspace_admin');
    mockFamilyTreeFindFirst.mockResolvedValue(null);
    const res = await GET(req(`?treeId=${TREE}`), { params });
    expect(res.status).toBe(404);
  });

  test('a non-admin member is refused', async () => {
    auth('workspace_member');
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
    expect(mockFamilyTreeFindFirst).not.toHaveBeenCalled();
  });
});
