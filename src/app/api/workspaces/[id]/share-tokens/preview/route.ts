import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { hashToken } from '@/lib/tree/branch-share-token';
import { getTreeByWorkspaceId } from '@/lib/tree/queries';
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string }> };

const previewSchema = z.object({
  token: z.string().min(1).max(500),
});

// POST /api/workspaces/[id]/share-tokens/preview — Preview a share token's subtree
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'بيانات غير صالحة' },
      { status: 400 },
    );
  }

  const { token } = parsed.data;
  const tokenHash = hashToken(token);

  const shareToken = await prisma.branchShareToken.findFirst({
    where: {
      tokenHash,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!shareToken) {
    return NextResponse.json(
      { error: 'رمز المشاركة غير صالح أو منتهي الصلاحية' },
      { status: 400 },
    );
  }

  // Fetch source workspace name
  const sourceWorkspace = await prisma.workspace.findUnique({
    where: { id: shareToken.sourceWorkspaceId },
    select: { nameAr: true },
  });

  // Fetch source tree
  const sourceTree = await getTreeByWorkspaceId(shareToken.sourceWorkspaceId);
  if (!sourceTree) {
    return NextResponse.json(
      { error: 'شجرة المصدر غير متوفرة' },
      { status: 404 },
    );
  }

  const sourceData = dbTreeToGedcomData(sourceTree);

  // Get root person name
  const rootPerson = sourceData.individuals[shareToken.rootIndividualId];
  const rootPersonName = rootPerson
    ? [rootPerson.givenName, rootPerson.surname].filter(Boolean).join(' ')
    : 'غير معروف';

  const subtree = extractPointedSubtree(sourceData, {
    rootIndividualId: shareToken.rootIndividualId,
    depthLimit: shareToken.depthLimit,
    includeGrafts: shareToken.includeGrafts,
  });

  // Apply privacy redaction
  const safeSubtree = redactPrivateIndividuals(subtree);

  const individualCount = Object.keys(safeSubtree.individuals).length;

  return NextResponse.json({
    data: {
      sourceWorkspaceNameAr: sourceWorkspace?.nameAr || '',
      rootPersonName,
      rootIndividualId: shareToken.rootIndividualId,
      individualCount,
      depthLimit: shareToken.depthLimit,
      includeGrafts: shareToken.includeGrafts,
      subtree: safeSubtree,
    },
  });
}
