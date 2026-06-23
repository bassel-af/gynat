import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { getRadaRelationships } from '@/lib/gedcom/relationships';
import { getDisplayName } from '@/lib/gedcom/display';

// ===========================================================================
// Person projection — the pure backend shape behind the Person Page.
//
// One pure function, `projectPerson`, runs over an ALREADY-LOADED, ALREADY-
// REDACTED `GedcomData` (no DB access). The SAME function serves both the
// member surface and the public surface; the surface-specific behavior is
// injected via `ProjectOptions`:
//   - `maternalRecursionDepth`: how deep to drill the female (mother-of-mother)
//     line. Member passes Infinity (capped by the sanity ceiling); public 1.
//   - `isBoundary`: the predicate that marks a node whose ANCESTRY must NOT be
//     walked. Member: `ind => ind._pointed === true` (borrowed branch). Public:
//     `ind => !homeIndividualIds.has(ind.id)` (anything outside this home tree).
//
// TWO HARD INVARIANTS (both tested):
//
//  1. CROSS-WORKSPACE BOUNDARY. Every UPWARD walk (paternal spine, maternal
//     fathers-only chain, the female-line mother recursion, and each spine
//     node's married-in mother chain) EMITS a boundary node as a chip but NEVER
//     reads its parents — borrowed/foreign ancestry is never climbed.
//
//  2. PRIVATE GATE. A private person is OMITTED entirely from every relation/
//     family group (siblings, spouses, children, grandchildren, uncles,
//     cousins, rada) — no chip, no placeholder — and a highlight `parentId`
//     never targets a private/omitted person. The ONLY place a private person
//     surfaces is a non-clickable «خاص» placeholder in a DIRECT-ANCESTOR nasab
//     position (paternal/maternal spine, or a father token inside a married-in
//     mother's fathers chain). A private MOTHER's OWN female line is fully
//     suppressed (locked chip, `fathers: []`, no `.mother`).
// ===========================================================================

export type Gender = 'male' | 'female';

/** «خاص» placeholder shown for a private direct ancestor (continuity only). */
export const PRIVATE_PLACEHOLDER = 'خاص';

/** Hard ceiling on nodes emitted per upward walk — a sanity bound, not a cap. */
export const PROJECTION_NODE_CEILING = 200;

export interface ProjectOptions {
  /** Female-line (mother-of-mother) recursion depth. Member: Infinity; public: 1. */
  maternalRecursionDepth: number;
  /** True ⇒ a node whose ancestry must NOT be walked (emit it, never climb past). */
  isBoundary: (ind: Individual) => boolean;
  /**
   * Whether a private PATRILINEAL ancestor mid-chain is a continuation point.
   * `true`  → emit the nameless «خاص» placeholder and KEEP climbing to his
   *           father (the member surface — matches the existing member tree,
   *           where redacted-but-positioned ancestors don't truncate the line).
   * `false` → emit the «خاص» placeholder and STOP (conservative). The public
   *           surface passes this pending a security exposure review; the public
   *           ROUTE flips it once security signs off — never decided here.
   * A private MOTHER's female line ALWAYS terminates, independent of this flag.
   */
  continueThroughPrivateAncestor: boolean;
}

/**
 * MEMBER defaults — used when `projectPerson` is called without explicit opts.
 * Member walks the female line unbounded (capped only by the sanity ceiling) and
 * treats only borrowed (`_pointed`) nodes as cross-workspace boundaries. The
 * public surface MUST pass its own opts (`{ maternalRecursionDepth: 1, isBoundary:
 * id-not-in-home }`).
 */
export const MEMBER_PROJECT_OPTIONS: ProjectOptions = {
  maternalRecursionDepth: Infinity,
  isBoundary: (ind) => ind._pointed === true,
  // Member surface continues the patriline through a private ancestor (nameless
  // «خاص» placeholder), matching the member tree. (Team-lead ruling; the public
  // surface passes the conservative stop pending a security review.)
  continueThroughPrivateAncestor: true,
};

