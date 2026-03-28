import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Branch Pointer query helpers
// ---------------------------------------------------------------------------

export interface ActivePointer {
  id: string;
  sourceWorkspaceId: string;
  rootIndividualId: string;
  selectedIndividualId: string;
  depthLimit: number | null;
  includeGrafts: boolean;
  targetWorkspaceId: string;
  anchorIndividualId: string;
  relationship: 'child' | 'sibling' | 'spouse' | 'parent';
  linkChildrenToAnchor: boolean;
  sourceWorkspaceNameAr?: string;
  sourceWorkspaceSlug?: string;
  sourceRootName?: string;
}

/**
 * Get all active branch pointers targeting a workspace.
 * Used by GET /tree to merge pointed subtrees.
 */
export async function getActivePointersForWorkspace(
  targetWorkspaceId: string,
): Promise<ActivePointer[]> {
  const pointers = await prisma.branchPointer.findMany({
    where: {
      targetWorkspaceId,
      status: 'active',
    },
    select: {
      id: true,
      sourceWorkspaceId: true,
      rootIndividualId: true,
      selectedIndividualId: true,
      depthLimit: true,
      includeGrafts: true,
      targetWorkspaceId: true,
      anchorIndividualId: true,
      relationship: true,
      linkChildrenToAnchor: true,
      sourceWorkspace: {
        select: { nameAr: true, slug: true },
      },
      rootIndividual: {
        select: { givenName: true, surname: true },
      },
    },
  });

  return pointers.map((p) => ({
    ...p,
    sourceWorkspaceNameAr: p.sourceWorkspace.nameAr,
    sourceWorkspaceSlug: p.sourceWorkspace.slug,
    sourceRootName: [p.rootIndividual.givenName, p.rootIndividual.surname]
      .filter(Boolean)
      .join(' ') || undefined,
  })) as ActivePointer[];
}

/**
 * Check if an individual ID is a root of an active branch pointer
 * targeting the given workspace. Used by mutation guards to reject
 * edits to pointed individuals.
 */
export async function isPointedIndividualInWorkspace(
  individualId: string,
  targetWorkspaceId: string,
): Promise<boolean> {
  const pointer = await prisma.branchPointer.findFirst({
    where: {
      targetWorkspaceId,
      rootIndividualId: individualId,
      status: 'active',
    },
    select: { id: true },
  });

  return pointer !== null;
}
