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

// Mock rate limiter to always allow requests (rate-limit logic tested separately)
vi.mock('@/lib/api/rate-limit', () => ({
  treeExportLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
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

const wsId = 'ws-uuid-export-123';
const exportParams = { params: Promise.resolve({ id: wsId }) };

const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function makeRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
}

function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

function mockNotMember() {
  mockMembershipFindUnique.mockResolvedValue(null);
}

function mockWorkspace(slug: string = 'test-family') {
  mockWorkspaceFindUnique.mockResolvedValue({ slug });
}

const now = new Date();

function mockEmptyTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-uuid-1',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [],
    families: [],
  });
}

function mockTreeWithData() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-uuid-1',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [
      {
        id: 'ind-1',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        givenName: 'محمد',
        surname: 'السعيد',
        fullName: null,
        sex: 'M',
        birthDate: '1950',
        birthPlace: null,
        birthPlaceId: null,
        birthNotes: null,
        birthDescription: null,
        birthHijriDate: null,
        deathDate: null,
        deathPlace: null,
        deathPlaceId: null,
        deathNotes: null,
        deathDescription: null,
        deathHijriDate: null,
        notes: null,
        isDeceased: false,
        isPrivate: false,
        createdById: null,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: 'ind-2',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        givenName: 'فاطمة',
        surname: null,
        fullName: null,
        sex: 'F',
        birthDate: null,
        birthPlace: null,
        birthPlaceId: null,
        birthNotes: null,
        birthDescription: null,
        birthHijriDate: null,
        deathDate: null,
        deathPlace: null,
        deathPlaceId: null,
        deathNotes: null,
        deathDescription: null,
        deathHijriDate: null,
        notes: null,
        isDeceased: false,
        isPrivate: false,
        createdById: null,
        updatedAt: now,
        createdAt: now,
      },
    ],
    families: [
      {
        id: 'fam-1',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        husbandId: 'ind-1',
        wifeId: 'ind-2',
        children: [],
        marriageContractDate: null,
        marriageContractHijriDate: null,
        marriageContractPlace: null,
        marriageContractPlaceId: null,
        marriageContractDescription: null,
        marriageContractNotes: null,
        marriageDate: null,
        marriageHijriDate: null,
        marriagePlace: null,
        marriagePlaceId: null,
        marriageDescription: null,
        marriageNotes: null,
        isUmmWalad: false,
        isDivorced: false,
        divorceDate: null,
        divorceHijriDate: null,
        divorcePlace: null,
        divorcePlaceId: null,
        divorceDescription: null,
        divorceNotes: null,
      },
    ],
  });
}

function mockTreeWithPrivateIndividual() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-uuid-1',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [
      {
        id: 'ind-public',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        givenName: 'محمد',
        surname: 'السعيد',
        fullName: null,
        sex: 'M',
        birthDate: '1950',
        birthPlace: 'مكة',
        birthPlaceId: null,
        birthNotes: null,
        birthDescription: null,
        birthHijriDate: null,
        deathDate: null,
        deathPlace: null,
        deathPlaceId: null,
        deathNotes: null,
        deathDescription: null,
        deathHijriDate: null,
        notes: null,
        isDeceased: false,
        isPrivate: false,
        createdById: null,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: 'ind-private',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        givenName: 'فاطمة',
        surname: 'السعيد',
        fullName: null,
        sex: 'F',
        birthDate: '1960',
        birthPlace: 'المدينة',
        birthPlaceId: null,
        birthNotes: null,
        birthDescription: null,
        birthHijriDate: null,
        deathDate: '2020',
        deathPlace: 'جدة',
        deathPlaceId: null,
        deathNotes: null,
        deathDescription: null,
        deathHijriDate: null,
        notes: null,
        isDeceased: true,
        isPrivate: true,
        createdById: null,
        updatedAt: now,
        createdAt: now,
      },
    ],
    families: [
      {
        id: 'fam-1',
        treeId: 'tree-uuid-1',
        gedcomId: null,
        husbandId: 'ind-public',
        wifeId: 'ind-private',
        children: [],
        marriageContractDate: null,
        marriageContractHijriDate: null,
        marriageContractPlace: null,
        marriageContractPlaceId: null,
        marriageContractDescription: null,
        marriageContractNotes: null,
        marriageDate: null,
        marriageHijriDate: null,
        marriagePlace: null,
        marriagePlaceId: null,
        marriageDescription: null,
        marriageNotes: null,
        isUmmWalad: false,
        isDivorced: false,
        divorceDate: null,
        divorceHijriDate: null,
        divorcePlace: null,
        divorcePlaceId: null,
        divorceDescription: null,
        divorceNotes: null,
      },
    ],
  });
}

