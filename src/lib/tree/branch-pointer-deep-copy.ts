import crypto from 'crypto';
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeepCopyConfig {
  anchorIndividualId: string;
  relationship: 'child' | 'sibling' | 'spouse' | 'parent';
  pointerId: string;
}

export interface DeepCopyResult {
  /** Copied individuals keyed by new UUID */
  individuals: Record<string, Individual>;
  /** Copied families keyed by new UUID */
  families: Record<string, Family>;
  /** Map from old IDs to new UUIDs */
  idMap: Map<string, string>;
  /** Synthetic family to stitch the copied root to the anchor */
  stitchFamily: Family | null;
}

// ---------------------------------------------------------------------------
// prepareDeepCopy
// ---------------------------------------------------------------------------

const EMPTY_EVENT: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

/**
 * Prepares a deep copy of a pointed subtree for independent storage in the
 * target workspace.
 *
 * - Generates new UUIDs for all individuals and families
 * - Rewrites all cross-references (familyAsChild, familiesAsSpouse, husband, wife, children)
 * - Removes placeId fields (string place names preserved)
 * - Removes _pointed and _sourceWorkspaceId flags
 * - Creates a stitch family to connect the copied root to the anchor
 *
 * Pure function — does not mutate input.
 */
export function prepareDeepCopy(
  pointed: GedcomData,
  config: DeepCopyConfig,
): DeepCopyResult {
  const { anchorIndividualId, relationship, pointerId } = config;

  // Step 1: Generate new UUIDs for all entities
  const idMap = new Map<string, string>();
  for (const id of Object.keys(pointed.individuals)) {
    idMap.set(id, crypto.randomUUID());
  }
  for (const id of Object.keys(pointed.families)) {
    idMap.set(id, crypto.randomUUID());
  }

  // Step 2: Copy individuals with new IDs and rewritten cross-references
  const individuals: Record<string, Individual> = {};
  for (const [oldId, ind] of Object.entries(pointed.individuals)) {
    const newId = idMap.get(oldId)!;
    const copied: Individual = {
      ...ind,
      id: newId,
      familiesAsSpouse: ind.familiesAsSpouse
        .map((famId) => idMap.get(famId))
        .filter((id): id is string => id !== undefined),
      familyAsChild: ind.familyAsChild
        ? (idMap.get(ind.familyAsChild) ?? null)
        : null,
    };

    // Remove placeId fields (cross-workspace references are invalid)
    delete copied.birthPlaceId;
    delete copied.deathPlaceId;

    // Remove _pointed flags
    delete copied._pointed;
    delete copied._sourceWorkspaceId;

    individuals[newId] = copied;
  }

  // Step 3: Copy families with new IDs and rewritten cross-references
  const families: Record<string, Family> = {};
  for (const [oldId, fam] of Object.entries(pointed.families)) {
    const newId = idMap.get(oldId)!;
    const copied: Family = {
      ...fam,
      id: newId,
      husband: fam.husband ? (idMap.get(fam.husband) ?? null) : null,
      wife: fam.wife ? (idMap.get(fam.wife) ?? null) : null,
      children: fam.children
        .map((childId) => idMap.get(childId))
        .filter((id): id is string => id !== undefined),
    };

    // Remove _pointed flags
    delete copied._pointed;
    delete copied._sourceWorkspaceId;

    families[newId] = copied;
  }

  // Step 4: Find the root of the pointed subtree
  const pointedRootOldId = findPointedRoot(pointed);
  const pointedRootNewId = pointedRootOldId ? idMap.get(pointedRootOldId) : undefined;

  // Step 5: Create stitch family
  let stitchFamily: Family | null = null;
  if (pointedRootNewId) {
    const rootInd = pointed.individuals[pointedRootOldId!];
    const stitchFamId = crypto.randomUUID();

    switch (relationship) {
      case 'child': {
        stitchFamily = makeStitchFamily(stitchFamId, {
          husband: anchorIndividualId, // simplified — anchor's sex determines role
          children: [pointedRootNewId],
        });
        break;
      }
      case 'sibling': {
        stitchFamily = makeStitchFamily(stitchFamId, {
          children: [anchorIndividualId, pointedRootNewId],
        });
        break;
      }
      case 'spouse': {
        const anchorRole = rootInd?.sex === 'F' ? 'husband' : 'wife';
        const rootRole = rootInd?.sex === 'F' ? 'wife' : 'husband';
        stitchFamily = makeStitchFamily(stitchFamId, {
          [anchorRole]: anchorIndividualId,
          [rootRole]: pointedRootNewId,
        });
        break;
      }
      case 'parent': {
        const parentRole = rootInd?.sex === 'F' ? 'wife' : 'husband';
        stitchFamily = makeStitchFamily(stitchFamId, {
          [parentRole]: pointedRootNewId,
          children: [anchorIndividualId],
        });
        break;
      }
    }
  }

  return { individuals, families, idMap, stitchFamily };
}

