/**
 * Sources («المصادر») — links between one source and the people it is
 * «مصدر لـ». Shared by the member source routes.
 *
 * Rules (docs/sources-v1-goal.md §3–§5):
 *   - Every linked person is NATIVE to the source's tree. A borrowed-branch
 *     person has no row in this tree, so the tree-scoped lookup already
 *     refuses it.
 *   - A non-admin may never link a private person.
 *   - Every refusal is the SAME answer (`{ ok: false }` → one generic 400):
 *     another tree, nonexistent, malformed and private-for-non-admin never
 *     read differently (no existence oracle).
 */
import type { GedcomData } from '@/lib/gedcom/types';
import { decryptIndividualRow } from '@/lib/tree/encryption';
import { individualDisplayName, isUuid } from '@/lib/tree/source-entry-route-helpers';
import type { SourceViewer } from '@/lib/tree/source-visibility';
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
