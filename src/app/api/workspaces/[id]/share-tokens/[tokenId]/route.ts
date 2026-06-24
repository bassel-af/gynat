import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { getTreeByWorkspaceId, getOrCreateTree } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { prepareDeepCopy, persistDeepCopy, computeAnchorReuse } from '@/lib/tree/branch-pointer-deep-copy';
import { isStitchablePointer } from '@/lib/tree/branch-pointer-guards';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { logSwallowedAuditError } from '@/lib/api/swallowed-error-log';
import {
  snapshotBranchPointer,
  encryptAuditDescription,
  encryptAuditPayload,
} from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; tokenId: string }> };

const toggleTokenSchema = z.object({
  isRevoked: z.boolean({ error: 'يجب تقديم isRevoked كقيمة منطقية' }),
});

// PATCH /api/workspaces/[id]/share-tokens/[tokenId] — Disable or re-enable a share token
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, tokenId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, toggleTokenSchema);
  if (isParseError(parsed)) return parsed;

  const { isRevoked } = parsed.data;

  const token = await prisma.branchShareToken.findUnique({
    where: { id: tokenId },
  });

  if (!token || token.sourceWorkspaceId !== workspaceId) {
    return NextResponse.json({ error: 'الرمز غير موجود' }, { status: 404 });
  }

  await prisma.branchShareToken.update({
    where: { id: tokenId },
    data: { isRevoked },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/workspaces/[id]/share-tokens/[tokenId] — Revoke a share token
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, tokenId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  // Find token and verify it belongs to this workspace
  const token = await prisma.branchShareToken.findUnique({
    where: { id: tokenId },
  });

  if (!token || token.sourceWorkspaceId !== workspaceId) {
    return NextResponse.json({ error: 'الرمز غير موجود' }, { status: 404 });
  }

  if (token.isRevoked) {
    // If disabled (still has active pointers), allow the nuclear revoke.
    // If fully revoked (no active pointers), reject.
    const activeCount = await prisma.branchPointer.count({
      where: { shareTokenId: tokenId, status: 'active' },
    });
    if (activeCount === 0) {
      return NextResponse.json({ error: 'الرمز ملغى بالفعل' }, { status: 400 });
    }
  }

  // Step 1: Mark token as revoked FIRST (unconditional — may already be true if disabled)
  if (!token.isRevoked) {
    await prisma.branchShareToken.update({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
  }

  // Step 2: Find all active pointers created from this token.
  // EXCLUDE anchor-less collection-link pointers (S20) — same rationale as the
  // going-private freeze: this auto-deep-copy stitches into the target's MAIN
  // tree, which would corrupt it for a collection borrow. Leave collection-link
  // pointers untouched; their safety is the serve-time reuse-gate (S11), which
  // hides a now-revoked-source borrow deny-by-default.
  // TODO(Chunk 4 / PRD §2.10): preservation (frozen extra-tree copy + re-point
  // CollectionItem.branchPointerId → treeId) lands with collection serving.
  const activePointers = await prisma.branchPointer.findMany({
    where: { shareTokenId: tokenId, status: 'active', isCollectionLink: false },
  });

  let copiedPointers = 0;
  let disconnectedPointers = 0;

  // Phase 10b follow-up: fetch the source workspace key once, up front, so
  // BOTH the deep-copy loop (for decrypting the source tree) AND the final
  // token-revocation audit log (for encrypting description + payload) can
  // reuse it. The source workspace is always `workspaceId` because this
  // handler runs on the workspace that owns the token.
  const sourceKey = await getWorkspaceKey(workspaceId);

  if (activePointers.length > 0) {
    // Step 3: Fetch source tree ONCE (all pointers share the same source).
    const sourceTree = await getTreeByWorkspaceId(workspaceId);
    const sourceData = sourceTree ? dbTreeToGedcomData(sourceTree, sourceKey) : null;

    // Step 4: For each pointer, attempt deep copy then revoke
    for (const pointer of activePointers) {
      try {
        // Defensive narrow: collection-link pointers are excluded by the WHERE
        // above, so a real anchored pointer always has a non-null
        // anchor/relationship. Skip anything that somehow doesn't — fail-closed,
        // never feed a null anchor to prepareDeepCopy.
        if (!isStitchablePointer(pointer)) {
          disconnectedPointers++;
          continue;
        }

        if (sourceData) {
          const pointedSubtree = extractPointedSubtree(sourceData, {
            rootIndividualId: pointer.rootIndividualId,
            depthLimit: pointer.depthLimit,
            includeGrafts: pointer.includeGrafts,
          });

          // Phase 10b: each pointer's target workspace has its OWN
          // encryption key. Fetch it before persisting so the copied rows
          // are encrypted with the target's key, not the source's.
          const targetTree = await getOrCreateTree(pointer.targetWorkspaceId);
          const targetKey = await getWorkspaceKey(pointer.targetWorkspaceId);

          // Mirror the live-merge reuse so the frozen copy shows both parents.
          const relationship = pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent';
          const targetData = dbTreeToGedcomData(targetTree, targetKey);
          const pointedRootSex = pointedSubtree.individuals[pointer.rootIndividualId]?.sex ?? 'M';
          const anchorReuse = computeAnchorReuse(
            targetData,
            pointer.anchorIndividualId,
            relationship,
            pointedRootSex,
          );

          const copyResult = prepareDeepCopy(pointedSubtree, {
            anchorIndividualId: pointer.anchorIndividualId,
            relationship,
            pointerId: pointer.id,
            anchorReuse,
          });

          // Per-pointer transaction: persistDeepCopy + update pointer + log
          await prisma.$transaction(async (tx) => {
            const txPrisma = tx as typeof prisma;

            await persistDeepCopy(txPrisma, targetTree.id, copyResult, targetKey);

            await txPrisma.branchPointer.update({
              where: { id: pointer.id },
              data: { status: 'revoked' },
            });

            await txPrisma.treeEditLog.create({
              data: {
                treeId: targetTree.id,
                userId: result.user.id,
                action: 'deep_copy',
                entityType: 'branch_pointer',
                entityId: pointer.id,
                snapshotBefore: snapshotBranchPointer(pointer),
                snapshotAfter: snapshotBranchPointer({ ...pointer, status: 'revoked' }),
                // Phase 10b follow-up: description encrypted with TARGET
                // workspace key because the log lives in the target's tree.
                description: encryptAuditDescription('deep_copy', 'branch_pointer', null, targetKey),
              } as unknown as Parameters<typeof txPrisma.treeEditLog.create>[0]['data'],
            });
          });

          copiedPointers++;
        } else {
          // Source tree deleted — revoke pointer without copy
          await prisma.branchPointer.update({
            where: { id: pointer.id },
            data: { status: 'revoked' },
          });
        }
      } catch (err) {
        // Phase 10b follow-up: log the swallowed error PII-free so that
        // operators see the gap. Helper logs only error class + pointerId.
        logSwallowedAuditError('pointer_deep_copy', { pointerId: pointer.id }, err);
        // Best-effort: mark pointer as revoked without copy
        try {
          await prisma.branchPointer.update({
            where: { id: pointer.id },
            data: { status: 'revoked' },
          });
        } catch (innerErr) {
          logSwallowedAuditError(
            'pointer_fallback_revoke',
            { pointerId: pointer.id },
            innerErr,
          );
        }
      }

      disconnectedPointers++;
    }

    // Step 5: Create notifications for affected target workspace admins
    const targetWsIds = [...new Set(activePointers.map((p) => p.targetWorkspaceId))];

    const admins = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId: { in: targetWsIds },
        role: 'workspace_admin',
      },
      select: { userId: true },
    });

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.userId,
          type: 'branch_pointer_revoked',
          payload: {
            sourceWorkspaceId: workspaceId,
            action: 'token_revoked',
          },
        })),
      });
    }
  }

  // Log the token revocation itself (best effort — don't fail the revoke if logging fails)
  try {
    const revokeTree = await prisma.familyTree.findFirst({
      where: { workspaceId, kind: 'main' },
      select: { id: true },
    });
    if (revokeTree) {
      // Phase 10b follow-up: the source workspace key (already named
      // `sourceKey` earlier in this handler for the deep-copy decrypt
      // path) is the right key to use here — the audit log lives in the
      // SOURCE workspace's tree because that's where the token originated.
      await prisma.treeEditLog.create({
        data: {
          treeId: revokeTree.id,
          userId: result.user.id,
          action: 'revoke_token',
          entityType: 'share_token',
          entityId: tokenId,
          payload: encryptAuditPayload({ disconnectedPointers, copiedPointers }, sourceKey),
          description: encryptAuditDescription('revoke_token', 'share_token', null, sourceKey),
        } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
      });
    }
  } catch (err) {
    // Phase 10b follow-up: log the swallowed audit-write error PII-free so
    // operators can see the gap; never include err.message which may carry
    // workspace names, user emails, or token values from Prisma errors.
    logSwallowedAuditError('token_revoke_audit_write', { tokenId }, err);
  }

  return NextResponse.json({ success: true, disconnectedPointers, copiedPointers });
}
