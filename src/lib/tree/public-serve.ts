/**
 * Public Tree — serving layer (PRD §7.1, §7.5, §7.6).
 *
 * The ONE place that turns a published main tree into the anonymous public
 * dataset. Deny-by-default and additive: it never reuses the member-serving
 * route or its cross-workspace merge. Borrowed branches are included only when
 * their source tree is itself public, and the whole composed set is redacted
 * ONCE via `redactForPublic`.
 *
 * IMPORTANT: this module is structurally forbidden from importing the member
 * merge path (the active-pointers query and the pointed-subtree merger),
 * enforced by a test. It may use the pure `extractPointedSubtree` primitive only.
 */

import { prisma } from '@/lib/db'
import type { GedcomData, Individual } from '@/lib/gedcom/types'
import { cache } from 'react'
import { dbTreeToGedcomData, PRIVATE_PERSON_PLACEHOLDER } from '@/lib/tree/mapper'
import { getWorkspaceKey } from '@/lib/tree/encryption'
import { getTreeByWorkspaceId, getOrCreateTargetTree } from '@/lib/tree/queries'
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge'
import { redactForPublic } from '@/lib/tree/public-visibility'
import { composePublicGedcom, isSourceTreePublic } from '@/lib/tree/public-compose'
import type { BirthDatePrivacySettings } from '@/lib/tree/birth-date-privacy'

// ---------------------------------------------------------------------------
// SSR names list (the one real build item for SEO, §7.6)
// ---------------------------------------------------------------------------

export interface PublicNameEntry {
  id: string
  name: string
  gender: 'male' | 'female'
}

/**
 * Build the crawlable names list rendered into the page's initial HTML. Runs
 * over the ALREADY-redacted data, so it inherits every privacy guarantee.
 * Redacted (private) people and empty names are excluded — a private person is
 * never surfaced as a discoverable name.
 */
export function buildPublicNamesList(redactedData: GedcomData): PublicNameEntry[] {
  const list: PublicNameEntry[] = []
  for (const ind of Object.values(redactedData.individuals)) {
    if (ind.publicDisplay === 'redacted') continue
    if (!ind.name || ind.name === PRIVATE_PERSON_PLACEHOLDER) continue
    list.push({
      id: ind.id,
      name: ind.name,
      gender: ind.sex === 'F' ? 'female' : 'male',
    })
  }
  return list
}

// ---------------------------------------------------------------------------
// DB-aware loaders
// ---------------------------------------------------------------------------

export interface PublicTreeRecord {
  treeId: string
  workspaceId: string
  workspaceNameAr: string
  nameAr: string | null
  /** 'main' | 'extra' — an extra tree never serves borrowed branches and is
   * always `noindex` (Slice B). */
  kind: 'main' | 'extra'
  visibility: 'public_link' | 'public_listed'
  lastModifiedAt: Date
  publicSlug: string
  enableKunya: boolean
  hideBirthDateForFemale: boolean
  hideBirthDateForMale: boolean
}

/**
 * Resolve a published main tree by its public slug. Returns null when the slug
 * is unknown OR the tree is private (deny-by-default — a private tree is
 * indistinguishable from a non-existent one to an anonymous visitor).
 */
export async function loadPublicTreeBySlug(
  slug: string,
): Promise<PublicTreeRecord | null> {
  const tree = await prisma.familyTree.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      workspaceId: true,
      nameAr: true,
      visibility: true,
      lastModifiedAt: true,
      publicSlug: true,
      kind: true,
      workspace: {
        select: {
          nameAr: true,
          enableKunya: true,
          enableCollections: true,
          hideBirthDateForFemale: true,
          hideBirthDateForMale: true,
        },
      },
    },
  })

  // Deny-by-default: must exist and be public. The MAIN tree is always
  // servable; an `extra` tree is servable ONLY when the workspace has
  // Collections enabled (Slice B) — fail-closed when the flag is off/absent.
  if (!tree) return null
  if (tree.kind !== 'main' && tree.kind !== 'extra') return null
  if (tree.kind === 'extra' && !tree.workspace.enableCollections) return null
  if (tree.visibility !== 'public_link' && tree.visibility !== 'public_listed') {
    return null
  }

  return {
    treeId: tree.id,
    workspaceId: tree.workspaceId,
    workspaceNameAr: tree.workspace.nameAr,
    nameAr: tree.nameAr,
    kind: tree.kind,
    visibility: tree.visibility,
    lastModifiedAt: tree.lastModifiedAt,
    publicSlug: tree.publicSlug as string,
    enableKunya: tree.workspace.enableKunya,
    hideBirthDateForFemale: tree.workspace.hideBirthDateForFemale,
    hideBirthDateForMale: tree.workspace.hideBirthDateForMale,
  }
}

