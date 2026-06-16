// @vitest-environment node
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { treeImportLimiter } from '@/lib/api/rate-limit'
import { generateWorkspaceKey, wrapKey } from '@/lib/crypto/workspace-encryption'
import { getMasterKey } from '@/lib/crypto/master-key'

// Phase 10b: pre-wrapped workspace key used by the mocked prisma client.
const TEST_WRAPPED_KEY = wrapKey(generateWorkspaceKey(), getMasterKey())

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

const mockMembershipFindUnique = vi.fn()
const mockFamilyTreeFindUnique = vi.fn()
const mockFamilyTreeCreate = vi.fn()
const mockFamilyTreeUpdate = vi.fn()
const mockIndividualCount = vi.fn()
const mockIndividualCreateMany = vi.fn()
const mockFamilyCreateMany = vi.fn()
const mockFamilyChildCreateMany = vi.fn()
const mockRadaFamilyCreateMany = vi.fn()
const mockRadaFamilyChildCreateMany = vi.fn()
const mockTreeEditLogCreate = vi.fn()
const mockTransaction = vi.fn()
const mockWorkspaceFindUnique = vi.fn()
const mockWorkspaceUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      count: (...args: unknown[]) => mockIndividualCount(...args),
      createMany: (...args: unknown[]) => mockIndividualCreateMany(...args),
    },
    family: {
      createMany: (...args: unknown[]) => mockFamilyCreateMany(...args),
    },
    familyChild: {
      createMany: (...args: unknown[]) => mockFamilyChildCreateMany(...args),
    },
    radaFamily: {
      createMany: (...args: unknown[]) => mockRadaFamilyCreateMany(...args),
    },
    radaFamilyChild: {
      createMany: (...args: unknown[]) => mockRadaFamilyChildCreateMany(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-import-1'
const treeId = 'tree-uuid-import-1'

const importParams = { params: Promise.resolve({ id: wsId }) }

const fakeUser = {
  id: 'user-uuid-import-111',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
}

// Minimal valid GEDCOM content
const validGedcom = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ahmad /Saeed/
1 SEX M
1 BIRT
2 DATE 1 JAN 1950
1 FAMS @F1@
0 @I2@ INDI
1 NAME Fatima /Ali/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Khalid /Ahmad/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`

function makeFormDataRequest(
  fileContent: string | null,
  fileName: string = 'family.ged',
  options: { auth?: boolean } = {},
): NextRequest {
  const formData = new FormData()
  if (fileContent !== null) {
    const blob = new Blob([fileContent], { type: 'application/octet-stream' })
    const file = new File([blob], fileName, { type: 'application/octet-stream' })
    formData.append('file', file)
  }

  const url = `http://localhost:4000/api/workspaces/${wsId}/tree/import`
  const headers: Record<string, string> = {}
  if (options.auth !== false) {
    headers.authorization = 'Bearer valid-token'
  }

  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: formData,
  })
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null })
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  })
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: ['tree_editor'],
  })
}

function mockAdmin() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  })
}

function mockMemberNoTreeEdit() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  })
}

function mockEmptyTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: treeId,
    workspaceId: wsId,
  })
  mockIndividualCount.mockResolvedValue(0)
}


function mockNonEmptyTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: treeId,
    workspaceId: wsId,
  })
  mockIndividualCount.mockResolvedValue(5)
}

