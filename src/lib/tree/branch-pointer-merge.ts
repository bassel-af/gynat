import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';
import { extractSubtree, getAllDescendants } from '@/lib/gedcom/graph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PointerConfig {
  rootIndividualId: string;
  depthLimit: number | null; // null = unlimited
  includeGrafts: boolean;
}

export interface MergePointerConfig {
  pointerId: string;
  anchorIndividualId: string;
  selectedIndividualId: string; // the person from the branch being stitched
  relationship: 'child' | 'sibling' | 'spouse' | 'parent';
  sourceWorkspaceId: string;
  linkChildrenToAnchor?: boolean;
}

// ---------------------------------------------------------------------------
// detectOrphanedChildren
// ---------------------------------------------------------------------------

/**
 * Detect children of selectedPerson in the subtree who lack a parent of the
 * given anchorSex. Used to determine if linkChildrenToAnchor is applicable
 * for spouse stitching.
 *
 * Pure function — no DB access.
 */
export function detectOrphanedChildren(
  subtree: GedcomData,
  selectedPersonId: string,
  anchorSex: 'M' | 'F',
): { hasOrphans: boolean; childNames: string[] } {
  const childNames: string[] = [];
  const parentRole = anchorSex === 'M' ? 'husband' : 'wife';

  const selectedPerson = subtree.individuals[selectedPersonId];
  if (!selectedPerson) return { hasOrphans: false, childNames: [] };

  for (const familyId of selectedPerson.familiesAsSpouse) {
    const family = subtree.families[familyId];
    if (!family) continue;

    // Check if this family lacks a parent of anchorSex
    if (family[parentRole] !== null) continue;

    // Children in this family are orphaned w.r.t. anchorSex
    for (const childId of family.children) {
      const child = subtree.individuals[childId];
      if (child) {
        childNames.push(child.givenName || child.name || childId);
      }
    }
  }

  return { hasOrphans: childNames.length > 0, childNames };
}

// ---------------------------------------------------------------------------
// extractPointedSubtree
// ---------------------------------------------------------------------------

/**
 * Extracts a subtree from source data suitable for sharing via a branch pointer.
 *
 * 1. Calls extractSubtree() to get root + descendants + spouses
 * 2. If depthLimit is set, prunes individuals beyond that generation depth
 * 3. If includeGrafts is true, includes married-in spouses' origin families
 *    (parents + siblings) for spouses within the depth limit
 *
 * Returns a new GedcomData. Does not mutate the input.
 */
export function extractPointedSubtree(
  data: GedcomData,
  config: PointerConfig,
): GedcomData {
  const { rootIndividualId, depthLimit, includeGrafts } = config;

  // Handle nonexistent root
  if (!data.individuals[rootIndividualId]) {
    return { individuals: {}, families: {} };
  }

  // Step 1: Get the full subtree (root + all descendants + spouses)
  const fullSubtree = extractSubtree(data, rootIndividualId);

  // Step 2: If no depth limit and no grafts, return as-is
  if (depthLimit === null && !includeGrafts) {
    return fullSubtree;
  }

  // Step 3: Compute generation depth for each individual in the subtree
  // Root is at depth 0, children at depth 1, etc.
  const depthMap = computeDepthMap(fullSubtree, rootIndividualId);

  // Step 4: Apply depth limiting if needed
  let result: GedcomData;
  if (depthLimit !== null) {
    result = applyDepthLimit(fullSubtree, depthMap, depthLimit);
  } else {
    // Deep copy so we can safely modify for grafts
    result = {
      individuals: { ...fullSubtree.individuals },
      families: { ...fullSubtree.families },
    };
  }

  // Step 5: Include graft data if requested
  if (includeGrafts) {
    result = addGraftData(result, data, rootIndividualId, depthMap, depthLimit);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Depth map computation
// ---------------------------------------------------------------------------

/**
 * Compute the generation depth for each descendant of the root.
 * Root = 0, children = 1, grandchildren = 2, etc.
 * Spouses get the same depth as their partner who is a descendant.
 */
function computeDepthMap(
  data: GedcomData,
  rootId: string,
): Map<string, number> {
  const depthMap = new Map<string, number>();
  depthMap.set(rootId, 0);

  const { individuals, families } = data;

  // BFS from root through children
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const person = individuals[id];
    if (!person) continue;

    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      // Set spouse depth to same as this person
      const spouseId = family.husband === id ? family.wife : family.husband;
      if (spouseId && individuals[spouseId] && !depthMap.has(spouseId)) {
        depthMap.set(spouseId, depth);
      }

      // Children are one level deeper
      for (const childId of family.children) {
        if (!depthMap.has(childId) && individuals[childId]) {
          depthMap.set(childId, depth + 1);
          queue.push({ id: childId, depth: depth + 1 });
        }
      }
    }
  }

  return depthMap;
}

