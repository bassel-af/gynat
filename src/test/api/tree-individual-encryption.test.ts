/**
 * Phase 10b integration test: individual mutation routes must encrypt
 * sensitive fields before writing to the DB, and the read path must decrypt
 * them back to plaintext.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateWorkspaceKey,
  wrapKey,
  encryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';

// ---------------------------------------------------------------------------
// Shared encrypted workspace key — wrapped with the real master key so the
// production `getWorkspaceKey()` path can unwrap it successfully.
// ---------------------------------------------------------------------------

const PLAINTEXT_KEY = generateWorkspaceKey();
const WRAPPED_KEY = wrapKey(PLAINTEXT_KEY, getMasterKey());

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
  treeMutateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualCreate = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockTreeEditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      create: (...args: unknown[]) => mockIndividualCreate(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';

const wsId = 'ws-enc-test-1';
const treeId = 'tree-enc-test-1';
const userId = 'user-enc-test-1';

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/individuals`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId, email: 't@x.com', user_metadata: { display_name: 'T' } } },
    error: null,
  });
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces/[id]/tree/individuals — Phase 10b encrypt on write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();

    // Workspace has both enableKunya flag AND encryptedKey so getWorkspaceKey unwraps
    mockWorkspaceFindUnique.mockResolvedValue({
      enableKunya: true,
      encryptedKey: WRAPPED_KEY,
    });

    mockFamilyTreeFindUnique.mockResolvedValue({
      id: treeId,
      workspaceId: wsId,
      lastModifiedAt: new Date(),
    });

    // Individual.create echoes back what we gave it (Prisma behavior)
    mockIndividualCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ind-new-1',
      treeId,
      gedcomId: null,
      sex: data.sex ?? null,
      isPrivate: data.isPrivate ?? false,
      isDeceased: data.isDeceased ?? false,
      createdById: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      birthPlaceId: data.birthPlaceId ?? null,
      deathPlaceId: data.deathPlaceId ?? null,
      // Return the same Buffer the route passed in
      ...data,
    }));

    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyTreeUpdate.mockResolvedValue({});
  });

  test('writes AES-encrypted Bytes for sensitive Individual fields', async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const response = await POST(makeRequest({
      givenName: 'أحمد',
      surname: 'الشربك',
      sex: 'M',
      birthDate: '1990-01-01',
      birthPlace: 'دمشق',
      kunya: 'أبو محمد',
      notes: 'family patriarch',
      isPrivate: false,
    }), { params: Promise.resolve({ id: wsId }) });

    expect(response.status).toBe(201);
    expect(mockIndividualCreate).toHaveBeenCalledTimes(1);

    const createArgs = mockIndividualCreate.mock.calls[0][0];
    const data = createArgs.data;

    // Plaintext scalars untouched
    expect(data.treeId).toBe(treeId);
    expect(data.sex).toBe('M');
    expect(data.isPrivate).toBe(false);
    expect(data.isDeceased).toBe(false); // deathDate not given
    expect(data.createdById).toBe(userId);

    // Sensitive fields are Buffers, not strings
    expect(Buffer.isBuffer(data.givenName)).toBe(true);
    expect(Buffer.isBuffer(data.surname)).toBe(true);
    expect(Buffer.isBuffer(data.birthDate)).toBe(true);
    expect(Buffer.isBuffer(data.birthPlace)).toBe(true);
    expect(Buffer.isBuffer(data.kunya)).toBe(true);
    expect(Buffer.isBuffer(data.notes)).toBe(true);

    // And they are NOT just the raw UTF-8 bytes of the plaintext —
    // encryption changes them meaningfully
    const directAhmad = Buffer.from('أحمد', 'utf8');
    expect((data.givenName as Buffer).equals(directAhmad)).toBe(false);
  });

  test('encrypted Buffers round-trip through the real crypto adapter', async () => {
    const { decryptFieldNullable } = await import('@/lib/crypto/workspace-encryption');
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');

    await POST(makeRequest({
      givenName: 'فاطمة',
      surname: null,
      sex: 'F',
      birthDate: '2000-03-14',
      birthHijriDate: '1420-11-08',
      birthPlace: 'حلب',
      notes: 'test',
      isPrivate: false,
    }), { params: Promise.resolve({ id: wsId }) });

    const data = mockIndividualCreate.mock.calls[0][0].data;

    expect(decryptFieldNullable(data.givenName, PLAINTEXT_KEY)).toBe('فاطمة');
    expect(data.surname).toBeNull();
    expect(decryptFieldNullable(data.birthDate, PLAINTEXT_KEY)).toBe('2000-03-14');
    expect(decryptFieldNullable(data.birthHijriDate, PLAINTEXT_KEY)).toBe('1420-11-08');
    expect(decryptFieldNullable(data.birthPlace, PLAINTEXT_KEY)).toBe('حلب');
    expect(decryptFieldNullable(data.notes, PLAINTEXT_KEY)).toBe('test');
  });

  test('audit log description is an encrypted Buffer that decrypts to plaintext', async () => {
    // Phase 10b follow-up (task #22): description is now encrypted on write
    // via `encryptAuditDescription`. This test originally asserted plaintext;
    // it now asserts the Buffer shape + correct decryption roundtrip.
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');

    await POST(makeRequest({
      givenName: 'عمر',
      sex: 'M',
      isPrivate: false,
    }), { params: Promise.resolve({ id: wsId }) });

    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);
    const logArgs = mockTreeEditLogCreate.mock.calls[0][0];
    const description = logArgs.data.description;

    // description should be an encrypted Buffer (>= 28 bytes for IV + tag)
    expect(Buffer.isBuffer(description)).toBe(true);
    expect((description as Buffer).length).toBeGreaterThanOrEqual(28);

    // And must NOT be the raw UTF-8 bytes of the plaintext "إضافة شخص "عمر""
    const directUtf8 = Buffer.from('إضافة شخص "عمر"', 'utf8');
    expect((description as Buffer).equals(directUtf8)).toBe(false);

    // Decrypt with the real plaintext workspace key from beforeAll and verify
    const { decryptAuditDescription } = await import('@/lib/tree/audit');
    const plaintext = decryptAuditDescription(description, PLAINTEXT_KEY);
    expect(plaintext).toContain('عمر');
  });

  test('reading the created row back through the real mapper yields plaintext', async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    await POST(makeRequest({
      givenName: 'ليلى',
      surname: 'السعيد',
      sex: 'F',
      birthDate: '1985-05-20',
      isPrivate: false,
    }), { params: Promise.resolve({ id: wsId }) });

    // Simulate the row coming back from the DB and being mapped
    const writtenData = mockIndividualCreate.mock.calls[0][0].data;
    const { dbTreeToGedcomData } = await import('@/lib/tree/mapper');
    const gedcom = dbTreeToGedcomData(
      {
        id: treeId,
        workspaceId: wsId,
        individuals: [
          {
            id: 'ind-new-1',
            treeId,
            gedcomId: null,
            sex: 'F',
            isDeceased: false,
            isPrivate: false,
            createdById: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            birthPlaceId: null,
            deathPlaceId: null,
            // All encrypted Bytes fields — default null, override what the route wrote
            givenName: writtenData.givenName,
            surname: writtenData.surname,
            fullName: null,
            birthDate: writtenData.birthDate,
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
        families: [],
      } as unknown as Parameters<typeof dbTreeToGedcomData>[0],
      PLAINTEXT_KEY,
    );

    const ind = gedcom.individuals['ind-new-1'];
    expect(ind).toBeDefined();
    expect(ind.givenName).toBe('ليلى');
    expect(ind.surname).toBe('السعيد');
    expect(ind.name).toBe('ليلى السعيد');
    expect(ind.birth).toBe('1985-05-20');
    expect(ind.sex).toBe('F');
  });
});
