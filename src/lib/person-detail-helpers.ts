import type { Individual, Family, GedcomData } from '@/lib/gedcom/types';
import { getDisplayName, getDisplayNameWithNasab } from '@/lib/gedcom';
import { getAllDescendants } from '@/lib/gedcom/graph';

/** Format date with place for display */
export function formatDateWithPlace(date: string, place: string): string {
  if (date && place) return `${date} — ${place}`;
  if (date) return date;
  if (place) return place;
  return '';
}

/** Get deceased label based on sex, only when isDeceased is true but no death date */
export function getDeceasedLabel(person: Individual): string | null {
  if (!person.isDeceased) return null;
  if (person.death) return null;
  return person.sex === 'F' ? 'متوفية' : 'متوفى';
}

/**
 * Family IDs where the person is a spouse AND the family is natively editable.
 *
 * Excludes synthetic branch-pointer stitch families (`ptr-{pointerId}-fam`,
 * marked `_pointed`) and any other pointed/read-only family. These can appear
 * in `familiesAsSpouse` when the person is the ANCHOR of a branch pointer — the
 * stitch family is appended to the anchor's spouse-families so its grafted
 * children render, but it must never be a target for native mutations (its id
 * is not a UUID, so the DB rejects it).
 */
export function getEditableSpouseFamilyIds(
  person: Individual,
  data: GedcomData,
): string[] {
  return person.familiesAsSpouse.filter((familyId) => {
    const family = data.families[familyId];
    return family != null && !family._pointed;
  });
}

/** Determine if family picker is needed for add-child action */
export function needsFamilyPickerForAddChild(
  person: Individual,
  data: GedcomData,
): boolean {
  return getEditableSpouseFamilyIds(person, data).length > 1;
}

/** Add-parent validation result */
export type AddParentResult =
  | { allowed: true; lockedSex?: 'M' | 'F' }
  | { allowed: false; error: string };

/** Validate whether a parent can be added and determine locked sex */
export function validateAddParent(person: Individual, data: GedcomData): AddParentResult {
  if (!person.familyAsChild) {
    return { allowed: true };
  }
  const family = data.families[person.familyAsChild];
  if (!family) {
    return { allowed: true };
  }
  if (family.husband && family.wife) {
    return { allowed: false, error: 'هذا الشخص لديه والدان بالفعل' };
  }
  if (family.husband && !family.wife) {
    return { allowed: true, lockedSex: 'F' };
  }
  if (!family.husband && family.wife) {
    return { allowed: true, lockedSex: 'M' };
  }
  return { allowed: true };
}

/** Add-sibling validation result */
export type AddSiblingResult =
  | { allowed: true; targetFamilyId: string }
  | { allowed: false };

/** Validate whether a sibling can be added to the same parent family */
export function validateAddSibling(person: Individual, data: GedcomData): AddSiblingResult {
  if (!person.familyAsChild) {
    return { allowed: false };
  }
  const family = data.families[person.familyAsChild];
  if (!family) {
    return { allowed: false };
  }
  return { allowed: true, targetFamilyId: person.familyAsChild };
}

/** Check if person can be moved as a subtree (has a familyAsChild) */
export function canMoveSubtree(person: Individual): boolean {
  return person.familyAsChild !== null;
}

/**
 * Get all possible target families for move-subtree / assign-parents.
 * Works for both cases:
 *   - person has a current familyAsChild → "change parents"
 *   - person has no familyAsChild → "assign parents to a parentless person"
 * Caller must pre-compute subtreeIds (person + all descendants) and pass it in
 * to avoid recomputing on every call.
 */
