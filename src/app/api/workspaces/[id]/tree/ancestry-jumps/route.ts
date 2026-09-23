import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, touchTreeTimestamp } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { createAncestryJumpSchema } from '@/lib/tree/ancestry-jump-schemas';
import {
  validateAncestryJump,
  ANCESTRY_JUMP_ERROR_MESSAGES,
  ANCESTRY_JUMP_ERROR_STATUS,
} from '@/lib/tree/ancestry-jump-validators';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { snapshotAncestryJump, encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';
import { getWorkspaceKey, encryptAncestryJumpInput, encryptSnapshot } from '@/lib/tree/encryption';
import { isDuplicateJumpError, jumpDto } from '@/lib/tree/ancestry-jump-route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/ancestry-jumps — create a «قفزة نسب»
//
// Gated by the per-workspace `enableAncestryJumps` toggle (off by default).
// Only CREATE is gated: PATCH/DELETE stay open so an existing jump is always
// fixable and removable (undo of a create / redo of a delete use DELETE).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableAncestryJumps: true },
  });
  if (!workspace?.enableAncestryJumps) {
    return NextResponse.json(
      { error: 'ميزة قفزة النسب غير مفعّلة في هذه المساحة' },
      { status: 400 },
    );
  }

  const parsed = await parseValidatedBody(request, createAncestryJumpSchema);
  if (isParseError(parsed)) return parsed;

  const { treeId, descendantId, ancestorFamilyId, generationsMin, generationsMax, notes } =
    parsed.data;

  const tree = await resolveTargetTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const workspaceKey = await getWorkspaceKey(workspaceId);

  // Validate against the mapped tree — one in-memory pass, rules J1…J8.
  const data = dbTreeToGedcomData(tree, workspaceKey);
  const violation = validateAncestryJump(data, {
    descendantId,
    ancestorFamilyId,
    generationsMin,
    generationsMax,
  });
  if (violation) {
    return NextResponse.json(
      { error: ANCESTRY_JUMP_ERROR_MESSAGES[violation] },
      { status: ANCESTRY_JUMP_ERROR_STATUS[violation] },
    );
  }

  const { notes: encryptedNotes } = encryptAncestryJumpInput({ notes: notes ?? null }, workspaceKey);

  let jump;
  try {
    jump = await prisma.ancestryJump.create({
      // Cast via unknown — Buffer vs Uint8Array<ArrayBuffer>.
      data: {
        treeId: tree.id,
        descendantId,
        ancestorFamilyId,
        generationsMin: generationsMin ?? null,
        generationsMax: generationsMax ?? null,
        notes: encryptedNotes ?? null,
        createdById: result.user.id,
      } as unknown as Parameters<typeof prisma.ancestryJump.create>[0]['data'],
    });
  } catch (error) {
    // DB backstop for rule J4: two editors racing must get the Arabic 409, not
    // a 500. The unique index is `(tree_id, descendant_id)`.
    if (isDuplicateJumpError(error)) {
      return NextResponse.json(
        { error: ANCESTRY_JUMP_ERROR_MESSAGES.descendant_already_has_jump },
        { status: 409 },
      );
    }
    throw error;
  }

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'ancestry_jump',
        entityId: jump.id,
        snapshotBefore: JSON_NULL,
        snapshotAfter: encryptSnapshot(
          snapshotAncestryJump({
            id: jump.id,
            descendantId,
            ancestorFamilyId,
            generationsMin: generationsMin ?? null,
            generationsMax: generationsMax ?? null,
            notes: notes ?? null,
          }),
          workspaceKey,
        ),
        description: encryptAuditDescription('create', 'ancestry_jump', null, workspaceKey, {
          isUndo: isUndoRequest(request),
        }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  // The response echoes PLAINTEXT notes — the `Bytes` column never leaves here.
  return NextResponse.json({ data: jumpDto(jump, notes ?? null) }, { status: 201 });
}