/**
 * Per-request memoized `loadPublicTreeBySlug` for the SSR page: `generateMetadata`
 * and the page body both call this, so the slug → tree query runs ONCE per
 * request (React `cache`). Pure memoization — same result as the raw function;
 * unit tests call the raw `loadPublicTreeBySlug` directly to avoid cross-test
 * memo bleed.
 */
export const getPublicTreeForRequest = cache(loadPublicTreeBySlug)

/**
 * Fetch the source-public borrowed subtrees for a published workspace.
 *
 * For each active pointer rooted IN the published tree, look up the SOURCE
 * tree's visibility server-side and include the (pure) extracted subtree ONLY
 * if the source is public. Fail-closed on anything missing.
 *
 * NOTE: this deliberately does NOT use the member active-pointers query — it
 * queries branchPointer directly so the public path stays separate from the
 * member merge path. It also does not use the member subtree merger; subtrees
 * are composed additively by `composePublicGedcom`.
 */
/**
 * Resolve each unique source workspace's MAIN-tree visibility once, into a
 * `workspaceId -> visibility|null` map (null = no main tree found → withheld,
 * fail-closed). Cheap (visibility column only); shared by the public-subtree
 * loader and the withheld-branches preview so the resolution can't drift.
 */
async function resolveSourceVisibility(
  sourceWorkspaceIds: string[],
): Promise<Map<string, string | null>> {
  const visibilityById = new Map<string, string | null>()
  await Promise.all(
    sourceWorkspaceIds.map(async (wsId) => {
      const srcTree = await prisma.familyTree.findFirst({
        where: { workspaceId: wsId, kind: 'main' },
        select: { visibility: true },
      })
      visibilityById.set(wsId, srcTree?.visibility ?? null)
    }),
  )
  return visibilityById
}

async function loadPublicBorrowedSubtrees(
  targetWorkspaceId: string,
): Promise<GedcomData[]> {
  const pointers = await prisma.branchPointer.findMany({
    // S20: exclude collection-link pointers (anchorless, isCollectionLink=true).
    // They are NOT borrowed branches; rendering them on the PUBLIC main tree
    // would leak another workspace's data. Fail-closed filter at the DB level.
    where: { targetWorkspaceId, status: 'active', isCollectionLink: false },
    select: {
      sourceWorkspaceId: true,
      rootIndividualId: true,
      depthLimit: true,
      includeGrafts: true,
    },
  })
  if (pointers.length === 0) return []

  const uniqueSourceIds = [...new Set(pointers.map((p) => p.sourceWorkspaceId))]
  const visibilityById = await resolveSourceVisibility(uniqueSourceIds)

  // Decrypt + map the source trees we actually need (only public ones).
  const sourceDataById = new Map<string, GedcomData>()
  await Promise.all(
    uniqueSourceIds.map(async (wsId) => {
      if (!isSourceTreePublic(visibilityById.get(wsId))) return // withheld, fail-closed
      const [srcTree, srcKey] = await Promise.all([
        getTreeByWorkspaceId(wsId),
        getWorkspaceKey(wsId),
      ])
      if (!srcTree) return
      sourceDataById.set(wsId, dbTreeToGedcomData(srcTree, srcKey))
    }),
  )

  const subtrees: GedcomData[] = []
  for (const p of pointers) {
    // Re-check source visibility per pointer (no include-without-recheck).
    if (!isSourceTreePublic(visibilityById.get(p.sourceWorkspaceId))) continue
    const sourceData = sourceDataById.get(p.sourceWorkspaceId)
    if (!sourceData) continue
    if (!sourceData.individuals[p.rootIndividualId]) continue

    subtrees.push(
      extractPointedSubtree(sourceData, {
        rootIndividualId: p.rootIndividualId,
        depthLimit: p.depthLimit,
        includeGrafts: p.includeGrafts,
      }),
    )
  }
  return subtrees
}

