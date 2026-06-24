import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth';
import { getTreeByWorkspaceId } from '@/lib/tree/queries';
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { getActivePointersForWorkspace } from '@/lib/tree/branch-pointer-queries';
import { extractPointedSubtree, mergePointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { projectPerson, MEMBER_PROJECT_OPTIONS } from '@/lib/tree/person-projection';
import type { GedcomData } from '@/lib/gedcom/types';
import { createHash } from 'crypto';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

// Salts the ETag with the projection's logic version. The ETag is otherwise
// keyed ONLY on tree mtime + individual id, so a change to projection LOGIC
// (which leaves the tree data — and thus lastModifiedAt — untouched) keeps the
// SAME ETag, and a client holding a cached body gets a 304 and never sees the
// new output. Bump this whenever the PersonProjection shape/logic changes.
//  - v2: borrowed-lineage nasab fix (climb a fully-borrowed patriline in full;
//        stop at the borrowed root, not the first `_pointed` ancestor).
const PROJECTION_ETAG_VERSION = 'v2';

function computeETag(lastModifiedAt: Date, individualId: string): string {
  const hash = createHash('sha1')
    .update(`${PROJECTION_ETAG_VERSION}|${lastModifiedAt.toISOString()}|${individualId}`)
    .digest('hex')
    .slice(0, 16);
  return `"${hash}"`;
}

// GET /api/workspaces/[id]/tree/person/[individualId]
// Returns a SAFE, display-ready PersonProjection for one individual in the
// workspace MAIN tree. Reuses the tree-GET load → branch-pointer-merge
// pipeline, then runs `projectPerson` on the merged (un-redacted) data: the
// projection itself enforces the private gate at the source and never climbs
// past cross-workspace boundary (`_pointed`) nodes.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const auth = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(auth)) return auth;

  // The Person Page always reads the workspace MAIN tree (branch pointers only
  // ever anchor to it). Extra-tree person pages are out of scope here.
  const tree = await getTreeByWorkspaceId(workspaceId);
  if (!tree) {
    return NextResponse.json({ error: 'الشجرة غير موجودة' }, { status: 404 });
  }

  // ETag/304 — keyed on tree mtime + the individual id.
  const etag = computeETag(tree.lastModifiedAt, individualId);
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const workspaceKey = await getWorkspaceKey(workspaceId);
  let gedcomData: GedcomData = dbTreeToGedcomData(tree, workspaceKey);

  // Merge active branch pointers (same as the tree GET) so borrowed ancestry is
  // present — the projection emits boundary nodes but never climbs past them.
  const pointers = await getActivePointersForWorkspace(workspaceId);
  const uniqueSourceIds = [...new Set(pointers.map((p) => p.sourceWorkspaceId))];
  const sourceTreeMap = new Map<string, GedcomData>();
  const sourceTreeEntries = await Promise.all(
    uniqueSourceIds.map(async (wsId) => {
      const [sourceTree, sourceKey] = await Promise.all([
        getTreeByWorkspaceId(wsId),
        getWorkspaceKey(wsId),
      ]);
      if (!sourceTree) return null;
      return [wsId, dbTreeToGedcomData(sourceTree, sourceKey)] as const;
    }),
  );
  for (const entry of sourceTreeEntries) {
    if (entry) sourceTreeMap.set(entry[0], entry[1]);
  }

  for (const pointer of pointers) {
    const sourceData = sourceTreeMap.get(pointer.sourceWorkspaceId);
    if (!sourceData) continue;
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

  // Same redaction as the tree GET: private individuals keep their structure
  // but lose PII (and keep `isPrivate`). `projectPerson` is the second line of
  // defense — it omits private people from every relation group and shows them
  // only as a non-clickable «خاص» placeholder in the direct-ancestor chain.
  const safeData = redactPrivateIndividuals(gedcomData);

  // Member surface options (unbounded female line, `_pointed` boundary, patriline
  // continues through a private ancestor as a nameless «خاص» placeholder).
  const projection = projectPerson(safeData, individualId, MEMBER_PROJECT_OPTIONS);
  if (!projection) {
    return NextResponse.json({ error: 'الشخص غير موجود' }, { status: 404 });
  }

  return NextResponse.json(projection, {
    headers: {
      ETag: etag,
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
    },
  });
}