// ---------------------------------------------------------------------------
// persistDeepCopy
// ---------------------------------------------------------------------------

/**
 * Persists a prepared deep-copy result into the database within a transaction.
 * Creates individuals, families, familyChild records, and optional stitch family.
 */
export async function persistDeepCopy(
  tx: any, // Prisma transaction client
  targetTreeId: string,
  copyResult: DeepCopyResult,
): Promise<void> {
  // Create copied individuals
  const individualData = Object.values(copyResult.individuals).map((ind) => ({
    id: ind.id,
    treeId: targetTreeId,
    givenName: ind.givenName || null,
    surname: ind.surname || null,
    fullName: ind.name || null,
    sex: ind.sex,
    birthDate: ind.birth || null,
    birthPlace: ind.birthPlace || null,
    birthDescription: ind.birthDescription || null,
    birthNotes: ind.birthNotes || null,
    birthHijriDate: ind.birthHijriDate || null,
    deathDate: ind.death || null,
    deathPlace: ind.deathPlace || null,
    deathDescription: ind.deathDescription || null,
    deathNotes: ind.deathNotes || null,
    deathHijriDate: ind.deathHijriDate || null,
    notes: ind.notes || null,
    isDeceased: ind.isDeceased,
    isPrivate: ind.isPrivate,
  }));

  if (individualData.length > 0) {
    await tx.individual.createMany({ data: individualData });
  }

  // Create copied families
  const familyData = Object.values(copyResult.families).map((fam) => ({
    id: fam.id,
    treeId: targetTreeId,
    husbandId: fam.husband || null,
    wifeId: fam.wife || null,
    marriageContractDate: fam.marriageContract?.date || null,
    marriageContractHijriDate: fam.marriageContract?.hijriDate || null,
    marriageContractPlace: fam.marriageContract?.place || null,
    marriageContractDescription: fam.marriageContract?.description || null,
    marriageContractNotes: fam.marriageContract?.notes || null,
    marriageDate: fam.marriage?.date || null,
    marriageHijriDate: fam.marriage?.hijriDate || null,
    marriagePlace: fam.marriage?.place || null,
    marriageDescription: fam.marriage?.description || null,
    marriageNotes: fam.marriage?.notes || null,
    divorceDate: fam.divorce?.date || null,
    divorceHijriDate: fam.divorce?.hijriDate || null,
    divorcePlace: fam.divorce?.place || null,
    divorceDescription: fam.divorce?.description || null,
    divorceNotes: fam.divorce?.notes || null,
    isDivorced: fam.isDivorced,
    isUmmWalad: fam.isUmmWalad ?? false,
  }));

  if (familyData.length > 0) {
    await tx.family.createMany({ data: familyData });
  }

  // Create stitch family (connects copied root to anchor)
  if (copyResult.stitchFamily) {
    const sf = copyResult.stitchFamily;
    await tx.family.create({
      data: {
        id: sf.id,
        treeId: targetTreeId,
        husbandId: sf.husband || null,
        wifeId: sf.wife || null,
      },
    });

    for (const childId of sf.children) {
      await tx.familyChild.create({
        data: { familyId: sf.id, individualId: childId },
      });
    }
  }

  // Create family_children records for copied families
  for (const fam of Object.values(copyResult.families)) {
    for (const childId of fam.children) {
      await tx.familyChild.create({
        data: { familyId: fam.id, individualId: childId },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPointedRoot(pointed: GedcomData): string | null {
  for (const [id, ind] of Object.entries(pointed.individuals)) {
    if (!ind.familyAsChild || !pointed.families[ind.familyAsChild]) {
      return id;
    }
  }
  const ids = Object.keys(pointed.individuals);
  return ids.length > 0 ? ids[0] : null;
}

function makeStitchFamily(
  id: string,
  overrides: Partial<Family>,
): Family {
  return {
    id,
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    isUmmWalad: false,
    ...overrides,
  };
}
