import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth';
import { getOrCreateTree, getTreeByWorkspaceId } from '@/lib/tree/queries';
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper';
import { getActivePointersForWorkspace } from '@/lib/tree/branch-pointer-queries';
import { extractPointedSubtree, mergePointedSubtree } from '@/lib/tree/branch-pointer-merge';
import type { GedcomData } from '@/lib/gedcom/types';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/tree — Get workspace family tree data
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tree = await getOrCreateTree(workspaceId);
  let gedcomData: GedcomData = dbTreeToGedcomData(tree);

  // Merge pointed subtrees from active branch pointers
  const pointers = await getActivePointersForWorkspace(workspaceId);
  for (const pointer of pointers) {
    const sourceTree = await getTreeByWorkspaceId(pointer.sourceWorkspaceId);
    if (!sourceTree) continue;

    const sourceData = dbTreeToGedcomData(sourceTree);
    const pointedSubtree = extractPointedSubtree(sourceData, {
      rootIndividualId: pointer.rootIndividualId,
      depthLimit: pointer.depthLimit,
      includeGrafts: pointer.includeGrafts,
    });

    gedcomData = mergePointedSubtree(gedcomData, pointedSubtree, {
      pointerId: pointer.id,
      anchorIndividualId: pointer.anchorIndividualId,
      selectedIndividualId: pointer.selectedIndividualId,
      relationship: pointer.relationship,
      sourceWorkspaceId: pointer.sourceWorkspaceId,
      linkChildrenToAnchor: pointer.linkChildrenToAnchor,
    });
  }

  const safeData = redactPrivateIndividuals(gedcomData);

  // Build pointer metadata for the frontend
  const pointerMetadata = pointers.map((p) => ({
    id: p.id,
    sourceWorkspaceNameAr: p.sourceWorkspaceNameAr,
    sourceWorkspaceSlug: p.sourceWorkspaceSlug,
    sourceRootName: p.sourceRootName || 'غير معروف',
    anchorIndividualId: p.anchorIndividualId,
    relationship: p.relationship,
    status: 'active' as const,
  }));

  return NextResponse.json({ data: safeData, pointers: pointerMetadata });
}