export interface PersonChip {
  /**
   * Stable handle for navigation (`/person/<id>`). OPTIONAL and OMITTED on the
   * «خاص» private-ancestor placeholder — a private placeholder must carry NO id
   * (no navigable link, no stable enumeration handle).
   */
  id?: string;
  /** Display name; `'خاص'` only in the private chain-placeholder case. */
  name: string;
  givenName: string;
  gender: Gender;
  // Raw dates carried for CLIENT-side calendar formatting (NOT formatted here):
  birth: string;
  birthHijriDate: string;
  death: string;
  deathHijriDate: string;
  isDeceased: boolean;
  /** Public: publicDisplay==='living'; member: !isDeceased. */
  living?: boolean;
  /** True ⇒ locked, non-link, no PII (chain placeholder only). */
  private: boolean;
  /**
   * Set ONLY when that parent is also shown in the SAME section and is
   * non-private (drives the relationship highlight).
   */
  parentId?: string;
}

export interface MotherLine extends PersonChip {
  gender: 'female';
  /** Her fathers-only chain, nearest→oldest, all male; EMPTY if she is private. */
  fathers: PersonChip[];
  /** Recursion into HER mother; absent when depth exhausted or she is private. */
  mother?: MotherLine;
}

export interface SpineChip extends PersonChip {
  /** This spine person's married-in mother (+ her line). */
  mother?: MotherLine;
}

export interface MarriageEvent {
  date: string;
  hijriDate: string;
  place: string;
}

export interface MarriageGroup {
  familyId: string;
  /** null if unknown OR private (a private spouse is omitted → null). */
  spouse: PersonChip | null;
  /** Raw marriage-contract (fallback marriage) event for client formatting. */
  marriageEvent?: MarriageEvent;
  /** Children of THIS family only; private children omitted. */
  children: PersonChip[];
}

export interface PersonSubject {
  id: string;
  /** Composed full display name (`getDisplayName`) — DISTINCT from `givenName`. */
  name: string;
  givenName: string;
  surname: string;
  kunya: string;
  gender: Gender;
  birth: string;
  birthHijriDate: string;
  birthPlace: string;
  death: string;
  deathHijriDate: string;
  deathPlace: string;
  /** Individual.notes (الملاحظات). */
  notes: string;
  isDeceased: boolean;
  living: boolean;
  /** surname → rendered "من بيت {surname}". */
  house: string;
}