// ---------------------------------------------------------------------------
// Depth limiting
// ---------------------------------------------------------------------------

/**
 * Filter a subtree to only include individuals within the depth limit.
 * Spouses of included individuals are also included.
 * Cross-references are updated to be self-consistent.
 */
function applyDepthLimit(
  data: GedcomData,
  depthMap: Map<string, number>,
  depthLimit: number,
): GedcomData {
  const { individuals, families } = data;

  // Determine which individuals to keep
  const keepIds = new Set<string>();
  for (const [id, depth] of depthMap) {
    if (depth <= depthLimit && individuals[id]) {
      keepIds.add(id);
    }
  }

  // Filter families: keep if at least one of (husband, wife) is in keepIds
  // and at least one is a descendant (not just a spouse)
  const filteredFamilies: Record<string, Family> = {};
  const includedFamilyIds = new Set<string>();

  for (const [famId, family] of Object.entries(families)) {
    const husbandKept = family.husband !== null && keepIds.has(family.husband);
    const wifeKept = family.wife !== null && keepIds.has(family.wife);

    if (husbandKept || wifeKept) {
      includedFamilyIds.add(famId);
      filteredFamilies[famId] = {
        ...family,
        husband: husbandKept ? family.husband : null,
        wife: wifeKept ? family.wife : null,
        children: family.children.filter((childId) => keepIds.has(childId)),
      };
    }
  }

  // Filter individuals and update cross-references
  const filteredIndividuals: Record<string, Individual> = {};
  for (const id of keepIds) {
    const person = individuals[id];
    if (!person) continue;

    filteredIndividuals[id] = {
      ...person,
      familiesAsSpouse: person.familiesAsSpouse.filter((famId) => includedFamilyIds.has(famId)),
      familyAsChild: person.familyAsChild && includedFamilyIds.has(person.familyAsChild)
        ? person.familyAsChild
        : null,
    };
  }

  return { individuals: filteredIndividuals, families: filteredFamilies };
}

// ---------------------------------------------------------------------------
// Graft data inclusion
// ---------------------------------------------------------------------------

/**
 * Add in-law origin family data (parents + siblings) for married-in spouses
 * that are within the depth limit. Uses the full source data to look up
 * the origin families.
 */
