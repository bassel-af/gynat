/**
 * Sources («المصادر») — links between one source and the people it is
 * «مصدر لـ». Shared by the member source routes.
 *
 * Rules (docs/implementation.md §4.10):
 *   - Every linked person is NATIVE to the source's tree. A borrowed-branch
 *     person has no row in this tree, so the tree-scoped lookup already
 *     refuses it.
 *   - A non-admin may never link a private person.
 *   - Every refusal is the SAME answer (`{ ok: false }` → one generic 400):
 *     another tree, nonexistent, malformed and private-for-non-admin never
 *     read differently (no existence oracle).
 */
import { NextResponse } from 'next/server';
import type { GedcomData } from '@/lib/gedcom/types';
import { decryptIndividualRow } from '@/lib/tree/encryption';
import { individualDisplayName, isUuid, type SourceEntryDto } from '@/lib/tree/source-entry-route-helpers';
import {
  visibleLinkedPeople,
  type SourceViewer,
  type SourceVisibilityLevel,
} from '@/lib/tree/source-visibility';
import { parentsOf, childrenOf, spousesOf, siblingsOf } from '@/lib/tree/relation-label';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface LinkTargetDb {
  individual: {
    findMany(args: {
      where: { id: { in: string[] }; treeId: string };
      select: { id: true; isPrivate: true };
    }): Promise<{ id: string; isPrivate: boolean }[]>;
  };
}

export type LinkTargetsResult =
  | { ok: true; people: { id: string; isPrivate: boolean }[] }
  | { ok: false };

/** All-or-nothing: every id must be a person of `treeId` this viewer may link. */
export async function validateLinkTargets(
  db: LinkTargetDb,
  treeId: string,
  ids: readonly string[],
  viewer: SourceViewer,
): Promise<LinkTargetsResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: true, people: [] };
  if (!unique.every(isUuid)) return { ok: false };

  const rows = await db.individual.findMany({
    where: { id: { in: unique }, treeId },
    select: { id: true, isPrivate: true },
  });
  if (rows.length !== unique.length) return { ok: false };
  if (viewer.kind !== 'admin' && rows.some((r) => r.isPrivate !== false)) return { ok: false };

  const byId = new Map(rows.map((r) => [r.id, r]));
  return { ok: true, people: unique.map((id) => ({ id, isPrivate: byId.get(id)!.isPrivate })) };
}

// ---------------------------------------------------------------------------
// Last link
// ---------------------------------------------------------------------------

export type OnLastLink = 'delete' | 'keep';

/**
 * What removing links does to the source itself:
 *   - `none`   — people remain, the source had nobody already, or it is the
 *                tree-wide source (never linked).
 *   - `ask`    — the op removes the LAST person and no choice was sent
 *                (→ 409 `last_link`).
 *   - `delete` / `keep` — the caller's choice for the last person.
 */
export function lastLinkOutcome(input: {
  isTreeWide: boolean;
  linksBefore: number;
  linksAfter: number;
  onLastLink?: OnLastLink;
}): 'none' | 'ask' | OnLastLink {
  if (input.isTreeWide) return 'none';
  if (input.linksBefore === 0 || input.linksAfter > 0) return 'none';
  return input.onLastLink ?? 'ask';
}

// ---------------------------------------------------------------------------
// Loading linked people
// ---------------------------------------------------------------------------

export interface LinkedPerson {
  id: string;
  /** Real, decrypted name — callers pass people through the gate before showing any. */
  name: string;
  isPrivate: boolean;
}

interface LinkRow {
  sourceId: string;
  individualId: string;
  individual: { isPrivate: boolean; givenName: unknown; surname: unknown; fullName: unknown } | null;
}

export interface LinkedPeopleDb {
  sourceLink: { findMany(args: unknown): Promise<unknown> };
}