export function getTargetFamiliesForMove(
  person: Individual,
  data: GedcomData,
  subtreeIds: Set<string>,
): Array<{ familyId: string; parentNames: string }> {
  const results: Array<{ familyId: string; parentNames: string }> = [];
  const currentFamilyId = person.familyAsChild;

  for (const [famId, family] of Object.entries(data.families)) {
    if (famId === currentFamilyId) continue;
    // Skip pointed families — can't move into external data
    if (family._pointed) continue;
    // Exclude families where either parent is inside the subtree (cycle prevention,
    // also excludes families where the person themselves is a parent)
    if (family.husband && subtreeIds.has(family.husband)) continue;
    if (family.wife && subtreeIds.has(family.wife)) continue;
    // Exclude families where the person is already a child
    if (family.children.includes(person.id)) continue;

    // Name + father + family name: a bare given name is ambiguous in the picker,
    // especially for a wife-less family where there is no second name to go by.
    const names: string[] = [];
    if (family.husband) {
      const h = data.individuals[family.husband];
      if (h) names.push(getDisplayNameWithNasab(data, h));
    }
    if (family.wife) {
      const w = data.individuals[family.wife];
      if (w) names.push(getDisplayNameWithNasab(data, w));
    }
    results.push({
      familyId: famId,
      parentNames: names.length > 0 ? names.join(' + ') : 'عائلة بدون والدين',
    });
  }
  return results;
}

/**
 * Return individuals who can be picked as a single new parent of the target person,
 * creating a one-parent FAM (HUSB-only or WIFE-only) on confirm. Filters out:
 *   - the target person themselves and their descendants (cycle prevention),
 *   - anyone already a parent in any FAM (those rows come from the families list),
 *   - pointed individuals (read-only, can't be re-homed),
 *   - individuals without a known sex (can't decide HUSB vs WIFE).
 * GEDCOM 5.5.1 + 7.0 allow FAM with only HUSB+CHIL or only WIFE+CHIL — both standard.
 */
export function getSoloIndividualsForParenting(
  person: Individual,
  data: GedcomData,
  subtreeIds: Set<string>,
): Individual[] {
  const results: Individual[] = [];
  for (const candidate of Object.values(data.individuals)) {
    if (candidate.id === person.id) continue;
    if (subtreeIds.has(candidate.id)) continue;
    if (candidate._pointed) continue;
    if (candidate.sex !== 'M' && candidate.sex !== 'F') continue;
    if (candidate.familiesAsSpouse.length > 0) continue;
    results.push(candidate);
  }
  return results;
}

/**
 * Identify previous parents who would become fully disconnected (orphan nodes) after the
 * person is moved out of their current familyAsChild. A previous parent is considered an
 * orphan when, after removing `person` from the source family, they have:
 *   - no familyAsChild (no parents/siblings of their own), AND
 *   - no other familiesAsSpouse, AND
 *   - no other child remaining in the source family, AND
 *   - no spouse remaining in the source family.
 * Returns the orphaned parents so the caller can warn and delete them.
 */
export function detectOrphanedPreviousParents(
  person: Individual,
  data: GedcomData,
): Individual[] {
  if (!person.familyAsChild) return [];
  const source = data.families[person.familyAsChild];
  if (!source) return [];

  const orphans: Individual[] = [];
  const sourceFamilyId = source.id;
  const otherChildren = source.children.filter((c) => c !== person.id);

  for (const parentId of [source.husband, source.wife]) {
    if (!parentId) continue;
    const parent = data.individuals[parentId];
    if (!parent) continue;
    // Has parents/siblings of their own?
    if (parent.familyAsChild) continue;
    // Has another marriage?
    const otherSpouseFamilies = parent.familiesAsSpouse.filter((f) => f !== sourceFamilyId);
    if (otherSpouseFamilies.length > 0) continue;
    // Source family still has another remaining child?
    if (otherChildren.length > 0) continue;
    // Source family still has the other spouse?
    const otherParentId = parentId === source.husband ? source.wife : source.husband;
    if (otherParentId) continue;
    orphans.push(parent);
  }
  return orphans;
}

/** Compute subtree IDs (person + all descendants) for move-subtree operations */
export function computeSubtreeIds(data: GedcomData, personId: string): Set<string> {
  const descendants = getAllDescendants(data, personId);
  descendants.add(personId);
  return descendants;
}