function addGraftData(
  result: GedcomData,
  fullSourceData: GedcomData,
  rootId: string,
  depthMap: Map<string, number>,
  depthLimit: number | null,
): GedcomData {
  const resultIndividuals: Record<string, Individual> = { ...result.individuals };
  const resultFamilies: Record<string, Family> = { ...result.families };

  // Compute the core set (root + descendants) in the result
  const coreIds = new Set<string>([rootId]);
  const descendants = getAllDescendants(result, rootId);
  for (const id of descendants) {
    coreIds.add(id);
  }

  // For each spouse in the result that is NOT a core member (married-in)
  for (const [personId, person] of Object.entries(result.individuals)) {
    if (coreIds.has(personId)) continue; // Skip core members
    if (!person.familiesAsSpouse.length) continue;

    // Check if this person's partner is within the depth limit
    const personDepth = depthMap.get(personId);
    if (depthLimit !== null && personDepth !== undefined && personDepth > depthLimit) {
      continue;
    }

    // Look up this person's origin family in the full source data
    const fullPerson = fullSourceData.individuals[personId];
    if (!fullPerson?.familyAsChild) continue;

    const originFamilyId = fullPerson.familyAsChild;
    const originFamily = fullSourceData.families[originFamilyId];
    if (!originFamily) continue;

    // Already added?
    if (resultFamilies[originFamilyId]) continue;

    // Collect parents
    const parentIds: string[] = [];
    if (originFamily.husband && fullSourceData.individuals[originFamily.husband]) {
      parentIds.push(originFamily.husband);
    }
    if (originFamily.wife && fullSourceData.individuals[originFamily.wife]) {
      parentIds.push(originFamily.wife);
    }
    if (parentIds.length === 0) continue;

    // Collect siblings (excluding the spouse)
    const siblingIds = originFamily.children.filter(
      (childId) =>
        childId !== personId &&
        fullSourceData.individuals[childId] &&
        !fullSourceData.individuals[childId].isPrivate,
    );

    // Add parents
    for (const parentId of parentIds) {
      const parent = fullSourceData.individuals[parentId];
      if (parent && !resultIndividuals[parentId]) {
        resultIndividuals[parentId] = { ...parent, familiesAsSpouse: [...parent.familiesAsSpouse] };
      }
    }

    // Add siblings
    for (const sibId of siblingIds) {
      const sib = fullSourceData.individuals[sibId];
      if (sib && !resultIndividuals[sibId]) {
        resultIndividuals[sibId] = { ...sib, familiesAsSpouse: [...sib.familiesAsSpouse] };
      }
    }

    // Add origin family
    resultFamilies[originFamilyId] = { ...originFamily, children: [...originFamily.children] };

    // Update the married-in spouse's familyAsChild
    if (resultIndividuals[personId]) {
      resultIndividuals[personId] = {
        ...resultIndividuals[personId],
        familyAsChild: originFamilyId,
      };
    }
  }

  // Scope added entities to only reference things in the result
  const allResultFamilyIds = new Set(Object.keys(resultFamilies));
  const allResultIndividualIds = new Set(Object.keys(resultIndividuals));

  // Scope families
  for (const [famId, fam] of Object.entries(resultFamilies)) {
    if (result.families[famId]) continue; // Only scope newly added
    resultFamilies[famId] = {
      ...fam,
      husband: fam.husband && allResultIndividualIds.has(fam.husband) ? fam.husband : null,
      wife: fam.wife && allResultIndividualIds.has(fam.wife) ? fam.wife : null,
      children: fam.children.filter((childId) => allResultIndividualIds.has(childId)),
    };
  }

  // Scope individuals
  for (const [id, ind] of Object.entries(resultIndividuals)) {
    if (result.individuals[id]) continue; // Only scope newly added
    resultIndividuals[id] = {
      ...ind,
      familiesAsSpouse: ind.familiesAsSpouse.filter((famId) => allResultFamilyIds.has(famId)),
      familyAsChild: ind.familyAsChild && allResultFamilyIds.has(ind.familyAsChild)
        ? ind.familyAsChild
        : null,
    };
  }

  return { individuals: resultIndividuals, families: resultFamilies };
}

// ---------------------------------------------------------------------------
// mergePointedSubtree
// ---------------------------------------------------------------------------

const EMPTY_EVENT: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

/**
 * Merges a pointed subtree into a target tree's GedcomData.
 *
 * - All pointed individuals and families are marked with `_pointed: true`
 *   and `_sourceWorkspaceId`
 * - A synthetic family is created to stitch the pointed root to the anchor
 *   individual based on the relationship type
 * - The synthetic family has a deterministic ID: `ptr-{pointerId}-fam`
 *
 * Does not mutate target or pointed data — returns a new GedcomData.
 */
