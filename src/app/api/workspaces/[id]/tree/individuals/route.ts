import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, touchTreeTimestamp } from '@/lib/tree/queries';
import { createIndividualSchema } from '@/lib/tree/schemas';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { snapshotIndividual, encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';
import { getWorkspaceKey, encryptIndividualInput, encryptSnapshot } from '@/lib/tree/encryption';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/individuals — Create a new individual
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createIndividualSchema);
  if (isParseError(parsed)) return parsed;

  const tree = await getOrCreateTree(workspaceId);

  // Strip kunya when feature is disabled
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableKunya: true },
  });
  if (!workspace?.enableKunya) {
    delete parsed.data.kunya;
  }

  const { isPrivate, isDeceased, ...fields } = parsed.data;

  // Phase 10b: encrypt sensitive fields BEFORE handing them to Prisma. The
  // returned `individual` row will contain Buffer/Uint8Array values for those
  // fields — we keep `fields` around as the plaintext source for the audit
  // snapshot so the audit log page can still render them (task #13 will wrap
  // the stored snapshot in an encrypted envelope).
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const encryptedFields = encryptIndividualInput(fields, workspaceKey);

  const individual = await prisma.individual.create({
    // Cast via unknown — Prisma Bytes column type is Uint8Array<ArrayBuffer>
    // while Node Buffer is a subclass with ArrayBufferLike. Runtime OK.
    data: {
      treeId: tree.id,
      ...encryptedFields,
      isDeceased: isDeceased ?? (fields.deathDate != null),
      isPrivate,
      createdById: result.user.id,
    } as unknown as Parameters<typeof prisma.individual.create>[0]['data'],
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'individual',
        entityId: individual.id,
        snapshotBefore: JSON_NULL,
        // Phase 10b: wrap the plaintext snapshot in an encrypted envelope
        // so the `snapshotAfter` Json column stores
        // `{ _encrypted: true, data: "<base64>" }`. The audit log read path
        // calls `decryptSnapshot` to unwrap before returning.
        snapshotAfter: encryptSnapshot(
          snapshotIndividual({
            id: individual.id,
            ...fields,
            isDeceased: isDeceased ?? (fields.deathDate != null),
            isPrivate,
          }),
          workspaceKey,
        ),
        description: encryptAuditDescription('create', 'individual', fields.givenName ?? null, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: individual }, { status: 201 });
}