export interface WithheldBranch {
  sourceWorkspaceNameAr: string
  rootName: string
}

/**
 * List the borrowed branches that WILL be withheld from the public view because
 * their source tree is not public. Used by the publish preview to warn the
 * admin plainly which branches won't appear (PRD §1.8). Fail-closed: a missing
 * source tree is treated as withheld.
 */
export async function getWithheldBorrowedBranches(
  targetWorkspaceId: string,
): Promise<WithheldBranch[]> {
  const pointers = await prisma.branchPointer.findMany({
    // S20: exclude collection-link pointers (anchorless, isCollectionLink=true)
    // so the publish preview doesn't list bogus withheld branches for them.
    where: { targetWorkspaceId, status: 'active', isCollectionLink: false },
    select: {
      sourceWorkspaceId: true,
      rootIndividualId: true,
      sourceWorkspace: { select: { nameAr: true } },
      rootIndividual: { select: { givenName: true, surname: true } },
    },
  })
  if (pointers.length === 0) return []

  const uniqueSourceIds = [...new Set(pointers.map((p) => p.sourceWorkspaceId))]
  const visibilityById = await resolveSourceVisibility(uniqueSourceIds)

  const withheld: WithheldBranch[] = []
  for (const p of pointers) {
    if (isSourceTreePublic(visibilityById.get(p.sourceWorkspaceId))) continue
    const rootName =
      [p.rootIndividual.givenName, p.rootIndividual.surname].filter(Boolean).join(' ') ||
      'غير معروف'
    withheld.push({
      sourceWorkspaceNameAr: p.sourceWorkspace.nameAr,
      rootName,
    })
  }
  return withheld
}

export interface PublicTreePayload {
  record: PublicTreeRecord
  /** The fully redacted, composed public dataset (the JSON feed). */
  data: GedcomData
  /** SSR-crawlable names list (subset of `data`, redacted-safe). */
  names: PublicNameEntry[]
}

/**
 * Build the complete public payload for a published tree: compose home +
 * source-public borrowed branches, then redact ONCE, then derive the names
 * list from the redacted result. The single `redactForPublic` call is the one
 * filter for BOTH the JSON feed and the SSR names list.
 */
export async function buildPublicTreePayload(
  record: PublicTreeRecord,
): Promise<PublicTreePayload> {
  // HOME-ONLY for extra trees (Slice B): an `extra` tree serves only its own
  // data (loaded by treeId) and NEVER pulls borrowed branches — borrowing is a
  // main-tree-only capability, so we skip the pointer query entirely (fail-closed).
  const isExtra = record.kind === 'extra'

  const [tree, workspaceKey, borrowed] = await Promise.all([
    isExtra
      ? getOrCreateTargetTree(record.workspaceId, record.treeId)
      : getTreeByWorkspaceId(record.workspaceId),
    getWorkspaceKey(record.workspaceId),
    isExtra ? Promise.resolve([] as GedcomData[]) : loadPublicBorrowedSubtrees(record.workspaceId),
  ])

  const home: GedcomData = tree
    ? dbTreeToGedcomData(tree, workspaceKey)
    : { individuals: {}, families: {} }

  // Compose FIRST, then redact ONCE over the whole set.
  const composed = composePublicGedcom(home, borrowed)

  const birthDatePrivacy: BirthDatePrivacySettings = {
    hideBirthDateForFemale: record.hideBirthDateForFemale,
    hideBirthDateForMale: record.hideBirthDateForMale,
  }
  let data = redactForPublic(composed, new Date(), birthDatePrivacy)

  // Strip kunya when the feature is off (mirrors the member route's posture).
  if (!record.enableKunya) {
    const individuals: Record<string, Individual> = {}
    for (const [id, ind] of Object.entries(data.individuals)) {
      individuals[id] = { ...ind, kunya: '' }
    }
    data = { ...data, individuals }
  }

  const names = buildPublicNamesList(data)
  return { record, data, names }
}
