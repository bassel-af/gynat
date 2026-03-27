import type { Individual, Family, GedcomData } from './types';
import { stripArabicDiacritics } from '../utils/search';

/**
 * Get all ancestors of a person (parents, grandparents, etc.)
 * Returns a Set of individual IDs (does not include the person themselves)
 */
export function getAllAncestors(data: GedcomData, personId: string): Set<string> {
  const ancestors = new Set<string>();
  const { individuals, families } = data;

  function traverse(currentId: string) {
    const person = individuals[currentId];
    if (!person) return;

    // Get the family where this person is a child
    const familyId = person.familyAsChild;
    if (!familyId) return;

    const family = families[familyId];
    if (!family) return;

    // Add both parents and recursively traverse
    const parentIds = [family.husband, family.wife].filter(Boolean) as string[];
    for (const parentId of parentIds) {
      if (!ancestors.has(parentId) && individuals[parentId]) {
        ancestors.add(parentId);
        traverse(parentId);
      }
    }
  }

  traverse(personId);
  return ancestors;
}

/**
 * Get all descendants of a person (children, grandchildren, etc.)
 * Returns a Set of individual IDs
 */
export function getAllDescendants(data: GedcomData, rootId: string): Set<string> {
  const descendants = new Set<string>();
  const { individuals, families } = data;

  function traverse(personId: string) {
    const person = individuals[personId];
    if (!person) return;

    // Get all families where this person is a spouse
    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      for (const childId of family.children) {
        if (!descendants.has(childId)) {
          descendants.add(childId);
          traverse(childId);
        }
      }
    }
  }

  traverse(rootId);
  return descendants;
}

/**
 * Get all individuals visible in the tree: root + descendants + their spouses
 * This matches what FamilyTree.tsx displays in the canvas
 * @param excludePrivate - If true, filters out private individuals from the result
 */
export function getTreeVisibleIndividuals(
  data: GedcomData,
  rootId: string,
  excludePrivate = false
): Set<string> {
  const visible = new Set<string>();
  const { individuals, families } = data;

  const root = individuals[rootId];
  // If root is private and we're excluding private, return empty set
  if (excludePrivate && root?.isPrivate) {
    return visible;
  }

  // Add root
  visible.add(rootId);

  // Get all descendants
  const descendants = getAllDescendants(data, rootId);
  for (const id of descendants) {
    visible.add(id);
  }

  // Add spouses of the root and all descendants
  for (const personId of visible) {
    const person = individuals[personId];
    if (!person) continue;

    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      // Add spouse (husband or wife, whichever is not the current person)
      const spouseId = family.husband === personId ? family.wife : family.husband;
      if (spouseId && individuals[spouseId]) {
        visible.add(spouseId);
      }
    }
  }

  // Filter out private individuals if requested
  if (excludePrivate) {
    return filterOutPrivate(visible, individuals);
  }

  return visible;
}

/**
 * Filter out private individuals from a set of IDs
 * This is the core privacy filtering logic used throughout the app
 */
export function filterOutPrivate(
  ids: Set<string>,
  individuals: Record<string, Individual>
): Set<string> {
  const filtered = new Set<string>();
  for (const id of ids) {
    const person = individuals[id];
    if (person && !person.isPrivate) {
      filtered.add(id);
    }
  }
  return filtered;
}

/**
 * Check if an individual should be displayed (not private)
 */
export function isDisplayable(person: Individual | undefined | null): boolean {
  return person != null && !person.isPrivate;
}

/**
 * Build adjacency list: personId -> [childIds]
 */
export function buildChildrenGraph(data: GedcomData): Map<string, string[]> {
  const { individuals, families } = data;
  const childrenOf = new Map<string, string[]>();

  // Initialize empty arrays for all individuals
  for (const id in individuals) {
    childrenOf.set(id, []);
  }

  // For each family, add children to both parents
  for (const famId in families) {
    const family = families[famId];
    const parents: string[] = [];
    if (family.husband) parents.push(family.husband);
    if (family.wife) parents.push(family.wife);

    for (const parentId of parents) {
      const children = childrenOf.get(parentId) || [];
      for (const childId of family.children) {
        if (!children.includes(childId)) {
          children.push(childId);
        }
      }
      childrenOf.set(parentId, children);
    }
  }

  return childrenOf;
}

/**
 * Calculate descendant count for each person using Kahn's algorithm (topological sort)
 * Process leaves first, propagate counts up to roots - O(V + E)
 */
