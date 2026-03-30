import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
  },
}));

// Mock branch pointer queries — no active pointers in these tests
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-etag-123';
const treeParams = { params: Promise.resolve({ id: wsId }) };

const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function makeRequest(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      ...headers,
    },
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

const lastModifiedAt = new Date('2026-03-30T12:00:00.000Z');

function mockTreeWithTimestamp(timestamp: Date = lastModifiedAt) {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-uuid-1',
    workspaceId: wsId,
    lastModifiedAt: timestamp,
    individuals: [],
    families: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree — ETag/304 caching', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns ETag header in 200 response', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    // ETag should be a quoted string
    expect(res.headers.get('etag')).toMatch(/^".*"$/);
  });

  test('returns Cache-Control header in 200 response', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control');
    expect(cc).toContain('private');
    expect(cc).toContain('max-age=30');
    expect(cc).toContain('stale-while-revalidate=300');
  });

  test('returns 304 when If-None-Match matches current ETag', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');

    // First request to get the ETag
    const req1 = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res1 = await GET(req1, treeParams);
    expect(res1.status).toBe(200);
    const etag = res1.headers.get('etag')!;
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();
    const req2 = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree`,
      { 'if-none-match': etag },
    );
    const res2 = await GET(req2, treeParams);

    expect(res2.status).toBe(304);
    // 304 should have no body
    const body = await res2.text();
    expect(body).toBe('');
  });

  test('returns 200 when If-None-Match does not match current ETag', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');

    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree`,
      { 'if-none-match': '"stale-etag-value"' },
    );
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('individuals');
    expect(body.data).toHaveProperty('families');
    // Should still include the current ETag
    expect(res.headers.get('etag')).toBeTruthy();
  });

  test('returns 200 with new ETag after tree modification', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp(new Date('2026-03-30T12:00:00.000Z'));

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');

    // First request
    const req1 = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res1 = await GET(req1, treeParams);
    const etag1 = res1.headers.get('etag')!;

    // Simulate tree modification — new timestamp
    mockAuth();
    mockMember();
    mockTreeWithTimestamp(new Date('2026-03-30T13:00:00.000Z'));

    // Second request with old ETag
    const req2 = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree`,
      { 'if-none-match': etag1 },
    );
    const res2 = await GET(req2, treeParams);

    expect(res2.status).toBe(200);
    const etag2 = res2.headers.get('etag')!;
    expect(etag2).not.toBe(etag1);
  });

  test('ETag is deterministic for the same lastModifiedAt', async () => {
    mockAuth();
    mockMember();
    mockTreeWithTimestamp();

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');

    const req1 = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res1 = await GET(req1, treeParams);
    const etag1 = res1.headers.get('etag')!;

    mockAuth();
    mockMember();
    mockTreeWithTimestamp(); // same timestamp

    const req2 = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res2 = await GET(req2, treeParams);
    const etag2 = res2.headers.get('etag')!;

    expect(etag1).toBe(etag2);
  });
});
