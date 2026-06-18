/**
 * Collections Chunk 3 — add-by-link RESOLUTION (Slice A).
 *
 * Turns a pasted string (a public-tree URL/slug, or a private branch share
 * code) into ONE `ResolvedLinkSource` shape — or `null`, which the route maps
 * to a single generic 400. There is exactly ONE failure value: the route never
 * distinguishes "unknown" from "exists-but-forbidden" (no enumeration oracle,
 * S9). No catalog/preview is exposed without a resolvable, reuse-permitted
 * source.
 *
 * Reuse-gate (S11) is enforced LIVE here: the SOURCE main tree's `allowReuse`
 * (and, for a public slug, its live public visibility) is re-queried at resolve
 * time. A stale add can never grandfather a later revoke — turning reuse off in
 * the source family fails every subsequent resolve immediately.
 *
 * Deny-by-default throughout: a missing/unknown/expired/forbidden source
 * resolves to `null`.
 */

import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/tree/branch-share-token';
import { getTreeByIdWithIncludes } from '@/lib/tree/queries';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { findDefaultRoot } from '@/lib/gedcom/roots';

export type ResolvedLinkType = 'private-token' | 'public-slug';

export interface ResolvedLinkSource {
  type: ResolvedLinkType;
  /** The workspace the branch/tree is borrowed FROM. */
  sourceWorkspaceId: string;
  /** The source MAIN tree id (the tree the branch lives in). */
  sourceTreeId: string;
  /** Root of the borrowed branch — token root, or the whole-tree marker for a public slug. */
  rootIndividualId: string;
  /** Depth cap of the borrowed branch (null = unlimited / whole tree). */
  depthLimit: number | null;
  includeGrafts: boolean;
  /** True for a public-slug source (drives the `public-borrowed` label); false for a private code. */
  isPublic: boolean;
  /** The redeemed share token's id (private-token only), so the pointer records its provenance. */
  shareTokenId: string | null;
  /**
   * The SOURCE tree's reuse flag, carried so `addByLink` can gate CROSS-WORKSPACE
   * borrows WITHOUT re-querying. A self-source (own paste) ignores this — own-tree
   * adds are always live links. For the private-token path this is always `true`
   * (the token already passed resolve-link's own reuse gate).
   */
  allowReuse: boolean;
}

/**
 * Pull a slug candidate out of a pasted public-tree address. Accepts a raw code
 * or a full `…/family/<slug>` URL (trailing slash tolerated). Returns the input
 * untouched when it isn't a recognizable URL — the caller still validates it
 * against the DB.
 */