export function calculateDescendantCounts(
  individuals: Record<string, Individual>,
  childrenOf: Map<string, string[]>
): Map<string, number> {
  const descendantCount = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const parentsOf = new Map<string, string[]>(); // reverse edges

  // Initialize
  for (const id in individuals) {
    const children = childrenOf.get(id) || [];
    outDegree.set(id, children.length);
    descendantCount.set(id, 0);

    // Build reverse edges (child -> parents)
    for (const childId of children) {
      const parents = parentsOf.get(childId) || [];
      parents.push(id);
      parentsOf.set(childId, parents);
    }
  }

  // Start with leaves (people with no children)
  const queue: string[] = [];
  for (const id in individuals) {
    if (outDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  // Process in topological order (leaves to roots)
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const nodeDescendants = descendantCount.get(nodeId) || 0;

    // Update all parents of this node
    const parents = parentsOf.get(nodeId) || [];
    for (const parentId of parents) {
      // Parent gains: 1 (this child) + all descendants of this child
      const currentCount = descendantCount.get(parentId) || 0;
      descendantCount.set(parentId, currentCount + 1 + nodeDescendants);

      // Decrement out-degree (one less child to process)
      const newOutDegree = (outDegree.get(parentId) || 1) - 1;
      outDegree.set(parentId, newOutDegree);

      // If all children processed, parent is ready
      if (newOutDegree === 0) {
        queue.push(parentId);
      }
    }
  }

  return descendantCount;
}

/**
 * Extract a subtree rooted at the given individual.
 *
 * Returns a new GedcomData containing only:
 * - The root individual + all descendants + all their spouses
 * - Families where at least one of (husband, wife) is a root-or-descendant
 *
 * Individuals and families are deep-copied; the original data is not mutated.
 * Cross-references (familiesAsSpouse, familyAsChild, children, husband, wife)
 * are filtered to only reference entities in the extracted set.
 */
export function extractSubtree(data: GedcomData, rootId: string): GedcomData {
  const { individuals, families } = data;

  // Handle nonexistent root
  if (!individuals[rootId]) {
    return { individuals: {}, families: {} };
  }

  // 1. Collect root + all descendants (the "core" set)
  const coreIds = new Set<string>([rootId]);
  const descendants = getAllDescendants(data, rootId);
  for (const id of descendants) {
    coreIds.add(id);
  }

  // 2. Collect spouses of core members (but NOT spouses of spouses)
  const allIds = new Set<string>(coreIds);
  for (const personId of coreIds) {
    const person = individuals[personId];
    if (!person) continue;

    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      const spouseId = family.husband === personId ? family.wife : family.husband;
      if (spouseId && individuals[spouseId]) {
        allIds.add(spouseId);
      }
    }
  }

  // 3. Filter families: include only if at least one of (husband, wife)
  //    is in the core set (root or descendant). This prevents pulling in
  //    families that only involve a married-in spouse's other relationships.
  const includedFamilyIds = new Set<string>();
  const filteredFamilies: Record<string, Family> = {};

  for (const [famId, family] of Object.entries(families)) {
    const husbandInCore = family.husband !== null && coreIds.has(family.husband);
    const wifeInCore = family.wife !== null && coreIds.has(family.wife);

    if (husbandInCore || wifeInCore) {
      const husbandInAll = family.husband !== null && allIds.has(family.husband);
      const wifeInAll = family.wife !== null && allIds.has(family.wife);

      includedFamilyIds.add(famId);
      filteredFamilies[famId] = {
        ...family,
        husband: husbandInAll ? family.husband : null,
        wife: wifeInAll ? family.wife : null,
        children: family.children.filter((childId) => allIds.has(childId)),
      };
    }
  }

  // 4. Filter individuals and update their cross-references
  const filteredIndividuals: Record<string, Individual> = {};

  for (const id of allIds) {
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

/**
 * Find the topmost ancestor of a person by walking up `familyAsChild` chains.
 * Returns the ID of the individual with no parents, or `null` if the person
 * already has no parents (is already a root) or does not exist.
 *
 * Uses a visited set and max depth of 100 to guard against circular references.
 */
export function findTopmostAncestor(data: GedcomData, personId: string): string | null {
  const { individuals, families } = data;
  const person = individuals[personId];
  if (!person) return null;

  // If person has no familyAsChild, they are already a root
  if (!person.familyAsChild) return null;

  const visited = new Set<string>();
  let currentId = personId;
  const MAX_DEPTH = 100;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const current = individuals[currentId];
    if (!current) break;

    visited.add(currentId);

    const familyId = current.familyAsChild;
    if (!familyId) {
      // Reached a person with no parents — this is the topmost ancestor
      return currentId === personId ? null : currentId;
    }

    const family = families[familyId];
    if (!family) {
      // Family reference is dangling — treat current as topmost
      return currentId === personId ? null : currentId;
    }

    // Pick a parent (prefer husband, fall back to wife)
    const parentId = family.husband ?? family.wife;
    if (!parentId || !individuals[parentId]) {
      // Family has no parent records — treat current as topmost
      return currentId === personId ? null : currentId;
    }

    if (visited.has(parentId)) {
      // Circular reference — return whatever we have
      return currentId === personId ? null : currentId;
    }

    currentId = parentId;
  }

  // Max depth reached — return whatever we have
  return currentId === personId ? null : currentId;
}

/**
 * Check whether a person has an "external family" — i.e., they are NOT
 * a descendant of the current root AND they have at least one parent
 * in the database (via `familyAsChild` -> family -> husband/wife exists).
 *
 * Used to determine if a married-in spouse's family tree badge should be shown.
 */
export function hasExternalFamily(
  data: GedcomData,
  personId: string,
  rootDescendants: Set<string>
): boolean {
  const { individuals, families } = data;
  const person = individuals[personId];
  if (!person) return false;

  // If the person IS a descendant (or the root), they are not "external"
  if (rootDescendants.has(personId)) return false;

  // Check if person has at least one parent in the database
  const familyId = person.familyAsChild;
  if (!familyId) return false;

  const family = families[familyId];
  if (!family) return false;

  // Check if at least one parent exists in the data
  const hasParent =
    (family.husband !== null && individuals[family.husband] !== undefined) ||
    (family.wife !== null && individuals[family.wife] !== undefined);

  return hasParent;
}

// ---------------------------------------------------------------------------
// Graft descriptor computation (inline spouse family expansion)
// ---------------------------------------------------------------------------

/** Maximum number of sibling IDs included in a graft descriptor */
export const MAX_GRAFT_SIBLINGS = 4;

/**
 * Describes the in-law family of a married-in spouse that should be grafted
 * inline next to the hub person's node in the tree.
 */
export interface GraftDescriptor {
  /** The married-in spouse whose family is being grafted */
  spouseId: string;
  /** The hub person (descendant of the root) who is married to the spouse */
  hubPersonId: string;
  /** IDs of the spouse's parents */
  parentIds: string[];
  /** IDs of the spouse's siblings (capped at MAX_GRAFT_SIBLINGS) */
  siblingIds: string[];
  /** Total number of siblings (may exceed siblingIds.length when capped) */
  totalSiblingCount: number;
  /** Sex of the spouse ('M' or 'F') for label text */
  spouseSex: string;
}

/**
 * For each person in the tree (descendants of rootId + root itself), check
 * each of their spouses. If a spouse is NOT a descendant of the root AND
 * has parents in the DB, create a GraftDescriptor.
 *
 * @returns Map keyed by hub person ID -> list of GraftDescriptors
 */
export function computeGraftDescriptors(
  data: GedcomData,
  rootId: string
): Map<string, GraftDescriptor[]> {
  const { individuals, families } = data;
  const result = new Map<string, GraftDescriptor[]>();

  // Compute all descendants of the root
  const rootDescendants = getAllDescendants(data, rootId);
  rootDescendants.add(rootId);

  // For each person in the tree (root + descendants)
  for (const personId of rootDescendants) {
    const person = individuals[personId];
    if (!person || person.isPrivate) continue;

    // Check each spouse
    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      const spouseId = family.husband === personId ? family.wife : family.husband;
      if (!spouseId) continue;

      const spouse = individuals[spouseId];
      if (!spouse || spouse.isPrivate) continue;

      // Spouse must NOT be a descendant of root (married-in)
      if (rootDescendants.has(spouseId)) continue;

      // Spouse must have a familyAsChild with at least one parent
      const spouseFamilyId = spouse.familyAsChild;
      if (!spouseFamilyId) continue;

      const spouseFamily = families[spouseFamilyId];
      if (!spouseFamily) continue;

      // Collect parent IDs
      const parentIds: string[] = [];
      if (spouseFamily.husband && individuals[spouseFamily.husband]) {
        parentIds.push(spouseFamily.husband);
      }
      if (spouseFamily.wife && individuals[spouseFamily.wife]) {
        parentIds.push(spouseFamily.wife);
      }

      // Must have at least one parent
      if (parentIds.length === 0) continue;

      // Collect sibling IDs (other children of the same family, excluding the spouse)
      const allSiblingIds = spouseFamily.children
        .filter((childId) => childId !== spouseId && individuals[childId] && !individuals[childId].isPrivate);
      const totalSiblingCount = allSiblingIds.length;
      const siblingIds = allSiblingIds.slice(0, MAX_GRAFT_SIBLINGS);

      const descriptor: GraftDescriptor = {
        spouseId,
        hubPersonId: personId,
        parentIds,
        siblingIds,
        totalSiblingCount,
        spouseSex: spouse.sex || '',
      };

      const existing = result.get(personId);
      if (existing) {
        existing.push(descriptor);
      } else {
        result.set(personId, [descriptor]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Expand graft families (seed-time in-law expansion)
// ---------------------------------------------------------------------------

/**
 * Expand a subtree to include parents and siblings of married-in spouses
 * who share the same surname as the root ancestor.
 *
 * Used at seed time to pre-populate in-law family data so it is available
 * in the database without requiring a second pass.
 *
 * Does NOT mutate the input `subtree` or `fullData` — returns a new object.
 * Only expands one level (no cascading).
 */
export function expandGraftFamilies(
  subtree: GedcomData,
  fullData: GedcomData,
  rootId: string
): GedcomData {
  // 1. Get root's surname from fullData
  const root = fullData.individuals[rootId];
  if (!root) return { individuals: { ...subtree.individuals }, families: { ...subtree.families } };

  const rootSurname = root.surname?.trim();
  if (!rootSurname) {
    // Return a shallow copy so we don't return the same reference
    return {
      individuals: { ...subtree.individuals },
      families: { ...subtree.families },
    };
  }
  const normalizedRootSurname = stripArabicDiacritics(rootSurname);

  // 2. Identify core IDs: rootId + all descendants in subtree
  const coreIds = new Set<string>([rootId]);
  const descendants = getAllDescendants(subtree, rootId);
  for (const id of descendants) {
    coreIds.add(id);
  }

  // Deep copy subtree entities into result
  const resultIndividuals: Record<string, Individual> = {};
  for (const [id, ind] of Object.entries(subtree.individuals)) {
    resultIndividuals[id] = { ...ind, familiesAsSpouse: [...ind.familiesAsSpouse] };
  }
  const resultFamilies: Record<string, Family> = {};
  for (const [id, fam] of Object.entries(subtree.families)) {
    resultFamilies[id] = { ...fam, children: [...fam.children] };
  }

  // Track which families and individuals we add for cross-reference scoping
  const addedFamilyIds = new Set<string>();

  // 3. For each core person, find married-in spouses
  for (const personId of coreIds) {
    const person = subtree.individuals[personId];
    if (!person) continue;

    for (const familyId of person.familiesAsSpouse) {
      const family = subtree.families[familyId];
      if (!family) continue;

      const spouseId = family.husband === personId ? family.wife : family.husband;
      if (!spouseId) continue;
      // Spouse must NOT be in coreIds (married-in)
      if (coreIds.has(spouseId)) continue;

      // 4. Check surname match using fullData
      const spouseFull = fullData.individuals[spouseId];
      if (!spouseFull) continue;

      const spouseSurname = spouseFull.surname?.trim();
      if (!spouseSurname) continue;
      if (stripArabicDiacritics(spouseSurname) !== normalizedRootSurname) continue;

      // 5. Look up spouse's familyAsChild in fullData
      const originFamilyId = spouseFull.familyAsChild;
      if (!originFamilyId) continue;

      const originFamily = fullData.families[originFamilyId];
      if (!originFamily) continue;

      // 6. Collect parents
      const parentIds: string[] = [];
      if (originFamily.husband && fullData.individuals[originFamily.husband]) {
        parentIds.push(originFamily.husband);
      }
      if (originFamily.wife && fullData.individuals[originFamily.wife]) {
        parentIds.push(originFamily.wife);
      }
      if (parentIds.length === 0) continue;

      // 7. Collect siblings (excluding the spouse, excluding private)
      const allSiblingIds = originFamily.children.filter(
        (childId) =>
          childId !== spouseId &&
          fullData.individuals[childId] &&
          !fullData.individuals[childId].isPrivate
      );
      const siblingIds = allSiblingIds.slice(0, MAX_GRAFT_SIBLINGS);

      // 8. Add the origin family, parents, and siblings to result
      addedFamilyIds.add(originFamilyId);

      // Add parents
      for (const parentId of parentIds) {
        const parentFull = fullData.individuals[parentId];
        if (parentFull) {
          resultIndividuals[parentId] = {
            ...parentFull,
            familiesAsSpouse: [...parentFull.familiesAsSpouse],
          };
        }
      }

      // Add siblings
      for (const sibId of siblingIds) {
        const sibFull = fullData.individuals[sibId];
        if (sibFull) {
          resultIndividuals[sibId] = {
            ...sibFull,
            familiesAsSpouse: [...sibFull.familiesAsSpouse],
          };
        }
      }

      // Add origin family (will be scoped in step 10)
      resultFamilies[originFamilyId] = {
        ...originFamily,
        children: [...originFamily.children],
      };

      // 11. Update the married-in spouse's familyAsChild in the result
      if (resultIndividuals[spouseId]) {
        resultIndividuals[spouseId] = {
          ...resultIndividuals[spouseId],
          familiesAsSpouse: [...resultIndividuals[spouseId].familiesAsSpouse],
          familyAsChild: originFamilyId,
        };
      }
    }
  }

  // Collect all family IDs in result for scoping
  const allResultFamilyIds = new Set(Object.keys(resultFamilies));
  const allResultIndividualIds = new Set(Object.keys(resultIndividuals));

  // 9. Scope newly added individuals' familiesAsSpouse to families present in result
  // 10. Scope newly added families' husband/wife/children to individuals present in result
  for (const famId of addedFamilyIds) {
    const fam = resultFamilies[famId];
    if (!fam) continue;

    resultFamilies[famId] = {
      ...fam,
      husband: fam.husband && allResultIndividualIds.has(fam.husband) ? fam.husband : null,
      wife: fam.wife && allResultIndividualIds.has(fam.wife) ? fam.wife : null,
      children: fam.children.filter((childId) => allResultIndividualIds.has(childId)),
    };
  }

  for (const [id, ind] of Object.entries(resultIndividuals)) {
    // Only need to scope individuals that were newly added
    if (subtree.individuals[id]) continue;

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
// Full-family graft descriptors (multi-root mode)
// ---------------------------------------------------------------------------

/**
 * Describes a full in-law family tree to be grafted inline in multi-root mode.
 * Unlike GraftDescriptor (which only includes parents + siblings), this includes
 * the entire subtree rooted at the spouse's topmost ancestor.
 */
export interface FullGraftDescriptor {
  /** The topmost ancestor of the married-in spouse's family */
  graftRootId: string;
  /** Full subtree extracted via extractSubtree() */
  subtree: GedcomData;
  /** All spouse connections linking this graft to the main tree */
  spouseConnections: Array<{ spouseId: string; hubPersonId: string; spouseSex: string }>;
}

/**
 * For each married-in spouse (not a descendant of root, has familyAsChild),
 * find their topmost ancestor and extract the full subtree.
 * Deduplicates by graftRootId: if two spouses share the same root ancestor,
 * one graft subtree serves both (with multiple spouseConnections).
 *
 * @returns Map keyed by graftRootId -> FullGraftDescriptor
 */
export function computeFullGraftDescriptors(
  data: GedcomData,
  rootId: string
): Map<string, FullGraftDescriptor> {
  const { individuals, families } = data;
  const result = new Map<string, FullGraftDescriptor>();

  // Compute all descendants of the root
  const rootDescendants = getAllDescendants(data, rootId);
  rootDescendants.add(rootId);

  // For each person in the tree (root + descendants)
  for (const personId of rootDescendants) {
    const person = individuals[personId];
    if (!person || person.isPrivate) continue;

    // Check each spouse
    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      const spouseId = family.husband === personId ? family.wife : family.husband;
      if (!spouseId) continue;

      const spouse = individuals[spouseId];
      if (!spouse || spouse.isPrivate) continue;

      // Spouse must NOT be a descendant of root (married-in)
      if (rootDescendants.has(spouseId)) continue;

      // Spouse must have a familyAsChild
      if (!spouse.familyAsChild) continue;

      // Find the topmost ancestor of the spouse
      const graftRootId = findTopmostAncestor(data, spouseId) ?? spouseId;

      // Skip if the graft root doesn't exist
      if (!individuals[graftRootId]) continue;

      const connection = {
        spouseId,
        hubPersonId: personId,
        spouseSex: spouse.sex || '',
      };

      // Deduplicate: if we already have a descriptor for this graftRootId, just add the connection
      const existing = result.get(graftRootId);
      if (existing) {
        // Only add if this spouse isn't already connected
        if (!existing.spouseConnections.some(c => c.spouseId === spouseId)) {
          existing.spouseConnections.push(connection);
        }
      } else {
        // Extract the full subtree rooted at the graft root
        const subtree = extractSubtree(data, graftRootId);

        result.set(graftRootId, {
          graftRootId,
          subtree,
          spouseConnections: [connection],
        });
      }
    }
  }

  return result;
}

