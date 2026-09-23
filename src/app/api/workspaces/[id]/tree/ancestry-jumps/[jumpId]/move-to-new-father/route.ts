import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, touchTreeTimestamp } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { moveJumpToNewFatherSchema } from '@/lib/tree/ancestry-jump-schemas';
import {
  planJumpMoveToNewFather,
  ANCESTRY_JUMP_ERROR_MESSAGES,
  JUMP_MOVE_STALE_MESSAGE,
  JUMP_NOT_FOUND_MESSAGE,
} from '@/lib/tree/ancestry-jump-validators';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import {
  snapshotFamily,
  snapshotAncestryJump,
  encryptAuditDescription,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';
import { createIndividual } from '@/lib/tree/create-individual';
import { isDuplicateJumpError, jumpDto } from '@/lib/tree/ancestry-jump-route-helpers';

type RouteParams = { params: Promise<{ id: string; jumpId: string }> };

const jumpIdSchema = z.string().uuid();

/** Thrown inside the transaction when the locked state no longer matches the plan. */
class StaleMoveError extends Error {
  constructor() {
    super('STALE_MOVE');
  }
}

// POST /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-to-new-father
//
// P carries a «قفزة نسب»; the editor records P's real father F. In ONE
// transaction: create F, create the couple {husband F, children [P]}, and
// re-point the jump to F with the range shrunk by one generation. The jump row
// is updated IN PLACE, so its id, encrypted notes and creator are kept.
//
// NOT gated by `enableAncestryJumps`: this moves an existing jump, it never
// creates one — a workspace that turned the feature off must still be able to
// record a father for a person who already has a jump.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, jumpId } = await params;

  // A malformed id is indistinguishable from a jump in someone else's tree.
  if (!jumpIdSchema.safeParse(jumpId).success) {
    return NextResponse.json({ error: JUMP_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, moveJumpToNewFatherSchema);
  if (isParseError(parsed)) return parsed;

  // Independent reads — run together.
  const [tree, workspaceKey, workspace] = await Promise.all([
    resolveTargetTreeOr404(workspaceId, parsed.data.treeId),
    getWorkspaceKey(workspaceId),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { enableKunya: true } }),
  ]);
  if (isErrorResponse(tree)) return tree;

  const data = dbTreeToGedcomData(tree, workspaceKey);

  const plan = planJumpMoveToNewFather(data, jumpId);
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }
  const existingJump = data.ancestryJumps![jumpId];
  const notes = existingJump.notes || null;
  const P = plan.descendantId;
  const isUndo = isUndoRequest(request);

  let outcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      // Lock P, then re-check inside the lock that he still has no parents.
      // NOTE: the families / children POST jump checks run OUTSIDE a
      // transaction, so a narrow race remains where a concurrent "add P as a
      // child" passes its check before this commit. A DB trigger on
      // family_children would close it (follow-up).
      await tx.$queryRaw`SELECT 1 FROM individuals WHERE id = ${P}::uuid FOR UPDATE`;

      const alreadyHasParents = await tx.familyChild.findFirst({
        where: { individualId: P },
        select: { familyId: true },
      });
      if (alreadyHasParents) throw new StaleMoveError();

      const { individual, auditEntry: individualLog } = await createIndividual(tx, {
        treeId: tree.id,
        userId: result.user.id,
        input: parsed.data.father,
        workspaceKey,
        enableKunya: !!workspace?.enableKunya,
        isUndo,
      });

      const family = await tx.family.create({
        data: {
          treeId: tree.id,
          husbandId: individual.id,
          wifeId: null,
          children: { create: [{ individualId: P }] },
        },
        include: { children: true },
      });

      const moved = await tx.ancestryJump.updateMany({
        where: { id: jumpId, treeId: tree.id, descendantId: P },
        data: {
          descendantId: individual.id,
          generationsMin: plan.generationsMin,
          generationsMax: plan.generationsMax,
        },
      });
      if (moved.count === 0) throw new StaleMoveError();

      const jumpBefore = {
        id: jumpId,
        descendantId: P,
        ancestorFamilyId: plan.ancestorFamilyId,
        generationsMin: existingJump.generationsMin,
        generationsMax: existingJump.generationsMax,
        notes,
      };
      const jumpAfter = {
        ...jumpBefore,
        descendantId: individual.id,
        generationsMin: plan.generationsMin,
        generationsMax: plan.generationsMax,
      };

      const log = { treeId: tree.id, userId: result.user.id };
      await writeTreeEditLog(tx, individualLog);
      await writeTreeEditLog(tx, {
        ...log,
        action: 'create',
        entityType: 'family',
        entityId: family.id,
        snapshotBefore: JSON_NULL,
        snapshotAfter: encryptSnapshot(
          snapshotFamily({ id: family.id, husbandId: individual.id, wifeId: null, children: [{ individualId: P }] }),
          workspaceKey,
        ),
        description: encryptAuditDescription('create', 'family', null, workspaceKey, { isUndo }),
      });
      await writeTreeEditLog(tx, {
        ...log,
        action: 'update',
        entityType: 'ancestry_jump',
        entityId: jumpId,
        snapshotBefore: encryptSnapshot(snapshotAncestryJump(jumpBefore), workspaceKey),
        snapshotAfter: encryptSnapshot(snapshotAncestryJump(jumpAfter), workspaceKey),
        description: encryptAuditDescription('update', 'ancestry_jump', null, workspaceKey, { isUndo }),
      });

      return { individual, family, jumpAfter };
    });
  } catch (error) {
    if (error instanceof StaleMoveError) {
      return NextResponse.json({ error: JUMP_MOVE_STALE_MESSAGE }, { status: 409 });
    }
    if (isDuplicateJumpError(error)) {
      return NextResponse.json(
        { error: ANCESTRY_JUMP_ERROR_MESSAGES.descendant_already_has_jump },
        { status: 409 },
      );
    }
    throw error;
  }

  await touchTreeTimestamp(tree.id);

  const { individual, family, jumpAfter } = outcome;
  return NextResponse.json(
    {
      data: {
        individual: { id: individual.id },
        family: { id: family.id },
        jump: jumpDto({ ...jumpAfter, treeId: tree.id }, notes),
      },
    },
    { status: 201 },
  );
}
