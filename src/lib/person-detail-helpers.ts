import type { Individual, Family, GedcomData } from '@/lib/gedcom/types';
import { getDisplayName } from '@/lib/gedcom';

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

/** Determine if family picker is needed for add-child action */
export function needsFamilyPickerForAddChild(person: Individual): boolean {
  return person.familiesAsSpouse.length > 1;
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

/** Check if person can be moved to another family */
export function canMoveChild(person: Individual, data: GedcomData): boolean {
  if (!person.familyAsChild) return false;
  const family = data.families[person.familyAsChild];
  if (!family) return false;

  const parentIds = [family.husband, family.wife].filter(Boolean) as string[];
  for (const parentId of parentIds) {
    const parent = data.individuals[parentId];
    if (parent && parent.familiesAsSpouse.length > 1) {
      return true;
    }
  }
  return false;
}

/** Get alternative families for move-child action */
export function getAlternativeFamilies(
  person: Individual,
  data: GedcomData,
): Array<{ familyId: string; spouseName: string | null }> {
  if (!person.familyAsChild) return [];
  const currentFamily = data.families[person.familyAsChild];
  if (!currentFamily) return [];

  const parentIds = [currentFamily.husband, currentFamily.wife].filter(Boolean) as string[];
  const alternativeFamilies: Array<{ familyId: string; spouseName: string | null }> = [];
  const seen = new Set<string>();

  for (const parentId of parentIds) {
    const parent = data.individuals[parentId];
    if (!parent) continue;
    for (const famId of parent.familiesAsSpouse) {
      if (famId === person.familyAsChild) continue;
      if (seen.has(famId)) continue;
      seen.add(famId);
      const fam = data.families[famId];
      if (!fam) continue;
      const spouseId = fam.husband === parentId ? fam.wife : fam.husband;
      const spouse = spouseId ? data.individuals[spouseId] : null;
      alternativeFamilies.push({
        familyId: famId,
        spouseName: spouse ? getDisplayName(spouse) : null,
      });
    }
  }
  return alternativeFamilies;
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
    isDeceased: formData.isDeceased,
    isPrivate: formData.isPrivate,
    notes: formData.notes || null,
  };
}

/** Get families for family picker with spouse names */
export function getFamiliesForPicker(
  person: Individual,
  data: GedcomData,
): Array<{ familyId: string; spouseName: string | null }> {
  return person.familiesAsSpouse.map((familyId) => {
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