export function mergePointedSubtree(
  target: GedcomData,
  pointed: GedcomData,
  config: MergePointerConfig,
): GedcomData {
  const { pointerId, anchorIndividualId, selectedIndividualId, relationship, sourceWorkspaceId } = config;
  const syntheticFamId = `ptr-${pointerId}-fam`;

  // Deep copy target into result
  const individuals: Record<string, Individual> = {};
  for (const [id, ind] of Object.entries(target.individuals)) {
    individuals[id] = { ...ind, familiesAsSpouse: [...ind.familiesAsSpouse] };
  }
  const families: Record<string, Family> = {};
  for (const [id, fam] of Object.entries(target.families)) {
    families[id] = { ...fam, children: [...fam.children] };
  }

  // Add pointed individuals with _pointed flag
  for (const [id, ind] of Object.entries(pointed.individuals)) {
    individuals[id] = {
      ...ind,
      familiesAsSpouse: [...ind.familiesAsSpouse],
      _pointed: true,
      _sourceWorkspaceId: sourceWorkspaceId,
      _pointerId: pointerId,
    };
  }

  // Add pointed families with _pointed flag
  for (const [id, fam] of Object.entries(pointed.families)) {
    families[id] = {
      ...fam,
      children: [...fam.children],
      _pointed: true,
      _sourceWorkspaceId: sourceWorkspaceId,
      _pointerId: pointerId,
    };
  }

  // Use the selected individual as the stitching point (the person the admin picked)
  const pointedRootId = selectedIndividualId;
  if (!individuals[pointedRootId]) {
    return { individuals, families };
  }

  const anchor = individuals[anchorIndividualId];
  const pointedRoot = individuals[pointedRootId];
  if (!anchor || !pointedRoot) {
    return { individuals, families };
  }

  // Create synthetic stitching family based on relationship type
  switch (relationship) {
    case 'child':
      stitchAsChild(individuals, families, syntheticFamId, anchor, anchorIndividualId, pointedRoot, pointedRootId, sourceWorkspaceId, pointerId);
      break;
    case 'sibling':
      stitchAsSibling(individuals, families, syntheticFamId, anchor, anchorIndividualId, pointedRoot, pointedRootId, sourceWorkspaceId, pointerId);
      break;
    case 'spouse':
      stitchAsSpouse(individuals, families, syntheticFamId, anchor, anchorIndividualId, pointedRoot, pointedRootId, sourceWorkspaceId, pointerId, config.linkChildrenToAnchor ?? false);
      break;
    case 'parent':
      stitchAsParent(individuals, families, syntheticFamId, anchor, anchorIndividualId, pointedRoot, pointedRootId, sourceWorkspaceId, pointerId);
      break;
  }

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Stitching helpers
// ---------------------------------------------------------------------------

function findPointedRoot(pointed: GedcomData): string | null {
  // The root is an individual with no familyAsChild (within the pointed set)
  for (const [id, ind] of Object.entries(pointed.individuals)) {
    if (!ind.familyAsChild || !pointed.families[ind.familyAsChild]) {
      return id;
    }
  }
  // Fallback: first individual
  const ids = Object.keys(pointed.individuals);
  return ids.length > 0 ? ids[0] : null;
}

function makeSyntheticFamily(
  id: string,
  sourceWorkspaceId: string,
  pointerId: string,
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
    _pointed: true,
    _sourceWorkspaceId: sourceWorkspaceId,
    _pointerId: pointerId,
    ...overrides,
  };
}

/** child: anchor is parent, pointed root is child */
function stitchAsChild(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  syntheticFamId: string,
  anchor: Individual,
  anchorId: string,
  _pointedRoot: Individual,
  pointedRootId: string,
  sourceWorkspaceId: string,
  pointerId: string,
): void {
  const parentRole = anchor.sex === 'F' ? 'wife' : 'husband';
  families[syntheticFamId] = makeSyntheticFamily(syntheticFamId, sourceWorkspaceId, pointerId, {
    [parentRole]: anchorId,
    children: [pointedRootId],
  });

  individuals[anchorId] = {
    ...individuals[anchorId],
    familiesAsSpouse: [...individuals[anchorId].familiesAsSpouse, syntheticFamId],
  };
  individuals[pointedRootId] = {
    ...individuals[pointedRootId],
    familyAsChild: syntheticFamId,
  };
}