function mockNoTree() {
  mockFamilyTreeFindUnique.mockResolvedValue(null);
  mockFamilyTreeCreate.mockResolvedValue({
    id: 'tree-uuid-new',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [],
    families: [],
  });
}

const baseUrl = `http://localhost:4000/api/workspaces/${wsId}/tree/export`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree/export', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-member', async () => {
    mockAuth();
    mockNotMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(403);
  });

  test('returns 200 for workspace member', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
  });

  // ── Version param validation ──────────────────────────────────────────

  test('accepts ?version=5.5.1 and produces 5.5.1 output', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('2 VERS 5.5.1');
  });

  test('accepts ?version=7.0 and produces 7.0 output', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=7.0`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('2 VERS 7.0');
  });

  test('returns 400 for invalid version param', async () => {
    mockAuth();
    mockMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=6.0`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(400);
  });

  test('defaults to 5.5.1 when version param is missing', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(baseUrl);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('2 VERS 5.5.1');
  });

  test('returns 400 for version with injection attempt', async () => {
    mockAuth();
    mockMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1%0d%0aInjected`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(400);
  });

  // ── Response headers ──────────────────────────────────────────────────

  test('sets Content-Type to text/plain', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('text/plain');
  });

  test('sets Content-Disposition header with .ged filename', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace('saeed');
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    const contentDisposition = res.headers.get('content-disposition');
    expect(contentDisposition).toBe('attachment; filename="saeed.ged"');
  });

  test('uses fallback filename when workspace not found', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspaceFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    const contentDisposition = res.headers.get('content-disposition');
    expect(contentDisposition).toContain('.ged');
    expect(contentDisposition).toContain('attachment');
  });

  test('sets Cache-Control to private, no-store', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    const cacheControl = res.headers.get('cache-control');
    expect(cacheControl).toBe('private, no-store');
  });

  // ── Valid GEDCOM output ───────────────────────────────────────────────

  test('response body starts with 0 HEAD and ends with 0 TRLR', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    const body = await res.text();
    const lines = body.split(/\r\n|\r|\n/).filter((l: string) => l.trim() !== '');
    expect(lines[0]).toBe('0 HEAD');
    expect(lines[lines.length - 1]).toBe('0 TRLR');
  });

  test('exports tree data from database as valid GEDCOM', async () => {
    mockAuth();
    mockMember();
    mockTreeWithData();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();

    // Should contain individual records
    expect(body).toContain('@ind-1@ INDI');
    expect(body).toContain('1 NAME محمد /السعيد/');
    expect(body).toContain('1 SEX M');
    expect(body).toContain('@ind-2@ INDI');
    expect(body).toContain('1 SEX F');

    // Should contain family record
    expect(body).toContain('@fam-1@ FAM');
    expect(body).toContain('1 HUSB @ind-1@');
    expect(body).toContain('1 WIFE @ind-2@');
  });

  // ── Empty tree ────────────────────────────────────────────────────────

  test('returns valid GEDCOM for workspace with no tree data', async () => {
    mockAuth();
    mockMember();
    mockNoTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('0 HEAD');
    expect(body).toContain('0 TRLR');
    expect(body).not.toMatch(/@\S+@ INDI/);
    expect(body).not.toMatch(/@\S+@ FAM/);
  });

  // ── Privacy redaction ─────────────────────────────────────────────────

  test('redacts private individuals in exported GEDCOM', async () => {
    mockAuth();
    mockMember();
    mockTreeWithPrivateIndividual();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=5.5.1`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();

    // Public individual should appear normally
    expect(body).toContain('1 NAME محمد /السعيد/');

    // Private individual should be redacted
    expect(body).toContain('1 NAME PRIVATE');
    // PII should NOT appear
    expect(body).not.toContain('فاطمة');
    expect(body).not.toContain('المدينة');
    expect(body).not.toContain('جدة');

    // Structural data should remain
    expect(body).toContain('@ind-private@ INDI');
    expect(body).toContain('1 WIFE @ind-private@');
  });

  // ── 7.0 specific ─────────────────────────────────────────────────────

  test('7.0 export produces correct header without FORM/CHAR', async () => {
    mockAuth();
    mockMember();
    mockEmptyTree();
    mockWorkspace();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const req = makeRequest(`${baseUrl}?version=7.0`);
    const res = await GET(req, exportParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('2 VERS 7.0');
    expect(body).not.toContain('2 FORM LINEAGE-LINKED');
    expect(body).not.toContain('1 CHAR UTF-8');
  });
});