/** Linked people per source id (link order), every requested id present. */
export async function loadLinkedPeople(
  db: LinkedPeopleDb,
  key: Buffer,
  sourceIds: readonly string[],
): Promise<Map<string, LinkedPerson[]>> {
  const out = new Map<string, LinkedPerson[]>();
  if (sourceIds.length === 0) return out;
  for (const id of sourceIds) out.set(id, []);

  const rows = (await db.sourceLink.findMany({
    where: { sourceId: { in: [...sourceIds] } },
    orderBy: [{ createdAt: 'asc' }, { individualId: 'asc' }],
    select: {
      sourceId: true,
      individualId: true,
      individual: { select: { isPrivate: true, givenName: true, surname: true, fullName: true } },
    },
  })) as LinkRow[];

  for (const row of rows) {
    if (!row.individual) continue;
    const plain = decryptIndividualRow(row.individual, key) as unknown as {
      givenName: string | null;
      surname: string | null;
      fullName: string | null;
    };
    out.get(row.sourceId)?.push({
      id: row.individualId,
      name: individualDisplayName(plain),
      isPrivate: row.individual.isPrivate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

/**
 * The person's household for «مصادر أسرته»: parents, spouses, siblings
 * (half-siblings included) and children. Never the person, never further
 * kin. Privacy is NOT applied here — the caller gates each source.
 */
export function householdIds(data: GedcomData, personId: string): Set<string> {
  const out = new Set<string>();
  if (!data.individuals[personId]) return out;
  const { father, mother } = parentsOf(data, personId);
  if (father) out.add(father);
  if (mother) out.add(mother);
  for (const id of spousesOf(data, personId)) out.add(id);
  for (const id of siblingsOf(data, personId)) out.add(id);
  for (const id of childrenOf(data, personId)) out.add(id);
  out.delete(personId);
  return out;
}

/**
 * `householdIds` straight from the database — the person GET does not load
 * the whole tree. Same household: parents, spouses, siblings (children of
 * every couple a parent is in, so half-siblings too) and children. Tree
 * scoped; never the person.
 */
export interface HouseholdDb {
  familyChild: {
    findMany(args: {
      where: { individualId: string; family: { treeId: string } };
      select: { family: { select: { husbandId: true; wifeId: true } } };
    }): Promise<{ family: { husbandId: string | null; wifeId: string | null } | null }[]>;
  };
  family: {
    findMany(args: {
      where: { treeId: string; OR: ({ husbandId: { in: string[] } } | { wifeId: { in: string[] } })[] };
      select: { husbandId: true; wifeId: true; children: { select: { individualId: true } } };
    }): Promise<{ husbandId: string | null; wifeId: string | null; children: { individualId: string }[] }[]>;
  };
}

export async function loadHouseholdIds(db: HouseholdDb, treeId: string, personId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const asChild = await db.familyChild.findMany({
    where: { individualId: personId, family: { treeId } },
    select: { family: { select: { husbandId: true, wifeId: true } } },
  });
  const parents = new Set<string>();
  for (const row of asChild) {
    if (row.family?.husbandId) parents.add(row.family.husbandId);
    if (row.family?.wifeId) parents.add(row.family.wifeId);
  }

  const spouses = [personId, ...parents];
  const families = await db.family.findMany({
    where: { treeId, OR: [{ husbandId: { in: spouses } }, { wifeId: { in: spouses } }] },
    select: { husbandId: true, wifeId: true, children: { select: { individualId: true } } },
  });

  for (const p of parents) out.add(p);
  for (const fam of families) {
    const kids = fam.children.map((c) => c.individualId);
    if (fam.husbandId === personId || fam.wifeId === personId) {
      // Own couple: the spouse and the children.
      if (fam.husbandId) out.add(fam.husbandId);
      if (fam.wifeId) out.add(fam.wifeId);
      kids.forEach((k) => out.add(k));
    }
    if ((fam.husbandId && parents.has(fam.husbandId)) || (fam.wifeId && parents.has(fam.wifeId))) {
      // A parent's couple: its children are siblings (half-siblings included).
      kids.forEach((k) => out.add(k));
    }
  }
  out.delete(personId);
  return out;
}

// ---------------------------------------------------------------------------
// Link changes (PATCH) and a non-admin's delete
// ---------------------------------------------------------------------------

/** A person the viewer can see at all: admins everyone, others never a private one. */
function canSeePerson(person: { isPrivate: boolean }, viewer: SourceViewer): boolean {
  return viewer.kind === 'admin' || person.isPrivate === false;
}

/**
 * What a PATCH `addPersonIds` / `removePersonIds` actually does. Already
 * linked adds and not-linked removes are no-ops (idempotent undo/redo). A
 * non-admin may remove only people they can see: a private person in their
 * remove list is silently kept — the answer never tells whether that person
 * was linked.
 */
export function planLinkChange(input: {
  linked: readonly { id: string; isPrivate: boolean }[];
  add: readonly string[];
  remove: readonly string[];
  viewer: SourceViewer;
}): { toAdd: string[]; toRemove: string[]; linksBefore: number; linksAfter: number } {
  const linkedIds = new Set(input.linked.map((l) => l.id));
  const toAdd = [...new Set(input.add)].filter((id) => !linkedIds.has(id));
  const removeSet = new Set(input.remove);
  const toRemove = input.linked
    .filter((l) => removeSet.has(l.id) && canSeePerson(l, input.viewer))
    .map((l) => l.id);
  const linksBefore = input.linked.length;
  return { toAdd, toRemove, linksBefore, linksAfter: linksBefore - toRemove.length + toAdd.length };
}

/**
 * DELETE by a viewer: an admin deletes the source. A non-admin deletes it
 * too unless it is also linked to people hidden from them (private) — then
 * only the links they can see go and the source stays for the others.
 */
export function planViewerDelete(
  linked: readonly { id: string; isPrivate: boolean }[],
  viewer: SourceViewer,
): { mode: 'all' } | { mode: 'unlink'; ids: string[] } {
  if (viewer.kind === 'admin') return { mode: 'all' };
  if (linked.every((l) => canSeePerson(l, viewer))) return { mode: 'all' };
  return { mode: 'unlink', ids: linked.filter((l) => canSeePerson(l, viewer)).map((l) => l.id) };
}

// ---------------------------------------------------------------------------
// Names and counts (always through the gate)
// ---------------------------------------------------------------------------

/**
 * The linked people this viewer may see this source on, as `{ id, name }`,
 * link order kept — the ONLY source of names and counts in a response.
 * `excludeId` drops the person the panel is about («مشترك مع» = the others).
 */
export function visibleNamedPeople(
  source: { visibility: SourceVisibilityLevel },
  people: readonly LinkedPerson[],
  viewer: SourceViewer,
  excludeId?: string,
): { id: string; name: string }[] {
  return visibleLinkedPeople(source, people, viewer)
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ id: p.id, name: p.name }));
}

/** What typing suggestions and family hints return for one source. */
export interface SourceSummaryDto {
  id: string;
  text: string | null;
  visibility: SourceVisibilityLevel;
  fileCount: number;
  /** Linked people this viewer may see — never a hidden one. */
  peopleCount: number;
  /** The one visible person's name when `peopleCount` is 1, else null. */
  firstPersonName: string | null;
}

/**
 * The summary of one source for this viewer. Only the gate's visible people
 * count; the one name is decrypted only when exactly one person is visible.
 */
export function sourceSummaryDto(
  row: { id: string; visibility: SourceVisibilityLevel; links?: readonly NamedLinkRow[] },
  text: string | null,
  fileCount: number,
  key: Buffer,
  viewer: SourceViewer,
): SourceSummaryDto {
  const peopleCount = visibleCount(row, row.links, viewer);
  return {
    id: row.id,
    text,
    visibility: row.visibility,
    fileCount,
    peopleCount,
    firstPersonName: peopleCount === 1 ? namedPeopleFromLinks(row, row.links, key, viewer, { limit: 1 })[0].name : null,
  };
}

/** At most this many «مصادر أسرته» rows. */
export const MAX_FAMILY_HINTS = 2;

/**
 * «مصادر أسرته»: drop sources already on the person and sources this viewer
 * sees on nobody; most-linked first (older first on a tie).
 */
export function pickFamilyHints<T extends { peopleCount: number; linkedToPerson: boolean; createdAt: string | Date }>(
  candidates: readonly T[],
): T[] {
  const time = (v: string | Date) => new Date(v).getTime();
  return candidates
    .filter((c) => !c.linkedToPerson && c.peopleCount > 0)
    .sort((a, b) => b.peopleCount - a.peopleCount || time(a.createdAt) - time(b.createdAt))
    .slice(0, MAX_FAMILY_HINTS);
}

// ---------------------------------------------------------------------------
// Links selected WITH names (one query with the source rows)
// ---------------------------------------------------------------------------

/**
 * A source's links, oldest first, with each person's privacy flag AND the
 * encrypted name columns. Names are decrypted only for people who pass the
 * gate (`namedPeopleFromLinks`).
 */
export const SOURCE_LINKS_WITH_NAMES_SELECT = {
  select: {
    individualId: true,
    individual: { select: { isPrivate: true, givenName: true, surname: true, fullName: true } },
  },
  orderBy: [{ createdAt: 'asc' as const }, { individualId: 'asc' as const }],
};

export interface NamedLinkRow {
  individualId: string;
  individual: { isPrivate: boolean; givenName?: unknown; surname?: unknown; fullName?: unknown } | null;
}

/** Gate input for every link; a link whose person row is missing counts as private. */
export function linkContexts(links: readonly NamedLinkRow[] | undefined): { id: string; isPrivate: boolean }[] {
  return (links ?? []).map((l) => ({ id: l.individualId, isPrivate: l.individual?.isPrivate ?? true }));
}

/**
 * `{ id, name }` of the linked people this viewer may see this source on —
 * the gate runs FIRST, only those names are decrypted. `limit` caps the
 * names (counts come from `visibleCount`).
 */
export function namedPeopleFromLinks(
  source: { visibility: SourceVisibilityLevel },
  links: readonly NamedLinkRow[] | undefined,
  key: Buffer,
  viewer: SourceViewer,
  opts: { excludeId?: string; limit?: number } = {},
): { id: string; name: string }[] {
  const visible = visibleLinkedPeople(
    source,
    (links ?? []).map((l) => ({ ...l, isPrivate: l.individual?.isPrivate ?? true })),
    viewer,
  ).filter((l) => l.individualId !== opts.excludeId);
  const capped = opts.limit === undefined ? visible : visible.slice(0, opts.limit);
  return capped.map((l) => ({ id: l.individualId, name: decryptedName(l.individual, key) }));
}

/** How many linked people this viewer may see this source on. */
export function visibleCount(
  source: { visibility: SourceVisibilityLevel },
  links: readonly NamedLinkRow[] | undefined,
  viewer: SourceViewer,
  excludeId?: string,
): number {
  return visibleLinkedPeople(source, linkContexts(links), viewer).filter((p) => p.id !== excludeId).length;
}

function decryptedName(individual: NamedLinkRow['individual'], key: Buffer): string {
  if (!individual) return '';
  const plain = decryptIndividualRow(
    { givenName: individual.givenName ?? null, surname: individual.surname ?? null, fullName: individual.fullName ?? null },
    key,
  ) as unknown as { givenName: string | null; surname: string | null; fullName: string | null };
  return individualDisplayName(plain);
}

/** Error thrown inside a link transaction to abort it with a response. */
export class SourceLinkRequestError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SourceLinkRequestError';
  }
}