/** sibling: add pointed root to anchor's familyAsChild, or create synthetic parent family */
function stitchAsSibling(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  syntheticFamId: string,
  anchor: Individual,
  anchorId: string,
  _pointedRoot: Individual,
  pointedRootId: string,
  sourceWorkspaceId: string,
  pointerId: string,
): void {
  if (anchor.familyAsChild && families[anchor.familyAsChild]) {
    // Add pointed root as another child in the same family
    const familyId = anchor.familyAsChild;
    families[familyId] = {
      ...families[familyId],
      children: [...families[familyId].children, pointedRootId],
    };
    individuals[pointedRootId] = {
      ...individuals[pointedRootId],
      familyAsChild: familyId,
    };
  } else {
    // No parent family — create a synthetic one with both as children
    families[syntheticFamId] = makeSyntheticFamily(syntheticFamId, sourceWorkspaceId, pointerId, {
      children: [anchorId, pointedRootId],
    });
    individuals[anchorId] = {
      ...individuals[anchorId],
      familyAsChild: syntheticFamId,
    };
    individuals[pointedRootId] = {
      ...individuals[pointedRootId],
      familyAsChild: syntheticFamId,
    };
  }
}

/** spouse: create synthetic family with both as spouses */
function stitchAsSpouse(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  syntheticFamId: string,
  anchor: Individual,
  anchorId: string,
  pointedRoot: Individual,
  pointedRootId: string,
  sourceWorkspaceId: string,
  pointerId: string,
  linkChildrenToAnchor: boolean = false,
): void {
  // Determine husband/wife based on sex
  let husband: string | null = null;
  let wife: string | null = null;

  if (anchor.sex === 'M') {
    husband = anchorId;
    wife = pointedRootId;
  } else if (anchor.sex === 'F') {
    wife = anchorId;
    husband = pointedRootId;
  } else if (pointedRoot.sex === 'M') {
    husband = pointedRootId;
    wife = anchorId;
  } else {
    // Default: anchor as husband
    husband = anchorId;
    wife = pointedRootId;
  }

  // Collect orphaned children if linkChildrenToAnchor is true
  const orphanedChildIds: string[] = [];
  if (linkChildrenToAnchor && anchor.sex) {
    const parentRole = anchor.sex === 'M' ? 'husband' : 'wife';
    // Find families where pointedRoot is a spouse and children lack a parent of anchor's sex
    for (const familyId of (individuals[pointedRootId]?.familiesAsSpouse ?? [])) {
      const family = families[familyId];
      if (!family) continue;
      if (family[parentRole] !== null) continue;
      for (const childId of family.children) {
        if (individuals[childId]) {
          orphanedChildIds.push(childId);
        }
      }
    }
  }

  families[syntheticFamId] = makeSyntheticFamily(syntheticFamId, sourceWorkspaceId, pointerId, {
    husband,
    wife,
    children: orphanedChildIds,
  });

  individuals[anchorId] = {
    ...individuals[anchorId],
    familiesAsSpouse: [...individuals[anchorId].familiesAsSpouse, syntheticFamId],
  };
  individuals[pointedRootId] = {
    ...individuals[pointedRootId],
    familiesAsSpouse: [...individuals[pointedRootId].familiesAsSpouse, syntheticFamId],
  };
}

/** parent: pointed root is parent, anchor is child */
function stitchAsParent(
  individuals: Record<string, Individual>,
  families: Record<string, Family>,
  syntheticFamId: string,
  _anchor: Individual,
  anchorId: string,
  pointedRoot: Individual,
  pointedRootId: string,
  sourceWorkspaceId: string,
  pointerId: string,
): void {
  const parentRole = pointedRoot.sex === 'F' ? 'wife' : 'husband';
  families[syntheticFamId] = makeSyntheticFamily(syntheticFamId, sourceWorkspaceId, pointerId, {
    [parentRole]: pointedRootId,
    children: [anchorId],
  });

  individuals[pointedRootId] = {
    ...individuals[pointedRootId],
    familiesAsSpouse: [...individuals[pointedRootId].familiesAsSpouse, syntheticFamId],
  };
  individuals[anchorId] = {
    ...individuals[anchorId],
    familyAsChild: syntheticFamId,
  };
}
