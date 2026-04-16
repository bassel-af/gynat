import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import {
  getOrCreateTree,
  getTreeIndividualDecrypted,
  touchTreeTimestamp,
} from '@/lib/tree/queries';
import { updateIndividualSchema } from '@/lib/tree/schemas';
import { isPointedIndividualInWorkspace } from '@/lib/tree/branch-pointer-queries';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey, encryptIndividualInput, encryptSnapshot } from '@/lib/tree/encryption';
import { computeDeleteImpact, computeVersionHash } from '@/lib/tree/cascade-delete';
import {
  snapshotIndividual,
  encryptAuditDescription,
  encryptAuditPayload,
  JSON_NULL,
} from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

// PATCH /api/workspaces/[id]/tree/individuals/[individualId] — Update an individual
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, updateIndividualSchema);
  if (isParseError(parsed)) return parsed;

  // Reject mutations on pointed (read-only) individuals
  const isPointed = await isPointedIndividualInWorkspace(individualId, workspaceId);
  if (isPointed) {
    return NextResponse.json(
      { error: 'لا يمكن تعديل شخص مرتبط من مساحة أخرى' },
      { status: 403 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  // Decrypted read — needed so we can feed plaintext into the audit snapshot
  // and read `givenName` for the human-readable description. Task #13 will
  // wrap the stored snapshot in an encrypted envelope.
  const existing = await getTreeIndividualDecrypted(workspaceId, tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Strip kunya when feature is disabled
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableKunya: true },
  });
  if (!workspace?.enableKunya) {
    delete parsed.data.kunya;
  }

  // Phase 10b: encrypt sensitive fields before update. `parsed.data` still
  // holds plaintext for the audit snapshot further down.
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const individual = await prisma.individual.update({
    where: { id: individualId },
    // Cast via unknown — see note in families/[familyId]/route.ts.
    data: encryptIndividualInput(parsed.data, workspaceKey) as unknown as Parameters<typeof prisma.individual.update>[0]['data'],
  });

  // Build an after-snapshot by merging the plaintext `existing` with the
  // plaintext `parsed.data` (what the client sent in). We cannot use
  // `individual` directly because its encrypted fields are now Bytes-typed
  // by Prisma. Task #13 will wrap the stored snapshot in an encrypted
  // envelope.
  const afterPlaintext = { ...existing, ...parsed.data, id: individualId };

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'individual',
        entityId: individualId,
        payload: encryptAuditPayload(parsed.data, workspaceKey),
        // Phase 10b: wrap plaintext snapshots in encrypted envelopes.
        snapshotBefore: encryptSnapshot(snapshotIndividual(existing), workspaceKey),
        snapshotAfter: encryptSnapshot(snapshotIndividual(afterPlaintext), workspaceKey),
        description: encryptAuditDescription('update', 'individual', existing.givenName, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: individual });
}