/** The ONE answer for a person that cannot be linked (no existence oracle). */
export const INVALID_LINK_TARGETS_MESSAGE = 'تعذّر ربط المصدر بهؤلاء الأشخاص';
export const LAST_LINK_MESSAGE = 'هذا آخر شخص لهذا المصدر';
export const TREE_WIDE_LINK_MESSAGE = 'مصدر الشجرة لا يُربط بأشخاص';
export const TOO_MANY_LINKS_MESSAGE = 'لا يمكن ربط المصدر بأكثر من ٥٠٠ شخص';

export function sourceLinkErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof SourceLinkRequestError)) return null;
  return NextResponse.json(
    { error: error.message, ...(error.code ? { code: error.code } : {}) },
    { status: error.status },
  );
}

// ---------------------------------------------------------------------------
// Response shapes (shared with the client wrappers)
// ---------------------------------------------------------------------------

/** One source as seen on a person: the OTHER people this viewer may see it on. */
export interface PersonSourceDto extends SourceEntryDto {
  people: { id: string; name: string }[];
  /** Visible others (names are capped, the count is not). */
  sharedCount: number;
}

/** A source with every person this viewer may see it on (preview, PATCH). */
export interface SourceWithPeopleDto extends SourceEntryDto {
  people: { id: string; name: string }[];
  peopleCount: number;
}
