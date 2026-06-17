import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import {
  treeMutateLimiter,
  collectionLinkResolveLimiter,
  rateLimitResponse,
  clientIpKey,
} from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { addItemSchema } from '@/lib/collections/schemas';
import {
  addItem,
  detectCollectionCycleInWorkspace,
  itemExistsInCollection,
} from '@/lib/collections/queries';
import { copyTreeIntoNewExtraTree } from '@/lib/collections/copy';
import {
  resolveLinkSource,
  resolvePublicTreeRoot,
  WHOLE_TREE_ROOT,
} from '@/lib/collections/resolve-link';
import { copyBorrowedBranchIntoNewExtraTree } from '@/lib/collections/copy-borrowed';

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

  // ----- kind:'tree', brought-in by link (Chunk 3 / add-by-link) -----
  if (input.linkInput != null) {
    return addByLink(request, workspaceId, collectionId, input, result.user.id);
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

/** One generic message for an unresolvable/forbidden link — no enumeration oracle (S9). */
const INVALID_LINK_ERROR = 'الرابط غير صالح أو غير متاح';

/** Build the single generic 404 used for EVERY resolve failure (bad token, unknown/private/non-reusable slug, self-source). */
function invalidLinkResponse(): NextResponse {
  return NextResponse.json({ error: INVALID_LINK_ERROR }, { status: 404 });
}

/**
 * Add-by-link: resolve a pasted public-tree URL/slug or private share code into
 * a borrowable source, then bind it.
 *
 *  - `linked` → an ANCHOR-LESS branchPointer (a borrowed branch added to a
 *    collection has NO person in the target tree to stitch onto — it's a SOURCE
 *    DESCRIPTOR, not a stitch). `selectedIndividualId` / `anchorIndividualId` /
 *    `relationship` are NULL, which is the discriminator that keeps it out of
 *    the member-tree merge. Bound via `branchPointerId`. ZERO bytes copied.
 *  - `copied` → cross-workspace TWO-KEY deep-copy into a new extra tree (decrypt
 *    SOURCE key → re-encrypt TARGET key), bound via `treeId`. Provenance written.
 *
 * Deny-by-default: every resolve failure (unknown/expired token, unknown/private/
 * non-reusable slug) AND self-source (S14) return the SAME generic 404 — no
 * exists-but-forbidden oracle (S9).
 */
async function addByLink(
  request: NextRequest,
  workspaceId: string,
  collectionId: string,
  input: { linkInput?: string; linkMode: 'linked' | 'copied'; titleAr: string; descriptionAr?: string | null },
  userId: string,
): Promise<NextResponse> {
  // S10: IP-key the resolve BEFORE any token/slug lookup — pasting codes against
  // the share-token / public-slug tables is a guess surface even for an
  // authenticated editor (the per-user limiter at the route head isn't enough).
  const ip = clientIpKey(request);
  const { allowed, retryAfterSeconds } = collectionLinkResolveLimiter.check(ip);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const source = await resolveLinkSource(input.linkInput!, workspaceId);
  if (!source) return invalidLinkResponse();

  // S14: a collection borrows from OTHER families; borrowing your own tree by
  // link is meaningless (and would double-count) — reject same-workspace with
  // the SAME generic 404 (no oracle).
  if (source.sourceWorkspaceId === workspaceId) return invalidLinkResponse();

  // The borrowed branch's REAL root id (a private token carries it; a public-
  // slug whole-tree source resolves to a sentinel → look up the topmost ancestor).
  // Needed as the pointer's `rootIndividualId` (a real FK) and for dedupe.
  const rootIndividualId =
    source.rootIndividualId === WHOLE_TREE_ROOT
      ? await resolvePublicTreeRoot(source.sourceWorkspaceId)
      : source.rootIndividualId;
  if (!rootIndividualId) return invalidLinkResponse(); // empty/unresolvable source tree

  // ----- copied: deep-copy into a new extra tree, bind treeId -----
  if (input.linkMode === 'copied') {
    const { newTreeId } = await copyBorrowedBranchIntoNewExtraTree({
      addingWorkspaceId: workspaceId,
      source,
      nameAr: input.titleAr,
    });
    const item = await addItem({
      collectionId,
      kind: 'tree',
      titleAr: input.titleAr,
      descriptionAr: input.descriptionAr ?? null,
      linkMode: 'copied',
      treeId: newTreeId,
    });
    return NextResponse.json({ data: item }, { status: 201 });
  }

  // ----- linked: ANCHOR-LESS branchPointer, bind branchPointerId -----
  // The dedupe re-check + pointer create + item insert run in ONE transaction so
  // a concurrent identical borrow can't both pass the check and both insert.
  const item = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as typeof prisma;
    if (
      await itemExistsInCollection(
        collectionId,
        {
          borrowedSource: {
            sourceWorkspaceId: source.sourceWorkspaceId,
            rootIndividualId,
          },
        },
        txPrisma,
      )
    ) {
      return null;
    }

    const pointer = await txPrisma.branchPointer.create({
      data: {
        sourceWorkspaceId: source.sourceWorkspaceId,
        rootIndividualId,
        depthLimit: source.depthLimit,
        includeGrafts: source.includeGrafts,
        targetWorkspaceId: workspaceId,
        // ANCHOR-LESS collection-link pointer: a collection branch has no anchor
        // person in the target tree. `isCollectionLink: true` is the explicit
        // discriminator that excludes it from the member-tree merge, the branch
        // list, and the public-serve borrowed query. anchor/selected/
        // relationship stay NULL (no stitch).
        isCollectionLink: true,
        selectedIndividualId: null,
        anchorIndividualId: null,
        relationship: null,
        status: 'active',
        shareTokenId: source.shareTokenId,
        createdById: userId,
      } as unknown as Parameters<typeof txPrisma.branchPointer.create>[0]['data'],
    });

    return addItem(
      {
        collectionId,
        kind: 'tree',
        titleAr: input.titleAr,
        descriptionAr: input.descriptionAr ?? null,
        linkMode: 'linked',
        branchPointerId: pointer.id,
        rootIndividualId,
      },
      txPrisma,
    );
  });

  if (!item) {
    return NextResponse.json(
      { error: 'هذا الفرع مضاف بالفعل إلى المجموعة' },
      { status: 409 },
    );
  }

  return NextResponse.json({ data: item }, { status: 201 });
}