function mockSeedSuccess() {
  // Phase 10b: seed helper needs a valid workspace.encryptedKey to unwrap.
  mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: TEST_WRAPPED_KEY })
  mockWorkspaceUpdate.mockResolvedValue({})

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      familyTree: {
        findUnique: mockFamilyTreeFindUnique,
        findFirst: mockFamilyTreeFindUnique,
        create: mockFamilyTreeCreate,
        update: mockFamilyTreeUpdate,
      },
      individual: {
        count: mockIndividualCount,
        createMany: mockIndividualCreateMany,
      },
      family: {
        createMany: mockFamilyCreateMany,
      },
      familyChild: {
        createMany: mockFamilyChildCreateMany,
      },
      radaFamily: {
        createMany: mockRadaFamilyCreateMany,
      },
      radaFamilyChild: {
        createMany: mockRadaFamilyChildCreateMany,
      },
      workspace: {
        findUnique: mockWorkspaceFindUnique,
        update: mockWorkspaceUpdate,
      },
    })
  })
  mockIndividualCreateMany.mockResolvedValue({ count: 3 })
  mockFamilyCreateMany.mockResolvedValue({ count: 1 })
  mockFamilyChildCreateMany.mockResolvedValue({ count: 1 })
  mockFamilyTreeUpdate.mockResolvedValue({})
  mockTreeEditLogCreate.mockResolvedValue({})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces/[id]/tree/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    treeImportLimiter.reset()
  })

  // ── Auth & permissions ─────────────────────────────────────────────

  describe('auth & permissions', () => {
    test('returns 401 for unauthenticated request', async () => {
      mockNoAuth()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom, 'family.ged', { auth: false })
      const res = await POST(req, importParams)
      expect(res.status).toBe(401)
    })

    test('returns 403 for workspace_member without tree_editor permission', async () => {
      mockAuth()
      mockMemberNoTreeEdit()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(403)
    })

    test('returns 201 for workspace_member with tree_editor permission', async () => {
      mockAuth()
      mockTreeEditor()
      mockEmptyTree()
      mockSeedSuccess()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(201)
    })

    test('returns 201 for workspace_admin', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      mockSeedSuccess()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(201)
    })
  })

  // ── File validation ────────────────────────────────────────────────

  describe('file validation', () => {
    test('returns 400 when no file is in form data', async () => {
      mockAuth()
      mockAdmin()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(null)
      const res = await POST(req, importParams)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('لم يتم تحديد ملف')
    })

    test('returns 400 when file does not have .ged extension', async () => {
      mockAuth()
      mockAdmin()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom, 'family.txt')
      const res = await POST(req, importParams)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('يجب أن يكون الملف بصيغة GEDCOM (.ged)')
    })

    test('returns 413 when file exceeds 7 MB', async () => {
      mockAuth()
      mockAdmin()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      // Create a string just over 7 MB
      const largeContent = '0 HEAD\n' + 'x'.repeat(7 * 1024 * 1024 + 1) + '\n0 TRLR\n'
      const req = makeFormDataRequest(largeContent, 'large.ged')
      const res = await POST(req, importParams)
      expect(res.status).toBe(413)
      const body = await res.json()
      expect(body.error).toBe('حجم الملف يتجاوز الحد المسموح')
    })

    test('returns 400 for empty/invalid GEDCOM content', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest('this is not gedcom at all', 'bad.ged')
      const res = await POST(req, importParams)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('الملف لا يحتوي على بيانات صالحة')
    })

    test('returns 400 when file exceeds 10,000 individuals', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      // Generate GEDCOM with >10,000 individuals
      let content = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n'
      for (let i = 1; i <= 10001; i++) {
        content += `0 @I${i}@ INDI\n1 NAME Person${i}\n1 SEX M\n`
      }
      content += '0 TRLR\n'
      const req = makeFormDataRequest(content, 'huge.ged')
      const res = await POST(req, importParams)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('الملف يحتوي على عدد كبير جداً من السجلات')
    })
  })

  // ── Empty tree guard ───────────────────────────────────────────────

  describe('empty tree guard', () => {
    test('returns 409 when tree already has individuals', async () => {
      mockAuth()
      mockAdmin()
      mockNonEmptyTree()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toBe('الشجرة تحتوي على بيانات بالفعل')
    })
  })

  // ── Successful import ──────────────────────────────────────────────

  describe('successful import', () => {
    test('returns 201 with counts on valid import', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      mockSeedSuccess()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.individualCount).toBeDefined()
      expect(body.familyCount).toBeDefined()
      expect(typeof body.individualCount).toBe('number')
      expect(typeof body.familyCount).toBe('number')
    })

    test('response includes radaFamilyCount', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      mockSeedSuccess()
      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')

      // GEDCOM with rada family
      const gedcomWithRada = validGedcom.replace(
        '0 TRLR',
        `0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 _RADA_WIFE @I2@
1 _RADA_CHIL @I3@
0 TRLR`,
      )
      const req = makeFormDataRequest(gedcomWithRada)
      const res = await POST(req, importParams)
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.radaFamilyCount).toBeDefined()
    })
  })

  // ── Rate limiting ──────────────────────────────────────────────────

  describe('rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('returns 429 after exceeding max requests within an hour', async () => {
      mockAuth()
      mockAdmin()
      mockEmptyTree()
      mockSeedSuccess()

      const { POST } = await import('@/app/api/workspaces/[id]/tree/import/route')

      // treeImportLimiter allows 10 requests per hour
      for (let i = 0; i < 10; i++) {
        const req = makeFormDataRequest(validGedcom)
        const res = await POST(req, importParams)
        // Reset mocks for next call to simulate fresh empty tree
        mockEmptyTree()
        mockSeedSuccess()
        // These should NOT be 429
        expect(res.status).not.toBe(429)
      }

      // 11th request should be rate-limited
      const req = makeFormDataRequest(validGedcom)
      const res = await POST(req, importParams)
      expect(res.status).toBe(429)
    })
  })
})
