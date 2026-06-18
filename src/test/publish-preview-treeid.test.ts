import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// GET /tree/publish-preview — treeId-aware (unified publish flow).
//
// The preview must resolve the SAME target an extra-tree publish hits:
//   - no treeId  → the workspace MAIN tree (unchanged behavior)
//   - ?treeId=…  → that scoped `extra` tree (fail-closed 404 for foreign/unknown)
// For an extra tree the confirmation phrase is its OWN name and the withheld
// borrowed-branches list is empty (extra trees are home-only — no borrowing).
//
// We mock the heavy collaborators (auth, resolver, mapper, checkpoint, withheld)
// so the test pins the route's wiring, not the genealogy math.
// ---------------------------------------------------------------------------

const mockRequireWorkspaceAdmin = vi.fn();
vi.mock('@/lib/api/workspace-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/workspace-auth')>(
    '@/lib/api/workspace-auth',
  );
  return {
    ...actual,
    requireWorkspaceAdmin: (...a: unknown[]) => mockRequireWorkspaceAdmin(...a),
  };
});

const mockWorkspaceFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
  },
}));

const mockResolveTargetTreeOr404 = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  resolveTargetTreeOr404: (...a: unknown[]) => mockResolveTargetTreeOr404(...a),
}));

const mockGetWorkspaceKey = vi.fn();
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: (...a: unknown[]) => mockGetWorkspaceKey(...a),
}));

vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: vi.fn(() => ({ individuals: {}, families: {} })),
}));

const mockComputeLiving = vi.fn();
vi.mock('@/lib/tree/public-visibility', () => ({
  computeLivingForCheckpoint: (...a: unknown[]) => mockComputeLiving(...a),
}));

const mockGetWithheld = vi.fn();
vi.mock('@/lib/tree/public-serve', () => ({
  getWithheldBorrowedBranches: (...a: unknown[]) => mockGetWithheld(...a),
}));

import { GET } from '@/app/api/workspaces/[id]/tree/publish-preview/route';
import { isErrorResponse } from '@/lib/api/workspace-auth';

const WS = 'ws-1';
const USER = 'user-1';

function req(treeId?: string) {
  const url = treeId
    ? `http://localhost/api/workspaces/${WS}/tree/publish-preview?treeId=${treeId}`
    : `http://localhost/api/workspaces/${WS}/tree/publish-preview`;
  return new Request(url, {
    headers: { authorization: 'Bearer tok' },
  }) as unknown as import('next/server').NextRequest;
}

const params = Promise.resolve({ id: WS });

const CHECKPOINT = { livingCount: 0, attention: [], households: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireWorkspaceAdmin.mockResolvedValue({ user: { id: USER } });
  mockWorkspaceFindUnique.mockResolvedValue({ nameAr: 'آل السعيد' });
  mockGetWorkspaceKey.mockResolvedValue(Buffer.alloc(32));
  mockComputeLiving.mockReturnValue(CHECKPOINT);
  mockGetWithheld.mockResolvedValue([
    { sourceWorkspaceNameAr: 'عائلة أخرى', rootName: 'فلان' },
  ]);
});

describe('GET publish-preview — main tree (no treeId)', () => {
  test('uses the workspace name as the phrase and includes withheld branches', async () => {
    mockResolveTargetTreeOr404.mockResolvedValue({
      id: 'main-tree',
      kind: 'main',
      nameAr: null,
      visibility: 'private',
      publicSlug: null,
      allowReuse: false,
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    // resolver scoped to the MAIN tree (treeId undefined).
    expect(mockResolveTargetTreeOr404).toHaveBeenCalledWith(WS, undefined);
    expect(body.confirmationPhrase).toBe('آل السعيد');
    // Main tree → real withheld list flows through.
    expect(body.withheldBranches).toHaveLength(1);
  });
});

describe('GET publish-preview — extra tree (?treeId)', () => {
  test('scopes the resolver to the treeId, uses the EXTRA tree name as phrase, withholds nothing', async () => {
    mockResolveTargetTreeOr404.mockResolvedValue({
      id: 'extra-9',
      kind: 'extra',
      nameAr: 'فرع بني تميم',
      visibility: 'private',
      publicSlug: null,
      allowReuse: false,
    });
    const res = await GET(req('extra-9'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockResolveTargetTreeOr404).toHaveBeenCalledWith(WS, 'extra-9');
    // Extra tree's own name is the type-to-confirm phrase.
    expect(body.confirmationPhrase).toBe('فرع بني تميم');
    // Extra trees are home-only — no borrowed branches to withhold.
    expect(body.withheldBranches).toEqual([]);
    // The workspace-scoped withheld query is never run for an extra tree.
    expect(mockGetWithheld).not.toHaveBeenCalled();
  });

  test('unknown/foreign treeId returns the resolver 404 unchanged', async () => {
    const notFound = isErrorResponse; // ensure import is used
    void notFound;
    // The real resolver returns a NextResponse 404 for a foreign id; emulate it.
    const { NextResponse } = await import('next/server');
    mockResolveTargetTreeOr404.mockResolvedValue(
      NextResponse.json({ error: 'الشجرة غير موجودة' }, { status: 404 }),
    );
    const res = await GET(req('someone-elses-tree'), { params });
    expect(res.status).toBe(404);
    // Never reaches the checkpoint computation on a 404.
    expect(mockComputeLiving).not.toHaveBeenCalled();
  });
});
