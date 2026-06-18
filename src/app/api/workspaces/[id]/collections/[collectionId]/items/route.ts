import { NextRequest, NextResponse } from 'next/server';
import { prisma, isUniqueViolation } from '@/lib/db';
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
  addOwnTreeLinked,
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
import { ExtraTreeCapError } from '@/lib/collections/extra-tree-cap';

type RouteParams = { params: Promise<{ id: string; collectionId: string }> };

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

  // linkMode 'copied' snapshots the tree into a new extra tree, which always
  // mints a brand-new tree id so it can never collide — a plain insert.
  if (input.linkMode === 'copied') {
    let newTreeId: string;
    try {
      ({ newTreeId } = await copyTreeIntoNewExtraTree({
        workspaceId,
        sourceTreeId: input.treeId!,
        nameAr: input.titleAr,
      }));
    } catch (err) {
      if (err instanceof ExtraTreeCapError) return rateLimitResponse(0);
      throw err;
    }
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

  // 'linked' references the existing tree directly — dedupe + insert atomically
  // via the shared own-tree helper (same path the self-source add-by-link uses).
  const linkedAdd = await addOwnTreeLinked(
    collectionId,
    input.treeId!,
    input.titleAr,
    input.descriptionAr ?? null,
  );
  if (!linkedAdd.ok) return treeDuplicateResponse();
  return NextResponse.json({ data: linkedAdd.item }, { status: 201 });
}

/** One generic message for an unresolvable/forbidden link — no enumeration oracle (S9). */
const INVALID_LINK_ERROR = 'الرابط غير صالح أو غير متاح';

/** Build the single generic 404 used for EVERY resolve failure (bad token, unknown/private/non-reusable slug, self-source). */
function invalidLinkResponse(): NextResponse {
  return NextResponse.json({ error: INVALID_LINK_ERROR }, { status: 404 });
}

/** The friendly 409 for re-adding a tree already in the collection (own-tree picker or self-source link). */
function treeDuplicateResponse(): NextResponse {
  return NextResponse.json(
    { error: 'هذه الشجرة مضافة بالفعل إلى المجموعة' },
    { status: 409 },
  );
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

  // SELF-SOURCE: the pasted link identifies a tree in the CALLER'S OWN workspace
  // (membership already proven). The link already names the tree, so this is just
  // an own-tree add — short-circuit to the shared linked-add helper, IGNORING
  // linkMode (own-tree adds are always live links, Chunk-1 rule) and the reuse
  // gate (a cross-workspace concept). A re-add returns the same 409 tree-dup the
  // direct picker does — never the generic link error.
  if (source.sourceWorkspaceId === workspaceId) {
    const result = await addOwnTreeLinked(
      collectionId,
      source.sourceTreeId,
      input.titleAr,
      input.descriptionAr ?? null,
    );
    if (!result.ok) return treeDuplicateResponse();
    return NextResponse.json({ data: result.item }, { status: 201 });
  }

  // CROSS-WORKSPACE reuse gate (S11): borrowing ANOTHER family's tree requires
  // that family to have opted into reuse. The gate lives HERE (not resolve-link)
  // so a self-source paste above is never reuse-blocked. Same generic 404 as any
  // other resolve failure — no exists-but-forbidden oracle (S9).
  if (!source.allowReuse) return invalidLinkResponse();

  // ----- copied: deep-copy into a new extra tree, bind treeId -----
  // The copied path re-derives its own root inside copyBorrowedBranchIntoNewExtraTree,
  // so it does NOT need resolvePublicTreeRoot. Resolving the root below (linked-only)
  // avoids a redundant whole-tree decrypt on a public-slug copy.
  if (input.linkMode === 'copied') {
    let newTreeId: string;
    try {
      ({ newTreeId } = await copyBorrowedBranchIntoNewExtraTree({
        addingWorkspaceId: workspaceId,
        source,
        nameAr: input.titleAr,
      }));
    } catch (err) {
      if (err instanceof ExtraTreeCapError) return rateLimitResponse(0);
      throw err;
    }
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
  // The borrowed branch's REAL root id (a private token carries it; a public-
  // slug whole-tree source resolves to a sentinel → look up the topmost ancestor).
  // Needed as the pointer's `rootIndividualId` (a real FK) and for dedupe.
  const rootIndividualId =
    source.rootIndividualId === WHOLE_TREE_ROOT
      ? await resolvePublicTreeRoot(source.sourceWorkspaceId, source.sourceTreeId)
      : source.rootIndividualId;
  if (!rootIndividualId) return invalidLinkResponse(); // empty/unresolvable source tree
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
      },
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