/** Build initial data for edit form including new Phase 3 fields */
export function buildEditInitialData(person: Individual): Record<string, unknown> {
  const result: Record<string, unknown> = {
    givenName: person.givenName,
    surname: person.surname,
    sex: person.sex ?? '',
    birthDate: person.birth,
    birthPlace: person.birthPlace,
    birthDescription: person.birthDescription,
    birthNotes: person.birthNotes,
    birthHijriDate: person.birthHijriDate,
    deathDate: person.death,
    deathPlace: person.deathPlace,
    deathDescription: person.deathDescription,
    deathNotes: person.deathNotes,
    deathHijriDate: person.deathHijriDate,
    kunya: person.kunya ?? '',
    isDeceased: person.isDeceased,
    isPrivate: person.isPrivate,
    notes: person.notes,
  };
  if (person.birthPlaceId !== undefined) result.birthPlaceId = person.birthPlaceId;
  if (person.deathPlaceId !== undefined) result.deathPlaceId = person.deathPlaceId;
  return result;
}

/** Build initial data for family event form from a Family object */
export function buildFamilyEventInitialData(family: Family) {
  const result: Record<string, unknown> = {
    isUmmWalad: family.isUmmWalad ?? false,
    marriageContractDate: family.marriageContract.date,
    marriageContractHijriDate: family.marriageContract.hijriDate,
    marriageContractPlace: family.marriageContract.place,
    marriageContractDescription: family.marriageContract.description,
    marriageContractNotes: family.marriageContract.notes,
    marriageDate: family.marriage.date,
    marriageHijriDate: family.marriage.hijriDate,
    marriagePlace: family.marriage.place,
    marriageDescription: family.marriage.description,
    marriageNotes: family.marriage.notes,
    isDivorced: family.isDivorced,
    divorceDate: family.divorce.date,
    divorceHijriDate: family.divorce.hijriDate,
    divorcePlace: family.divorce.place,
    divorceDescription: family.divorce.description,
    divorceNotes: family.divorce.notes,
  };
  if (family.marriageContract.placeId !== undefined) result.marriageContractPlaceId = family.marriageContract.placeId;
  if (family.marriage.placeId !== undefined) result.marriagePlaceId = family.marriage.placeId;
  if (family.divorce.placeId !== undefined) result.divorcePlaceId = family.divorce.placeId;
  return result;
}

/** Serialize IndividualFormData to API payload (empty strings → null) */
export function serializeIndividualForm(formData: {
  givenName: string; surname: string; sex: string;
  birthDate: string; birthPlace: string; birthPlaceId?: string | null; birthDescription: string; birthNotes: string; birthHijriDate: string;
  deathDate: string; deathPlace: string; deathPlaceId?: string | null; deathDescription: string; deathNotes: string; deathHijriDate: string;
  kunya?: string;
  isDeceased: boolean; isPrivate: boolean; notes: string;
}): Record<string, unknown> {
  return {
    givenName: formData.givenName || null,
    surname: formData.surname || null,
    sex: formData.sex || null,
    birthDate: formData.birthDate || null,
    birthPlace: formData.birthPlace || null,
    birthPlaceId: formData.birthPlaceId ?? null,
    birthDescription: formData.birthDescription || null,
    birthNotes: formData.birthNotes || null,
    birthHijriDate: formData.birthHijriDate || null,
    deathDate: formData.deathDate || null,
    deathPlace: formData.deathPlace || null,
    deathPlaceId: formData.deathPlaceId ?? null,
    deathDescription: formData.deathDescription || null,
    deathNotes: formData.deathNotes || null,
    deathHijriDate: formData.deathHijriDate || null,
    kunya: formData.kunya || null,
    isDeceased: formData.isDeceased,
    isPrivate: formData.isPrivate,
    notes: formData.notes || null,
  };
}

/** Build exclude set for link-existing-spouse picker: self + existing spouses + pointed */
export function getSpouseExcludeIds(person: Individual, data: GedcomData): Set<string> {
  const excluded = new Set<string>();

  // Self
  excluded.add(person.id);

  // Existing spouses from all families
  for (const famId of person.familiesAsSpouse) {
    const family = data.families[famId];
    if (!family) continue;
    const spouseId = family.husband === person.id ? family.wife : family.husband;
    if (spouseId) excluded.add(spouseId);
  }

  // Pointed individuals (read-only from branch pointers)
  for (const ind of Object.values(data.individuals)) {
    if (ind._pointed) excluded.add(ind.id);
  }

  return excluded;
}

