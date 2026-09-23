import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import {
  resolveTargetTreeOr404,
  getTreeAncestryJumpDecrypted,
  touchTreeTimestamp,
} from '@/lib/tree/queries';
import { updateAncestryJumpSchema } from '@/lib/tree/ancestry-jump-schemas';
import {
  ANCESTRY_JUMP_ERROR_MESSAGES,
  ANCESTRY_JUMP_ERROR_STATUS,
  JUMP_NOT_FOUND_MESSAGE,
} from '@/lib/tree/ancestry-jump-validators';
import { parseValidatedBody, isParseError, parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import {
  snapshotAncestryJump,
  encryptAuditDescription,
  encryptAuditPayload,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptAncestryJumpInput, encryptSnapshot } from '@/lib/tree/encryption';
import { jumpDto } from '@/lib/tree/ancestry-jump-route-helpers';

type RouteParams = { params: Promise<{ id: string; jumpId: string }> };

/** `undefined` = leave unchanged; explicit `null` = clear. */
function merge<T>(patch: T | null | undefined, existing: T | null): T | null {
  return patch === undefined ? existing : (patch ?? null);
}

const jumpIdSchema = z.string().uuid();

/**
 * `jumpId` reaches Prisma as a raw path string. Against a `@db.Uuid` column a
 * malformed one raises P2023 and throws — a 500 where the caller should see
 * exactly what a foreign id sees. The shape check runs BEFORE any DB read, so
 * an unparseable id and a jump in someone else's tree are indistinguishable.
 */
const NOT_FOUND = () =>
  NextResponse.json({ error: JUMP_NOT_FOUND_MESSAGE }, { status: 404 });

// PATCH /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]
//
// Range + notes ONLY. Neither endpoint can be moved — re-pointing a jump is
// delete + create, which keeps the cycle/one-per-person invariants trivially
// checkable and keeps undo as two single-row operations.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, jumpId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!jumpIdSchema.safeParse(jumpId).success) return NOT_FOUND();

  const parsed = await parseValidatedBody(request, updateAncestryJumpSchema);
  if (isParseError(parsed)) return parsed;

  // Resolve the target tree, then strip `treeId` so it never reaches the row.
  const { treeId } = parsed.data;
  delete parsed.data.treeId;

  const tree = await resolveTargetTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const workspaceKey = await getWorkspaceKey(workspaceId);
  // Scoped by `{ id, treeId }` — never a bare findUnique.
  const existing = await getTreeAncestryJumpDecrypted(workspaceId, tree.id, jumpId);
  if (!existing) {
    return NOT_FOUND();
  }

  // Rule J6 on the MERGED values. Zod's `.refine` only ever saw the patch, so
  // a patch that sets only `generationsMin` can still invert a stored range.
  const mergedMin = merge(parsed.data.generationsMin, existing.generationsMin);
  const mergedMax = merge(parsed.data.generationsMax, existing.generationsMax);
  if (mergedMin != null && mergedMax != null && mergedMin > mergedMax) {
    return NextResponse.json(
      { error: ANCESTRY_JUMP_ERROR_MESSAGES.invalid_range },
      { status: ANCESTRY_JUMP_ERROR_STATUS.invalid_range },
    );
  }

  const mergedNotes = merge(parsed.data.notes, existing.notes);

  const jump = await prisma.ancestryJump.update({
    where: { id: jumpId },
    data: encryptAncestryJumpInput(
      parsed.data,
      workspaceKey,
    ) as unknown as Parameters<typeof prisma.ancestryJump.update>[0]['data'],
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'ancestry_jump',
        entityId: jumpId,
        payload: encryptAuditPayload(parsed.data, workspaceKey),
        snapshotBefore: encryptSnapshot(snapshotAncestryJump(existing), workspaceKey),
        snapshotAfter: encryptSnapshot(
          snapshotAncestryJump({
            id: jumpId,
            descendantId: existing.descendantId,
            ancestorFamilyId: existing.ancestorFamilyId,
            generationsMin: mergedMin,
            generationsMax: mergedMax,
            notes: mergedNotes,
          }),
          workspaceKey,
        ),
        description: encryptAuditDescription('update', 'ancestry_jump', null, workspaceKey, {
          isUndo: isUndoRequest(request),
        }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: jumpDto(jump, mergedNotes) });
}

// DELETE /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]
//
// Deletes the JUMP ROW ONLY — never the ancestor family, never the ancestor
// individuals. A jump is a claim about descent, not ownership of the ancestor.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, jumpId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!jumpIdSchema.safeParse(jumpId).success) return NOT_FOUND();

  // Optional body carries `treeId` to target a same-workspace extra tree.
  const treeId = await parseTreeIdFromBody(request);

  const tree = await resolveTargetTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const workspaceKey = await getWorkspaceKey(workspaceId);
  const existing = await getTreeAncestryJumpDecrypted(workspaceId, tree.id, jumpId);
  if (!existing) {
    return NOT_FOUND();
  }

  await prisma.ancestryJump.delete({ where: { id: jumpId } });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'delete',
        entityType: 'ancestry_jump',
        entityId: jumpId,
        snapshotBefore: encryptSnapshot(snapshotAncestryJump(existing), workspaceKey),
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription('delete', 'ancestry_jump', null, workspaceKey, {
          isUndo: isUndoRequest(request),
        }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return new NextResponse(null, { status: 204 });
}
