import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { bulkSourceEntriesSchema } from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  decryptEntryText,
  resolveSourceTreeOr404,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import {
  snapshotSourceEntry,
  encryptAuditDescription,
  encryptAuditPayload,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/sources/bulk — admins only.
// `{ treeId?, ids (≤ 500), action: 'setVisibility' | 'delete', visibility? }`
//
// Only ids that belong to the resolved tree are touched; anything else is
// silently ignored (never an existence oracle — the count covers own-tree ids
// only). Audit mirrors cascade delete: ONE summary row (entityId = the tree)
// whose encrypted snapshots list every touched entry.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, bulkSourceEntriesSchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, ids, action, visibility } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const rows = (await prisma.sourceEntry.findMany({
    where: { treeId: tree.id, id: { in: [...new Set(ids)] } },
    select: SOURCE_ENTRY_SELECT,
  })) as SourceEntryRow[];

  const countKey = action === 'delete' ? 'deleted' : 'updated';
  if (rows.length === 0) return NextResponse.json({ data: { [countKey]: 0 } });

  const ownIds = rows.map((r) => r.id);
  const where = { treeId: tree.id, id: { in: ownIds } };
  const { count } =
    action === 'delete'
      ? await prisma.sourceEntry.deleteMany({ where })
      : await prisma.sourceEntry.updateMany({ where, data: { visibility: visibility! } });

  const key = await getWorkspaceKey(workspaceId);
  const before = rows.map((r) => snapshotSourceEntry({ ...r, text: decryptEntryText(r, key) }));
  const auditAction = action === 'delete' ? 'delete' : 'update';

  // No touchTreeTimestamp: sources are not part of the tree payload.
  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: auditAction,
    entityType: 'source_entry',
    entityId: tree.id,
    payload: encryptAuditPayload({ bulk: true, action, visibility, ids: ownIds, count }, key),
    snapshotBefore: encryptSnapshot({ entries: before }, key),
    snapshotAfter:
      action === 'delete'
        ? JSON_NULL
        : encryptSnapshot({ entries: before.map((s) => ({ ...s, visibility })) }, key),
    description: encryptAuditDescription(auditAction, 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return NextResponse.json({ data: { [countKey]: count } });
}