export interface PersonProjection {
  subject: PersonSubject;
  /** Oldest → father (NOT incl. subject); the UI reverses for the ribbon. */
  paternalChain: SpineChip[];
  /** Oldest → mother; the mother is the ONLY female, at the end. */
  maternalChain: SpineChip[];
  marriages: MarriageGroup[];
  grandchildren: PersonChip[];
  siblings: PersonChip[];
  paternalUncles: PersonChip[];
  maternalUncles: PersonChip[];
  paternalCousins: PersonChip[];
  maternalCousins: PersonChip[];
  rada: { fathers: PersonChip[]; mothers: PersonChip[]; siblings: PersonChip[] };
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function toGender(sex: Individual['sex']): Gender {
  return sex === 'F' ? 'female' : 'male';
}

/** Covers both the member redactor (`isPrivate`) and the public one (`redacted`). */
function isPrivate(ind: Individual): boolean {
  return ind.isPrivate === true || ind.publicDisplay === 'redacted';
}

function getFather(data: GedcomData, ind: Individual): Individual | null {
  if (!ind.familyAsChild) return null;
  const fam = data.families[ind.familyAsChild];
  if (!fam?.husband) return null;
  return data.individuals[fam.husband] ?? null;
}

function getMother(data: GedcomData, ind: Individual): Individual | null {
  if (!ind.familyAsChild) return null;
  const fam = data.families[ind.familyAsChild];
  if (!fam?.wife) return null;
  return data.individuals[fam.wife] ?? null;
}

/**
 * Build a `PersonChip`.
 *
 * - A NON-private person → a full chip (raw dates carried, `private: false`).
 * - A private person → ONLY when `allowPlaceholder` (direct-ancestor chain
 *   context): a locked «خاص» placeholder with blank PII, no `parentId`. In any
 *   relation group the caller MUST have already omitted the private person, so
 *   calling here without the flag on a private person is a programming error.
 */
function toChip(ind: Individual, allowPlaceholder = false): PersonChip {
  if (isPrivate(ind)) {
    if (!allowPlaceholder) {
      throw new Error(
        `toChip: private individual ${ind.id} reached a relation group (should have been omitted)`,
      );
    }
    // NO `id` — a private placeholder must not be navigable or enumerable.
    return {
      name: PRIVATE_PLACEHOLDER,
      givenName: PRIVATE_PLACEHOLDER,
      gender: toGender(ind.sex),
      birth: '',
      birthHijriDate: '',
      death: '',
      deathHijriDate: '',
      isDeceased: ind.isDeceased,
      private: true,
    };
  }
  const chip: PersonChip = {
    id: ind.id,
    // `name` = full display name (given + surname); `givenName` = bare given
    // name (the nasab ribbon/relation chips use the latter).
    name: getDisplayName(ind),
    givenName: ind.givenName?.trim() || ind.name?.trim() || '',
    gender: toGender(ind.sex),
    birth: ind.birth ?? '',
    birthHijriDate: ind.birthHijriDate ?? '',
    death: ind.death ?? '',
    deathHijriDate: ind.deathHijriDate ?? '',
    isDeceased: ind.isDeceased,
    private: false,
  };
  chip.living = ind.publicDisplay === 'living' ? true : !ind.isDeceased;
  return chip;
}

/** A non-private visible individual by id, or null (private → null). */
function visible(data: GedcomData, id: string | null | undefined): Individual | null {
  if (!id) return null;
  const ind = data.individuals[id];
  if (!ind || isPrivate(ind)) return null;
  return ind;
}

/**
 * A shared per-walk guard: cycle detection (visited set) + a hard node ceiling.
 */
class WalkGuard {
  private count = 0;
  readonly visited = new Set<string>();
  /** Returns false to stop the walk (cycle or ceiling). */
  enter(id: string): boolean {
    if (this.visited.has(id)) return false;
    if (this.count >= PROJECTION_NODE_CEILING) return false;
    this.visited.add(id);
    this.count += 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Upward walks: paternal spine, maternal spine, mother lines, fathers chains
// ---------------------------------------------------------------------------

/**
 * The paternal nasab spine: walk fathers up from `start`, ordered oldest →
 * father. Each non-private, non-boundary spine man carries his married-in
 * mother (+ her female line). A private patrilineal ancestor is emitted as a
 * «خاص» placeholder and the climb CONTINUES to his father (per §4.4 — the
 * grandfather is a separate person and may be public). The climb stops only at
 * a boundary node (emit it, do not read its parents) or the chain end.
 */
function buildPaternalSpine(
  data: GedcomData,
  start: Individual,
  opts: ProjectOptions,
): SpineChip[] {
  const nearestToOldest: SpineChip[] = [];
  const guard = new WalkGuard();
  guard.enter(start.id);

  let current: Individual | null = start;
  while (current) {
    const father = getFather(data, current);
    if (!father || !guard.enter(father.id)) break;

    if (isPrivate(father)) {
      nearestToOldest.push(toChip(father, true)); // «خاص» placeholder
      // Stop when this is also a boundary, OR when the surface opts out of
      // climbing past a private ancestor (public default, pending security).
      if (opts.isBoundary(father) || !opts.continueThroughPrivateAncestor) break;
      current = father; // member: continue up the patriline through the placeholder
      continue;
    }

    const node: SpineChip = toChip(father);
    if (!opts.isBoundary(father)) attachMother(data, father, node, opts);
    nearestToOldest.push(node);

    if (opts.isBoundary(father)) break; // emit boundary node, never climb past it
    current = father;
  }

  return nearestToOldest.reverse(); // oldest → father
}

/**
 * The maternal nasab column: the subject's mother (the only female, at the end,
 * carrying her own female-line recursion via `.mother`) preceded by HER
 * fathers-only spine (each man carrying his married-in mother). Ordered oldest
 * → mother. A private mother yields an empty column (her line is fully
 * suppressed — never a placeholder here, the spine is keyed off the mother).
 */
function buildMaternalSpine(
  data: GedcomData,
  subject: Individual,
  opts: ProjectOptions,
): SpineChip[] {
  const mother = getMother(data, subject);
  if (!mother || isPrivate(mother)) return [];

  // The mother's own fathers spine (each man carrying his married-in mother).
  const fatherSpine = opts.isBoundary(mother)
    ? []
    : buildPaternalSpine(data, mother, opts);

  // The mother node itself — female, carrying her own female-line recursion.
  const motherNode: SpineChip = toChip(mother);
  if (!opts.isBoundary(mother) && opts.maternalRecursionDepth > 0) {
    const line = buildMotherLine(data, mother, opts.maternalRecursionDepth, opts);
    if (line) motherNode.mother = line;
  }

  return [...fatherSpine, motherNode];
}

/**
 * The married-in mother (+ female line) of a spine `man`. `depth` is the number
 * of remaining female-line levels (member: large; public: 1). Returns undefined
 * when the man has no mother.
 *
 * A private mother → locked «خاص» chip, `fathers: []`, NO `.mother` (her line is
 * never exposed). A boundary mother → chip, `fathers: []`, no recursion (her
 * line is cross-workspace). Otherwise her fathers-only chain is walked and the
 * recursion descends to her own mother while `depth > 1`.
 */
function buildMotherLine(
  data: GedcomData,
  man: Individual,
  depth: number,
  opts: ProjectOptions,
): MotherLine | undefined {
  const mother = getMother(data, man);
  if (!mother) return undefined;

  if (isPrivate(mother)) {
    return { ...toChip(mother, true), gender: 'female', fathers: [] };
  }
  if (opts.isBoundary(mother)) {
    return { ...toChip(mother), gender: 'female', fathers: [] };
  }

  const line: MotherLine = {
    ...toChip(mother),
    gender: 'female',
    fathers: buildFathersChain(data, mother, opts),
  };

  if (depth > 1) {
    const deeper = buildMotherLine(data, mother, depth - 1, opts);
    if (deeper) line.mother = deeper;
  }

  return line;
}

/**
 * A woman's fathers-only chain (nearest → oldest, all male). Stops at a boundary
 * node (emit it, don't climb); a private father is emitted as a terminating
 * «خاص» placeholder. Cycle + ceiling guarded.
 */
function buildFathersChain(
  data: GedcomData,
  woman: Individual,
  opts: ProjectOptions,
): PersonChip[] {
  const out: PersonChip[] = [];
  if (opts.isBoundary(woman)) return out; // don't climb into a boundary's parents

  const guard = new WalkGuard();
  guard.enter(woman.id);

  let current: Individual | null = woman;
  while (current) {
    const father = getFather(data, current);
    if (!father || !guard.enter(father.id)) break;

    if (isPrivate(father)) {
      out.push(toChip(father, true)); // «خاص», terminates the fathers chain
      break;
    }
    out.push(toChip(father));
    if (opts.isBoundary(father)) break; // emit boundary, do not climb past it
    current = father;
  }

  return out;
}

/** Attach a spine node's married-in mother female-line. */
function attachMother(
  data: GedcomData,
  person: Individual,
  node: SpineChip,
  opts: ProjectOptions,
): void {
  if (opts.maternalRecursionDepth <= 0) return;
  const line = buildMotherLine(data, person, opts.maternalRecursionDepth, opts);
  if (line) node.mother = line;
}

// ---------------------------------------------------------------------------
// Lateral / family relations
// ---------------------------------------------------------------------------

function marriageEvent(fam: Family): MarriageEvent | undefined {
  const ev =
    fam.marriageContract.date || fam.marriageContract.hijriDate || fam.marriageContract.place
      ? fam.marriageContract
      : fam.marriage.date || fam.marriage.hijriDate || fam.marriage.place
        ? fam.marriage
        : null;
  if (!ev) return undefined;
  return { date: ev.date ?? '', hijriDate: ev.hijriDate ?? '', place: ev.place ?? '' };
}

/** One `MarriageGroup` per family the subject is a spouse in (marriage order). */
function buildMarriages(data: GedcomData, subject: Individual): MarriageGroup[] {
  const out: MarriageGroup[] = [];
  for (const familyId of subject.familiesAsSpouse) {
    const fam = data.families[familyId];
    if (!fam) continue;

    const spouseId = fam.husband === subject.id ? fam.wife : fam.husband;
    const spouse = visible(data, spouseId);

    const children: PersonChip[] = [];
    for (const childId of fam.children) {
      const child = visible(data, childId);
      if (child) children.push(toChip(child));
    }

    const group: MarriageGroup = {
      familyId,
      spouse: spouse ? toChip(spouse) : null,
      children,
    };
    const ev = marriageEvent(fam);
    if (ev) group.marriageEvent = ev;
    out.push(group);
  }
  return out;
}

/**
 * Grandchildren: children of the subject's own children. A grandchild whose
 * linking child is PRIVATE is still shown, but with `parentId` DROPPED (never
 * expose the hidden parent — §4.2). Deduped across marriages; private
 * grandchildren omitted.
 */
function buildGrandchildren(data: GedcomData, subject: Individual): PersonChip[] {
  const out: PersonChip[] = [];
  const seen = new Set<string>();

  for (const familyId of subject.familiesAsSpouse) {
    const fam = data.families[familyId];
    if (!fam) continue;
    for (const childId of fam.children) {
      const childInd = data.individuals[childId];
      if (!childInd) continue;
      const childPrivate = isPrivate(childInd);

      for (const childFamId of childInd.familiesAsSpouse) {
        const childFam = data.families[childFamId];
        if (!childFam) continue;
        for (const gcId of childFam.children) {
          const gc = visible(data, gcId);
          if (!gc || seen.has(gc.id)) continue;
          seen.add(gc.id);
          const chip = toChip(gc);
          // parentId only when the linking child is itself shown (non-private).
          if (!childPrivate) chip.parentId = childInd.id;
          out.push(chip);
        }
      }
    }
  }
  return out;
}

/** Siblings: other (visible) children of the subject's birth family. */
function buildSiblings(data: GedcomData, subject: Individual): PersonChip[] {
  if (!subject.familyAsChild) return [];
  const fam = data.families[subject.familyAsChild];
  if (!fam) return [];
  const out: PersonChip[] = [];
  for (const childId of fam.children) {
    if (childId === subject.id) continue;
    const sib = visible(data, childId);
    if (sib) out.push(toChip(sib));
  }
  return out;
}

/**
 * Uncles (a parent's siblings) + cousins (those uncles' children) on one side.
 * Empty when the parent is absent/private/boundary, or when a grandparent is a
 * boundary node (the family's other children are borrowed). Private uncles are
 * omitted AND their cousins are not enumerated (we can't link them without
 * exposing the hidden uncle — §4.2). Cousins carry `parentId` → their عم/خال.
 */
function buildUnclesAndCousins(
  data: GedcomData,
  parent: Individual | null,
  opts: ProjectOptions,
): { uncles: PersonChip[]; cousins: PersonChip[] } {
  const uncles: PersonChip[] = [];
  const cousins: PersonChip[] = [];
  if (!parent || isPrivate(parent) || opts.isBoundary(parent)) return { uncles, cousins };
  if (!parent.familyAsChild) return { uncles, cousins };

  const grandFamily = data.families[parent.familyAsChild];
  if (!grandFamily) return { uncles, cousins };

  // If either grandparent is a boundary node, this family's other children are
  // borrowed ancestry — never enumerate them.
  const grandFather = grandFamily.husband ? data.individuals[grandFamily.husband] : null;
  const grandMother = grandFamily.wife ? data.individuals[grandFamily.wife] : null;
  if ((grandFather && opts.isBoundary(grandFather)) || (grandMother && opts.isBoundary(grandMother))) {
    return { uncles, cousins };
  }

  for (const uncleId of grandFamily.children) {
    if (uncleId === parent.id) continue;
    const uncle = visible(data, uncleId);
    if (!uncle) continue; // private uncle omitted (and his cousins skipped)
    uncles.push(toChip(uncle));

    if (opts.isBoundary(uncle)) continue; // a boundary uncle's children are borrowed
    for (const uncleFamId of uncle.familiesAsSpouse) {
      const uncleFam = data.families[uncleFamId];
      if (!uncleFam) continue;
      for (const cousinId of uncleFam.children) {
        const cousin = visible(data, cousinId);
        if (!cousin) continue;
        const chip = toChip(cousin);
        chip.parentId = uncle.id;
        cousins.push(chip);
      }
    }
  }

  return { uncles, cousins };
}

/**
 * Rada (milk-kinship): `getRadaRelationships` already omits private people and
 * dedupes. Split parents by sex into fathers/mothers; siblings pass through.
 */
function buildRada(data: GedcomData, subject: Individual): PersonProjection['rada'] {
  const { radaParents, radaSiblings } = getRadaRelationships(data, subject.id);
  const fathers: PersonChip[] = [];
  const mothers: PersonChip[] = [];
  for (const parent of radaParents) {
    (toGender(parent.sex) === 'female' ? mothers : fathers).push(toChip(parent));
  }
  return { fathers, mothers, siblings: radaSiblings.map((s) => toChip(s)) };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Projects a display-ready `PersonProjection` for `individualId` from an
 * already-loaded, already-redacted `GedcomData`. Returns `null` when the id is
 * absent or the subject is itself private/redacted (a private person has no
 * page — that 404s upstream too, this is the defensive backstop).
 */
export function projectPerson(
  data: GedcomData,
  individualId: string,
  opts: ProjectOptions = MEMBER_PROJECT_OPTIONS,
): PersonProjection | null {
  const subject = data.individuals[individualId];
  if (!subject || isPrivate(subject)) return null;

  const surname = subject.surname?.trim() ?? '';
  const subjectOut: PersonSubject = {
    id: subject.id,
    name: getDisplayName(subject),
    givenName: subject.givenName?.trim() || subject.name?.trim() || '',
    surname,
    kunya: subject.kunya ?? '',
    gender: toGender(subject.sex),
    birth: subject.birth ?? '',
    birthHijriDate: subject.birthHijriDate ?? '',
    birthPlace: subject.birthPlace ?? '',
    death: subject.death ?? '',
    deathHijriDate: subject.deathHijriDate ?? '',
    deathPlace: subject.deathPlace ?? '',
    notes: subject.notes ?? '',
    isDeceased: subject.isDeceased,
    living: subject.publicDisplay === 'living' ? true : !subject.isDeceased,
    house: surname,
  };

  const father = getFather(data, subject);
  const mother = getMother(data, subject);
  const paternal = buildUnclesAndCousins(data, father, opts);
  const maternal = buildUnclesAndCousins(data, mother, opts);

  return {
    subject: subjectOut,
    paternalChain: buildPaternalSpine(data, subject, opts),
    maternalChain: buildMaternalSpine(data, subject, opts),
    marriages: buildMarriages(data, subject),
    grandchildren: buildGrandchildren(data, subject),
    siblings: buildSiblings(data, subject),
    paternalUncles: paternal.uncles,
    maternalUncles: maternal.uncles,
    paternalCousins: paternal.cousins,
    maternalCousins: maternal.cousins,
    rada: buildRada(data, subject),
  };
}
