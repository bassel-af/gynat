import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { getTreeByWorkspaceId, getOrCreateTree } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { prepareDeepCopy, persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';

type RouteParams = { params: Promise<{ id: string; tokenId: string }> };

// PATCH /api/workspaces/[id]/share-tokens/[tokenId] — Disable or re-enable a share token
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, tokenId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'جسم الطلب غير صالح' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).isRevoked !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'يجب تقديم isRevoked كقيمة منطقية' },
      { status: 400 },
    );
  }

  const { isRevoked } = body as { isRevoked: boolean };

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

  // Step 2: Find all active pointers created from this token
  const activePointers = await prisma.branchPointer.findMany({
    where: { shareTokenId: tokenId, status: 'active' },
  });

  let copiedPointers = 0;
  let disconnectedPointers = 0;

  if (activePointers.length > 0) {
    // Step 3: Fetch source tree ONCE (all pointers share the same source)
    const sourceTree = await getTreeByWorkspaceId(workspaceId);
    const sourceData = sourceTree ? dbTreeToGedcomData(sourceTree) : null;

    // Step 4: For each pointer, attempt deep copy then revoke
    for (const pointer of activePointers) {
      try {
        if (sourceData) {
          const pointedSubtree = extractPointedSubtree(sourceData, {
            rootIndividualId: pointer.rootIndividualId,
            depthLimit: pointer.depthLimit,
            includeGrafts: pointer.includeGrafts,
          });

          const copyResult = prepareDeepCopy(pointedSubtree, {
            anchorIndividualId: pointer.anchorIndividualId,
            relationship: pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent',
            pointerId: pointer.id,
          });

          const targetTree = await getOrCreateTree(pointer.targetWorkspaceId);

          // Per-pointer transaction: persistDeepCopy + update pointer + log
          await prisma.$transaction(async (tx) => {
            const txPrisma = tx as typeof prisma;

            await persistDeepCopy(txPrisma, targetTree.id, copyResult);

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
              },
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
      } catch {
        // Best-effort: mark pointer as revoked without copy
        try {
          await prisma.branchPointer.update({
            where: { id: pointer.id },
            data: { status: 'revoked' },
          });
        } catch {
          // Ignore — pointer may already be revoked
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

  return NextResponse.json({ success: true, disconnectedPointers, copiedPointers });
}