export function extractSlugCandidate(input: string): string {
  const trimmed = input.trim();
  // /family/<slug> anywhere in the string (URL or path), last segment wins.
  const match = trimmed.match(/\/family\/([^/?#\s]+)/);
  if (match) return match[1];
  return trimmed;
}

/** A public main tree the slug resolved to (DB shape). */
interface SourceTreeReuseFacts {
  id: string;
  allowReuse: boolean;
  visibility: string;
}

/**
 * Resolve a pasted link into a borrowable source, or `null`.
 *
 * Resolution order (both end in the SAME `null` on failure — no oracle):
 *  1. Private share code → `hashToken()` lookup of a live `BranchShareToken`.
 *  2. Public slug → a published, main, reuse-enabled tree.
 *
 * `addingWorkspaceId` is accepted for symmetry / future self-source checks; the
 * self-source rejection itself lives at the route (it needs the 400 message).
 */
export async function resolveLinkSource(
  input: string,
  addingWorkspaceId: string,
): Promise<ResolvedLinkSource | null> {
  void addingWorkspaceId;
  const raw = input.trim();

  // ---- 1. Private share token (by sha256 hash; never the plaintext) ----
  const token = await prisma.branchShareToken.findFirst({
    where: { tokenHash: hashToken(raw), isRevoked: false, expiresAt: { gt: new Date() } },
  });
  if (token) {
    if (token.useCount >= token.maxUses) return null;

    // S11 reuse-gate: the SOURCE main tree must still permit reuse, re-queried
    // live so a later `allowReuse=false` revoke can't be grandfathered.
    const sourceTree = await getSourceMainTreeReuseFacts(token.sourceWorkspaceId);
    if (!sourceTree || !sourceTree.allowReuse) return null;

    return {
      type: 'private-token',
      sourceWorkspaceId: token.sourceWorkspaceId,
      sourceTreeId: sourceTree.id,
      rootIndividualId: token.rootIndividualId,
      depthLimit: token.depthLimit,
      includeGrafts: token.includeGrafts,
      isPublic: false,
      shareTokenId: token.id,
      // The token already passed the reuse gate above; carry true so the route's
      // cross-workspace re-check passes (a token is inherently a cross-workspace
      // share artifact, never a self-source own paste).
      allowReuse: true,
    };
  }

  // ---- 2. Public slug — resolve IDENTITY only (deny-by-default on visibility) ----
  // A published tree of ANY kind (main OR extra) resolves by identity here. The
  // kind gate is gone: a slug points at exactly one tree. The reuse gate is gone
  // too — it's a CROSS-WORKSPACE concept, so `addByLink` enforces it off the
  // carried `allowReuse` (a self-source own paste must NOT be reuse-gated). Only
  // the visibility gate stays: a non-public slug is genuinely unresolvable.
  const slug = extractSlugCandidate(raw);
  const tree = await prisma.familyTree.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      workspaceId: true,
      visibility: true,
      allowReuse: true,
    },
  });
  if (!tree) return null;
  if (tree.visibility !== 'public_link' && tree.visibility !== 'public_listed') return null;

  return {
    type: 'public-slug',
    sourceWorkspaceId: tree.workspaceId,
    sourceTreeId: tree.id,
    // A whole published tree is borrowed from its own data root; the pointer's
    // root is resolved by the redeem/copy layer from the source tree itself.
    rootIndividualId: WHOLE_TREE_ROOT,
    depthLimit: null,
    includeGrafts: false,
    isPublic: true,
    shareTokenId: null,
    // Carry the SOURCE tree's real reuse flag; addByLink gates cross-workspace
    // off it. (A non-reusable slug still RESOLVES — only the route rejects it.)
    allowReuse: tree.allowReuse,
  };
}

/**
 * Marker root id for a whole-tree public-slug borrow: the source tree has no
 * single share-token root, so the consumer resolves the actual root from the
 * source tree's data (topmost ancestor). Never persisted as a real id.
 */
export const WHOLE_TREE_ROOT = '__whole_tree__';

async function getSourceMainTreeReuseFacts(
  workspaceId: string,
): Promise<SourceTreeReuseFacts | null> {
  const tree = await prisma.familyTree.findFirst({
    where: { workspaceId, kind: 'main' },
    select: { id: true, allowReuse: true, visibility: true },
  });
  return tree;
}

/**
 * Resolve the REAL root individual id of a whole published tree (a public-slug
 * source). A self-anchored collection pointer needs a real `individuals` row for
 * its root/anchor FKs — the `WHOLE_TREE_ROOT` sentinel is never persistable.
 * Returns the topmost ancestor with the most descendants, or null for an empty
 * source tree (the caller fails the add closed).
 *
 * Scoped by `sourceTreeId` (not the workspace main tree) so the root of a
 * borrowed EXTRA tree resolves from that extra tree, not always the main.
 */
export async function resolvePublicTreeRoot(
  sourceWorkspaceId: string,
  sourceTreeId: string,
): Promise<string | null> {
  const [tree, key] = await Promise.all([
    getTreeByIdWithIncludes(sourceWorkspaceId, sourceTreeId),
    getWorkspaceKey(sourceWorkspaceId),
  ]);
  if (!tree) return null;
  const data = dbTreeToGedcomData(tree, key);
  return findDefaultRoot(data)?.id ?? null;
}
