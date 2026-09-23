import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, touchTreeTimestamp, getTreeIndividualDecrypted } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { moveJumpBackSchema } from '@/lib/tree/ancestry-jump-schemas';
import {
  checkJumpMoveBack,
  JUMP_MOVE_BACK_STALE_MESSAGE,
  JUMP_NOT_FOUND_MESSAGE,
} from '@/lib/tree/ancestry-jump-validators';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import {
  snapshotIndividual,
  snapshotFamily,
  snapshotAncestryJump,
  encryptAuditDescription,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';
import { jumpDto } from '@/lib/tree/ancestry-jump-route-helpers';

type RouteParams = { params: Promise<{ id: string; jumpId: string }> };

const jumpIdSchema = z.string().uuid();

class StaleMoveBackError extends Error {
  constructor() {
    super('STALE_MOVE_BACK');
  }
}

const stale = () => NextResponse.json({ error: JUMP_MOVE_BACK_STALE_MESSAGE }, { status: 409 });

// POST /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-back
//
// The undo of move-to-new-father. Allowed only while the tree still looks
// exactly like what the move made (`checkJumpMoveBack`) and no live branch link
// is anchored on F. In ONE transaction, in THIS order:
//   1. put the jump back on P with the pre-move range;
//   2. delete the couple;
//   3. delete F.
// The jump MUST move before F is deleted — the jump's FK cascades from its
// descendant, so deleting F first would silently destroy the jump.
//
// NOT gated by `enableAncestryJumps`, same as the move itself.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, jumpId } = await params;

  if (!jumpIdSchema.safeParse(jumpId).success) {
    return NextResponse.json({ error: JUMP_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, moveJumpBackSchema);
  if (isParseError(parsed)) return parsed;
  const { fatherId, familyId, childId } = parsed.data;
  const generationsMin = parsed.data.generationsMin ?? null;
  const generationsMax = parsed.data.generationsMax ?? null;

  const [tree, workspaceKey] = await Promise.all([
    resolveTargetTreeOr404(workspaceId, parsed.data.treeId),
    getWorkspaceKey(workspaceId),
  ]);
  if (isErrorResponse(tree)) return tree;

  const data = dbTreeToGedcomData(tree, workspaceKey);

  if (checkJumpMoveBack(data, { jumpId, fatherId, familyId, childId })) return stale();

  // A live branch link anchored on F is work built on him since the move. F's
  // full decrypted row is the audit row's "before" snapshot.
  const [anchoredOnFather, father] = await Promise.all([
    prisma.branchPointer.count({ where: { anchorIndividualId: fatherId, status: 'active' } }),
    getTreeIndividualDecrypted(workspaceId, tree.id, fatherId),
  ]);
  if (anchoredOnFather > 0 || !father) return stale();

  const jump = data.ancestryJumps![jumpId];
  const notes = jump.notes || null;
  const isUndo = isUndoRequest(request);

  const jumpBefore = {
    id: jumpId,
    descendantId: fatherId,
    ancestorFamilyId: jump.ancestorFamily,
    generationsMin: jump.generationsMin,
    generationsMax: jump.generationsMax,
    notes,
  };
  const jumpAfter = { ...jumpBefore, descendantId: childId, generationsMin, generationsMax };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM individuals WHERE id = ${fatherId}::uuid FOR UPDATE`;

      // 1. The jump goes back to P FIRST — see the header comment.
      const moved = await tx.ancestryJump.updateMany({
        where: { id: jumpId, treeId: tree.id, descendantId: fatherId },
        data: { descendantId: childId, generationsMin, generationsMax },
      });
      if (moved.count === 0) throw new StaleMoveBackError();

      // 2. The couple, scoped to exactly what the move created.
      await tx.familyChild.deleteMany({ where: { familyId } });
      const famGone = await tx.family.deleteMany({
        where: { id: familyId, treeId: tree.id, husbandId: fatherId, wifeId: null },
      });
      if (famGone.count === 0) throw new StaleMoveBackError();

      // 3. F himself.
      const fatherGone = await tx.individual.deleteMany({ where: { id: fatherId, treeId: tree.id } });
      if (fatherGone.count === 0) throw new StaleMoveBackError();

      const log = { treeId: tree.id, userId: result.user.id };
      await writeTreeEditLog(tx, {
        ...log,
        action: 'update',
        entityType: 'ancestry_jump',
        entityId: jumpId,
        snapshotBefore: encryptSnapshot(snapshotAncestryJump(jumpBefore), workspaceKey),
        snapshotAfter: encryptSnapshot(snapshotAncestryJump(jumpAfter), workspaceKey),
        description: encryptAuditDescription('update', 'ancestry_jump', null, workspaceKey, { isUndo }),
      });
      await writeTreeEditLog(tx, {
        ...log,
        action: 'delete',
        entityType: 'family',
        entityId: familyId,
        snapshotBefore: encryptSnapshot(
          snapshotFamily({ id: familyId, husbandId: fatherId, wifeId: null, children: [{ individualId: childId }] }),
          workspaceKey,
        ),
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription('delete', 'family', null, workspaceKey, { isUndo }),
      });
      await writeTreeEditLog(tx, {
        ...log,
        action: 'delete',
        entityType: 'individual',
        entityId: fatherId,
        snapshotBefore: encryptSnapshot(snapshotIndividual(father), workspaceKey),
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription('delete', 'individual', father.givenName, workspaceKey, { isUndo }),
      });
    });
  } catch (error) {
    if (error instanceof StaleMoveBackError) return stale();
    throw error;
  }

  await touchTreeTimestamp(tree.id);

  return NextResponse.json({ data: { jump: jumpDto({ ...jumpAfter, treeId: tree.id }, notes) } });
}