// DELETE /api/workspaces/[id]/tree/individuals/[individualId] — Delete an individual
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Reject mutations on pointed (read-only) individuals
  const isPointed = await isPointedIndividualInWorkspace(individualId, workspaceId);
  if (isPointed) {
    return NextResponse.json(
      { error: 'لا يمكن حذف شخص مرتبط من مساحة أخرى' },
      { status: 403 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  // Decrypted read — the confirmation flow needs plaintext `givenName` to
  // compare against the user's typed name, and `dbTreeToGedcomData` below
  // needs the workspace key to decrypt the tree.
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const existing = await getTreeIndividualDecrypted(workspaceId, tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Parse optional body for versionHash + confirmationName (cascade confirmation)
  let clientVersionHash: string | undefined;
  let confirmationName: string | undefined;
  try {
    const body = await request.json();
    clientVersionHash = body?.versionHash;
    confirmationName = body?.confirmationName;
  } catch {
    // No body or invalid JSON — that's fine for simple deletes
  }

  // Compute cascade impact
  const gedcomData = dbTreeToGedcomData(tree, workspaceKey);
  const impact = computeDeleteImpact(gedcomData, individualId);
  const { affectedIds } = impact;
  const currentVersionHash = computeVersionHash(tree.lastModifiedAt);

  // If there are unreachable people, require version hash confirmation
  if (affectedIds.size > 0) {
    if (!clientVersionHash || clientVersionHash !== currentVersionHash) {
      return NextResponse.json({
        data: {
          hasImpact: impact.hasImpact,
          affectedCount: affectedIds.size,
          affectedNames: impact.affectedNames,
          truncated: impact.truncated,
          versionHash: currentVersionHash,
        },
      }, { status: 409 });
    }

    // Require name confirmation for large cascades (5+ affected)
    if (affectedIds.size >= 5) {
      const { stripArabicDiacritics } = await import('@/lib/utils/search');
      const targetName = existing.givenName?.trim() ?? '';
      const typedName = confirmationName?.trim() ?? '';
      if (!typedName || stripArabicDiacritics(typedName) !== stripArabicDiacritics(targetName)) {
        return NextResponse.json(
          { error: 'يجب كتابة اسم الشخص للتأكيد' },
          { status: 400 },
        );
      }
    }
  }

  // All IDs to delete: target + affected (target needs same FK cleanup)
  const allDeleteIds = [individualId, ...affectedIds];

  // Clean up FK references and delete in a single transaction.
  // Order matters: clean all RESTRICT FKs before deleting individuals.
  // FamilyChild and RadaFamilyChild auto-cascade via onDelete: Cascade.
  try {
    await prisma.$transaction(async (tx) => {
    // 1. Break ALL branch pointers referencing deleted individuals (any status —
    //    even revoked/broken pointers hold FK refs that block individual deletion)
    await tx.branchPointer.updateMany({
      where: {
        OR: [
          { rootIndividualId: { in: allDeleteIds } },
          { selectedIndividualId: { in: allDeleteIds } },
          { anchorIndividualId: { in: allDeleteIds } },
        ],
      },
      data: { status: 'broken' },
    });

    // 2. Revoke share tokens referencing deleted individuals
    await tx.branchShareToken.updateMany({
      where: {
        rootIndividualId: { in: allDeleteIds },
        isRevoked: false,
      },
      data: { isRevoked: true },
    });

    // 3. Null out rada family foster parent refs
    await tx.radaFamily.updateMany({
      where: { fosterFatherId: { in: allDeleteIds } },
      data: { fosterFatherId: null },
    });
    await tx.radaFamily.updateMany({
      where: { fosterMotherId: { in: allDeleteIds } },
      data: { fosterMotherId: null },
    });

    // 4. Delete UserTreeLink records
    await tx.userTreeLink.deleteMany({
      where: { individualId: { in: allDeleteIds } },
    });

    // 5. Null out WorkspaceInvitation individual refs
    await tx.workspaceInvitation.updateMany({
      where: { individualId: { in: allDeleteIds } },
      data: { individualId: null },
    });

    // 6. Null out family spouse refs
    await tx.family.updateMany({
      where: { husbandId: { in: allDeleteIds } },
      data: { husbandId: null },
    });
    await tx.family.updateMany({
      where: { wifeId: { in: allDeleteIds } },
      data: { wifeId: null },
    });

    // 7. Delete all individuals (FamilyChild + RadaFamilyChild auto-cascade)
    await tx.individual.deleteMany({
      where: { id: { in: allDeleteIds } },
    });

    // 8. Clean up empty families (no husband, no wife, no children)
    await tx.family.deleteMany({
      where: {
        treeId: tree.id,
        husbandId: null,
        wifeId: null,
        children: { none: {} },
      },
    });

    // 9. Audit log
    const deleteAction = affectedIds.size > 0 ? 'cascade_delete' : 'delete';
    await tx.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: deleteAction,
        entityType: 'individual',
        entityId: individualId,
        // Phase 10b follow-up (task #22): wrap the cascade_delete payload
        // in an AES-256-GCM envelope. This closes the `targetName` PII leak
        // that Phase 10b proper (task #13) intentionally left open.
        payload: encryptAuditPayload(
          affectedIds.size > 0
            ? {
                targetIndividualId: individualId,
                targetName: existing.givenName ?? '',
                affectedIndividualIds: [...affectedIds],
                totalAffectedCount: affectedIds.size,
                confirmationMethod: affectedIds.size >= 5 ? 'name_typing' : 'simple_confirm',
              }
            : null,
          workspaceKey,
        ),
        // Phase 10b: encrypt the plaintext snapshot envelope.
        snapshotBefore: encryptSnapshot(snapshotIndividual(existing), workspaceKey),
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription(deleteAction, 'individual', existing.givenName, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof tx.treeEditLog.create>[0]['data'],
    });

    // 10. Update tree timestamp
    await tx.familyTree.update({
      where: { id: tree.id },
      data: { lastModifiedAt: new Date() },
    });
    }, { timeout: 30000 });
  } catch (error: unknown) {
    // Concurrent delete: another user deleted the same person between our
    // version check and the transaction commit → Prisma P2025 (record not found)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'الشخص غير موجود في هذه الشجرة' },
        { status: 404 },
      );
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
