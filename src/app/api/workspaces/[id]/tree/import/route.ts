import { NextRequest, NextResponse } from 'next/server'
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth'
import { treeImportLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { touchTreeTimestamp } from '@/lib/tree/queries'
import { seedTreeFromGedcomData } from '@/lib/tree/seed-helpers'
import { parseGedcom } from '@/lib/gedcom/parser'
import { prisma } from '@/lib/db'
import { encryptAuditDescription, encryptAuditPayload } from '@/lib/tree/audit'
import { getWorkspaceKey } from '@/lib/tree/encryption'

type RouteParams = { params: Promise<{ id: string }> }

const MAX_FILE_SIZE = 7 * 1024 * 1024 // 7 MB
const MAX_INDIVIDUALS = 10_000
const MAX_FAMILIES = 10_000

// POST /api/workspaces/[id]/tree/import — Import a GEDCOM file into an empty tree
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params

  // 1. Auth
  const result = await requireTreeEditor(request, workspaceId)
  if (isErrorResponse(result)) return result

  // 2. Rate limit
  const { allowed, retryAfterSeconds } = treeImportLimiter.check(result.user.id)
  if (!allowed) return rateLimitResponse(retryAfterSeconds)

  // 3. Read form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'لم يتم تحديد ملف' }, { status: 400 })
  }

  const fileEntry = formData.get('file')
  if (!fileEntry || typeof fileEntry === 'string') {
    return NextResponse.json({ error: 'لم يتم تحديد ملف' }, { status: 400 })
  }

  // Cast to File-like object (works across jsdom and Node environments)
  const file = fileEntry as File

  // 4. Validate file extension
  if (!file.name.toLowerCase().endsWith('.ged')) {
    return NextResponse.json(
      { error: 'يجب أن يكون الملف بصيغة GEDCOM (.ged)' },
      { status: 400 },
    )
  }

  // 5. Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'حجم الملف يتجاوز الحد المسموح' },
      { status: 413 },
    )
  }

  // 6. Read and parse
  const text = await file.text()
  const gedcomData = parseGedcom(text)

  // 7. Validate parse result
  const individualCount = Object.keys(gedcomData.individuals).length
  const familyCount = Object.keys(gedcomData.families).length

  if (individualCount === 0) {
    return NextResponse.json(
      { error: 'الملف لا يحتوي على بيانات صالحة' },
      { status: 400 },
    )
  }

  if (individualCount > MAX_INDIVIDUALS || familyCount > MAX_FAMILIES) {
    return NextResponse.json(
      { error: 'الملف يحتوي على عدد كبير جداً من السجلات' },
      { status: 400 },
    )
  }

  // 8. Seed into database (transactional, checks tree is empty)
  const seedResult = await seedTreeFromGedcomData(workspaceId, gedcomData, prisma)

  if (seedResult.skipped) {
    return NextResponse.json(
      { error: 'الشجرة تحتوي على بيانات بالفعل' },
      { status: 409 },
    )
  }

  // 9. Update tree timestamp + audit log. Phase 10b follow-up: encrypt
  // both description and payload before the write.
  const workspaceKey = await getWorkspaceKey(workspaceId)
  await Promise.all([
    touchTreeTimestamp(seedResult.treeId),
    prisma.treeEditLog.create({
      data: {
        treeId: seedResult.treeId,
        userId: result.user.id,
        action: 'import',
        entityType: 'tree',
        entityId: seedResult.treeId,
        payload: encryptAuditPayload(
          {
            individualCount: seedResult.individualCount,
            familyCount: seedResult.familyCount,
            radaFamilyCount: seedResult.radaFamilyCount,
            ancestryJumpCount: seedResult.ancestryJumpCount,
          },
          workspaceKey,
        ),
        description: encryptAuditDescription('import', 'tree', null, workspaceKey),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
  ])

  return NextResponse.json(
    {
      individualCount: seedResult.individualCount,
      familyCount: seedResult.familyCount,
      radaFamilyCount: seedResult.radaFamilyCount,
      ancestryJumpCount: seedResult.ancestryJumpCount,
    },
    { status: 201 },
  )
}