/** Get sex filter for spouse picker: opposite sex, or undefined if unknown */
export function getSexFilterForSpouse(person: Individual): 'M' | 'F' | undefined {
  if (person.sex === 'M') return 'F';
  if (person.sex === 'F') return 'M';
  return undefined;
}

// ---------------------------------------------------------------------------
// Surname (family name) prefill for the create-person form
// ---------------------------------------------------------------------------

/**
 * Redacted-name placeholder. Mirrors `PRIVATE_PERSON_PLACEHOLDER` in
 * `src/lib/tree/mapper.ts` — declared locally on purpose: importing the mapper
 * into this client-side module pulls server-only crypto into the client bundle.
 */
const PRIVATE_NAME = 'خاص';

/**
 * The form modes that can seed a surname. Every `FormMode` member in
 * `src/hooks/usePersonActions.ts` is structurally assignable to this, so a
 * `formMode` value passes straight through with no cast.
 */
export type SurnamePrefillMode =
  | { kind: 'addChild'; targetFamilyId?: string }
  | { kind: 'addSibling'; targetFamilyId?: string }
  | { kind: 'addParent'; lockedSex?: 'M' | 'F' }
  | { kind: 'edit' | 'addSpouse' | 'linkExistingSpouse' | 'editFamilyEvent' | 'addRadaa' | 'editRadaa' };

/**
 * A surname is usable only from a real, non-private person whose surname is a
 * non-empty, non-placeholder string. Returns the trimmed value, else null.
 */
function usableSurname(person: Individual | undefined | null): string | null {
  if (!person) return null;
  if (person.isPrivate === true) return null;
  const surname = (person.surname ?? '').trim();
  if (!surname || surname === PRIVATE_NAME) return null;
  return surname;
}

/** Surname of the husband of the given family, when usable. */
function husbandSurname(data: GedcomData, familyId: string | undefined): string | null {
  if (!familyId) return null;
  const family = data.families[familyId];
  if (!family?.husband) return null;
  return usableSurname(data.individuals[family.husband]);
}

/**
 * Default value for the "اسم العائلة" field when creating a new person.
 *
 * Arabic patrilineal naming: the family name comes from the father, so a child
 * inherits the father's surname (for a female anchor, her husband's) and a
 * sibling inherits the shared father's. A wife keeps her own father's name, so
 * spouses get no prefill. Purely a default — the field stays editable.
 */
export function getSurnamePrefill(
  data: GedcomData | null | undefined,
  person: Individual | undefined,
  mode: SurnamePrefillMode | null,
): string | null {
  if (!data || !person || !mode) return null;

  switch (mode.kind) {
    case 'addChild': {
      if (person.sex !== 'F') return usableSurname(person);
      // Mirrors the target-family resolution in `usePersonActions`.
      const familyId = mode.targetFamilyId ?? getEditableSpouseFamilyIds(person, data)[0];
      return husbandSurname(data, familyId);
    }
    case 'addSibling':
      return husbandSurname(data, mode.targetFamilyId) ?? usableSurname(person);
    case 'addParent':
      return mode.lockedSex === 'F' ? null : usableSurname(person);
    default:
      return null;
  }
}

/** Get families for family picker with spouse names */
export function getFamiliesForPicker(
  person: Individual,
  data: GedcomData,
): Array<{ familyId: string; spouseName: string | null }> {
  return getEditableSpouseFamilyIds(person, data).map((familyId) => {
    const family = data.families[familyId];
    if (!family) return { familyId, spouseName: null };
    const spouseId = family.husband === person.id ? family.wife : family.husband;
    const spouse = spouseId ? data.individuals[spouseId] : null;
    return {
      familyId,
      spouseName: spouse ? getDisplayName(spouse) : null,
    };
  });
}
