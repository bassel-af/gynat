/**
 * Phase 10b (task #15) integration test: the GEDCOM export route must
 * decrypt encrypted DB rows end to end and serialize PLAINTEXT to the
 * exported .ged file. If any Buffer leaks through, the output contains
 * garbled characters instead of the expected Arabic names.
 *
 * This test exercises the real mapper → exporter pipeline with a workspace
 * key that wraps via the real master key, so the route's `getWorkspaceKey`
 * call unwraps correctly.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateWorkspaceKey,
  wrapKey,
  encryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';

// ---------------------------------------------------------------------------
// Shared key — wrap with the real master key so getWorkspaceKey unwraps OK.
// ---------------------------------------------------------------------------

const PLAINTEXT_KEY = generateWorkspaceKey();
const WRAPPED_KEY = wrapKey(PLAINTEXT_KEY, getMasterKey());

function encNullable(value: string | null) {
  return encryptFieldNullable(value, PLAINTEXT_KEY);
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  treeExportLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: vi.fn(),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

// NOTE: we deliberately do NOT stub `@/lib/tree/encryption` here so the
// route exercises the REAL getWorkspaceKey path, which reads
// `prisma.workspace.findUnique({ select: { encryptedKey: true } })` and
// unwraps with the real master key.

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fixture: a small encrypted tree
// ---------------------------------------------------------------------------

const wsId = 'ws-export-enc-1';
const treeId = 'tree-export-enc-1';
const fakeUser = {
  id: 'user-export-1',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function makeEncryptedTree() {
  const now = new Date();
  return {
    id: treeId,
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [
      {
        id: 'ind-1',
        treeId,
        gedcomId: null,
        sex: 'M',
        isDeceased: false,
        isPrivate: false,
        createdById: null,
        createdAt: now,
        updatedAt: now,
        birthPlaceId: null,
        deathPlaceId: null,
        birthPlaceRef: null,
        deathPlaceRef: null,
        givenName: encNullable('أحمد'),
        surname: encNullable('الشربك'),
        fullName: null,
        birthDate: encNullable('1950-05-20'),
        birthPlace: encNullable('دمشق'),
        birthDescription: null,
        birthNotes: null,
        birthHijriDate: null,
        deathDate: null,
        deathPlace: null,
        deathDescription: null,
        deathNotes: null,
        deathHijriDate: null,
        kunya: null,
        notes: null,
      },
      {
        id: 'ind-2',
        treeId,
        gedcomId: null,
        sex: 'F',
        isDeceased: false,
        isPrivate: false,
        createdById: null,
        createdAt: now,
        updatedAt: now,
        birthPlaceId: null,
        deathPlaceId: null,
        birthPlaceRef: null,
        deathPlaceRef: null,
        givenName: encNullable('فاطمة'),
        surname: encNullable('السعيد'),
        fullName: null,
        birthDate: null,
        birthPlace: null,
        birthDescription: null,
        birthNotes: null,
        birthHijriDate: null,
        deathDate: null,
        deathPlace: null,
        deathDescription: null,
        deathNotes: null,
        deathHijriDate: null,
        kunya: null,
        notes: null,
      },
    ],
    families: [
      {
        id: 'fam-1',
        treeId,
        gedcomId: null,
        husbandId: 'ind-1',
        wifeId: 'ind-2',
        children: [],
        marriageContractPlaceId: null,
        marriagePlaceId: null,
        divorcePlaceId: null,
        marriageContractPlaceRef: null,
        marriagePlaceRef: null,
        divorcePlaceRef: null,
        isUmmWalad: false,
        isDivorced: false,
        marriageContractDate: null,
        marriageContractHijriDate: null,
        marriageContractPlace: null,
        marriageContractDescription: null,
        marriageContractNotes: null,
        marriageDate: encNullable('1975-03-10'),
        marriageHijriDate: null,
        marriagePlace: encNullable('حلب'),
        marriageDescription: null,
        marriageNotes: null,
        divorceDate: null,
        divorceHijriDate: null,
        divorcePlace: null,
        divorceDescription: null,
        divorceNotes: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree/export — Phase 10b decryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: [],
    });

    // Workspace mock returns both the slug AND the encryptedKey. The route
    // calls workspace.findUnique twice: once inside getWorkspaceKey (for
    // the data key) and once at the end for the filename slug. Both hit
    // this same mocked function, so we return the union of needed fields.
    mockWorkspaceFindUnique.mockResolvedValue({
      slug: 'test-family',
      encryptedKey: WRAPPED_KEY,
      enableKunya: true,
      enableTreeExport: true,
      allowMemberExport: true,
    });

    mockFamilyTreeFindUnique.mockResolvedValue(makeEncryptedTree());
  });

  test('exported GEDCOM contains plaintext Arabic names (5.5.1)', async () => {
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const response = await GET(
      new NextRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/export?version=5.5.1`, {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      }),
      { params: Promise.resolve({ id: wsId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(response.headers.get('Content-Disposition')).toContain('test-family.ged');

    const text = await response.text();

    // Plaintext Arabic names must appear in the serialized GEDCOM
    expect(text).toContain('أحمد');
    expect(text).toContain('الشربك');
    expect(text).toContain('فاطمة');
    expect(text).toContain('السعيد');

    // Plaintext dates and places must also appear
    expect(text).toContain('1950-05-20');
    expect(text).toContain('دمشق');
    expect(text).toContain('1975-03-10');
    expect(text).toContain('حلب');

    // No ciphertext artifacts should leak — '[object Object]', 'Uint8Array',
    // or base64 hashes of the actual ciphertext.
    expect(text).not.toContain('[object Object]');
    expect(text).not.toContain('Uint8Array');
    expect(text).not.toContain('_encrypted');
  });

  test('exported GEDCOM 7.0 also emits plaintext', async () => {
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const response = await GET(
      new NextRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/export?version=7.0`, {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      }),
      { params: Promise.resolve({ id: wsId }) },
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('أحمد');
    expect(text).toContain('فاطمة');
  });
});
