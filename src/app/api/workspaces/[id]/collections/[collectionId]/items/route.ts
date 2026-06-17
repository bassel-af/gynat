import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { addItemSchema } from '@/lib/collections/schemas';
import {
  addItem,
  detectCollectionCycleInWorkspace,
  itemExistsInCollection,
} from '@/lib/collections/queries';
import { copyTreeIntoNewExtraTree } from '@/lib/collections/copy';

type RouteParams = { params: Promise<{ id: string; collectionId: string }> };

/**
 * True for a Prisma unique-constraint violation (P2002). The DB unique indexes
 * on `(collectionId, treeId)` / `(collectionId, childCollectionId)` are the
 * race backstop behind the in-transaction pre-check: if a concurrent identical
 * add wins the race, the insert trips the index and Prisma throws P2002, which
 * the route maps to the SAME friendly 409 the pre-check returns.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && 'code' in err && err.code === 'P2002'
  );
}

// POST /api/workspaces/[id]/collections/[collectionId]/items — Add an item
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, addItemSchema);
  if (isParseError(parsed)) return parsed;
  const input = parsed.data;

  // Parent collection must exist in this workspace.
  const parent = await prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    select: { id: true },
  });
  if (!parent) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  // ----- kind:'collection' (nested) -----
  if (input.kind === 'collection') {
    const child = await prisma.collection.findFirst({
      where: { id: input.childCollectionId, workspaceId },
      select: { id: true },
    });
    if (!child) {
      return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
    }

    // The cycle guard AND the duplicate guard run in the SAME transaction as
    // the insert so a concurrent nest can't slip a loop or a duplicate past the
    // check. The transaction returns a tagged result so the route can emit the
    // right 409 message.
    let result: {
      ok: boolean;
      item?: Awaited<ReturnType<typeof addItem>>;
      reason?: 'cycle' | 'duplicate';
    };
    try {
      result = await prisma.$transaction<typeof result>(async (tx) => {
        if (
          await itemExistsInCollection(
            collectionId,
            { childCollectionId: input.childCollectionId },
            tx,
          )
        ) {
          return { ok: false, reason: 'duplicate' };
        }
        const wouldCycle = await detectCollectionCycleInWorkspace(
          workspaceId,
          collectionId,
          input.childCollectionId,
          tx,
        );
        if (wouldCycle) return { ok: false, reason: 'cycle' };
        const item = await addItem(
          {
            collectionId,
            kind: 'collection',
            titleAr: input.titleAr,
            descriptionAr: input.descriptionAr ?? null,
            childCollectionId: input.childCollectionId,
          },
          tx,
        );
        return { ok: true, item };
      });
    } catch (err) {
      // A concurrent identical nest beat the pre-check and tripped the unique
      // index — same outcome as the friendly duplicate path.
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: 'هذه المجموعة مضافة بالفعل' },
          { status: 409 },
        );
      }
      throw err;
    }

    if (!result.ok) {
      const error =
        result.reason === 'duplicate'
          ? 'هذه المجموعة مضافة بالفعل'
          : 'سيُنشئ هذا حلقة';
      return NextResponse.json({ error }, { status: 409 });
    }
    return NextResponse.json({ data: result.item }, { status: 201 });
  }

  // ----- kind:'tree' -----
  // The brought-in (linkInput) branch is Chunk 2.
  if (input.linkInput != null) {
    return NextResponse.json({ error: 'غير متاح بعد' }, { status: 501 });
  }

  // own/extra tree: treeId must be a tree in this workspace.
  const tree = await prisma.familyTree.findFirst({
    where: { id: input.treeId, workspaceId },
    select: { id: true },
  });
  if (!tree) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  // linkMode 'copied' snapshots the tree into a new extra tree; 'linked'
  // references the original directly.
  let targetTreeId = input.treeId!;
  if (input.linkMode === 'copied') {
    const { newTreeId } = await copyTreeIntoNewExtraTree({
      workspaceId,
      sourceTreeId: input.treeId!,
      nameAr: input.titleAr,
    });
    targetTreeId = newTreeId;
  }

  // A 'linked' add references an EXISTING tree, so the same tree can't be linked
  // into one collection twice. The dedupe check + insert run in ONE transaction
  // so a concurrent identical add can't both pass the check and both insert
  // (TOCTOU-safe, matching the nested path). A 'copied' add always mints a
  // brand-new extra tree above, so it can never collide — guard the linked case.
  let item: Awaited<ReturnType<typeof addItem>> | null;
  try {
    item = await prisma.$transaction(async (tx) => {
      if (
        input.linkMode === 'linked' &&
        (await itemExistsInCollection(collectionId, { treeId: targetTreeId }, tx))
      ) {
        return null;
      }
      return addItem(
        {
          collectionId,
          kind: 'tree',
          titleAr: input.titleAr,
          descriptionAr: input.descriptionAr ?? null,
          linkMode: input.linkMode,
          treeId: targetTreeId,
        },
        tx,
      );
    });
  } catch (err) {
    // A concurrent identical add beat the pre-check and tripped the unique
    // index — same outcome as the friendly duplicate path.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: 'هذه الشجرة مضافة بالفعل إلى المجموعة' },
        { status: 409 },
      );
    }
    throw err;
  }

  if (!item) {
    return NextResponse.json(
      { error: 'هذه الشجرة مضافة بالفعل إلى المجموعة' },
      { status: 409 },
    );
  }

  return NextResponse.json({ data: item }, { status: 201 });
}
