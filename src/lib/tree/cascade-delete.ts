import type { GedcomData } from '@/lib/gedcom/types';
import { getDisplayName } from '@/lib/gedcom/display';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const MAX_AFFECTED_NAMES = 20;

export interface DeleteImpact {
  hasImpact: boolean;
  affectedIds: Set<string>;
  affectedNames: string[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Core reachability analysis
// ---------------------------------------------------------------------------

/**
 * Compute the set of individuals that would become unreachable if `targetId`
 * were deleted from the tree.
 *
 * Algorithm:
 * 1. Simulate removing `targetId` (exclude from individuals)
 * 2. Find ALL root ancestors in the ORIGINAL data (people with no `familyAsChild`),
 *    excluding the target
 * 3. From each root, BFS collecting all reachable people using ONLY downward
 *    (parent→child) and across (spouse) traversal — NO upward traversal
 * 4. Anyone remaining who is NOT reachable = affected
 *
 * WHY NO UPWARD TRAVERSAL: A married-in spouse has no `familyAsChild`, so they
 * appear as a root candidate. If we seed from them AND traverse upward from
 * children to parents, the married-in spouse would always be reached through
 * their children (who point to the shared family). This defeats the purpose of
 * detecting that the married-in spouse loses their connection when the linking
 * spouse is deleted.
 *
 * By only traversing DOWN and ACROSS:
 * - A real lineage root reaches all descendants and their spouses
 * - A married-in spouse is reached ONLY via a spouse link from a reachable
 *   lineage member — if that member (the target) is deleted, the married-in
 *   spouse is never reached, correctly marking them as affected
 * - A married-in spouse who IS a root candidate seeds BFS downward to shared
 *   children, but those children are ALSO reached from the real lineage root.
 *   The married-in spouse is only reached if another reachable person is their
 *   spouse (via ACROSS traversal). If their only spouse is the target, they
 *   remain unreached despite being a seed — wait, they ARE a seed, so they're
 *   in the reachable set...
 *
 * CORRECTION: We cannot simply seed from all root candidates, because the
 * married-in spouse would seed themselves into the reachable set. Instead:
 *
 * FINAL ALGORITHM (correct):
 * 1. Seed BFS from ALL root candidates (no familyAsChild, not target)
 * 2. BFS traverses ONLY DOWNWARD (parent→child) — no spouse, no upward
 * 3. This gives us the "lineage reachable" set
 * 4. Then expand: for each person in the lineage set, add their spouses
 *    (if not target and not already reachable). For each newly added spouse,
 *    also BFS downward from them. Repeat until stable.
 * 5. This ensures married-in spouses are only reachable if a lineage member
 *    (who survived the deletion) is married to them.
 *
 * Note: upward traversal (child→parent) is not needed because all parents
 * who are part of the lineage have no familyAsChild (they're roots) and are
 * already seeded. Intermediate parents have familyAsChild set, so they're
 * reached via their own parent's downward traversal.
 */
export function computeDeleteImpact(data: GedcomData, targetId: string): DeleteImpact {
  const { individuals, families } = data;

  // If target doesn't exist, no impact
  if (!individuals[targetId]) {
    return { hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false };
  }

  // Build the set of all individuals excluding target
  const remainingIds = new Set<string>();
  for (const id in individuals) {
    if (id !== targetId) {
      remainingIds.add(id);
    }
  }

  // If no one remains, no impact (single-person tree)
  if (remainingIds.size === 0) {
    return { hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false };
  }

  // «قفزة نسب» (ancestry jump): this BFS is jump-BLIND, DELIBERATELY. Do not
  // add `data.ancestryJumps` to any traversal below. A jump ancestor is a CLAIM
  // about descent, not a dependent of the descendant — walking it would sweep an
  // entire apex lineage (إسماعيل and everyone under him) into the delete of one
  // man. For the same reason the seed step below correctly treats a jump
  // descendant as a root candidate: his `familyAsChild` is still null, so his
  // line stands on its own. Locked by src/test/ancestry-jump-cascade-delete.ts.
  //
  // Seed filtering: find root candidates (no familyAsChild, not target).
  //
  // When the target is a MID-TREE person (has familyAsChild), we exclude
  // "married-in" people from seeds. A root candidate is married-in if ALL
  // their families have another spouse with familyAsChild set — they entered
  // the tree only through marriage to a lineage descendant. This applies to
  // ALL married-in spouses at any depth (target's spouse, children's spouses,
  // grandchildren's spouses, etc.) so the cascade correctly propagates.
  //
  // When the target IS a root (no familyAsChild), we don't exclude anyone —
  // married-in spouses become new roots and keep their families connected.
  const targetPerson = individuals[targetId];
  const targetIsLineageMember = targetPerson?.familyAsChild != null;

  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const id of remainingIds) {
    const person = individuals[id];
    if (!person || person.familyAsChild) continue;

    // No families → isolated individual → true root
    if (person.familiesAsSpouse.length === 0) {
      reachable.add(id);
      queue.push(id);
      continue;
    }

    // Only apply married-in exclusion when deleting a mid-tree person
    let isMarriedIn = false;
    if (targetIsLineageMember) {
      isMarriedIn = person.familiesAsSpouse.every(famId => {
        const fam = families[famId];
        if (!fam) return false;
        const otherSpouseId = fam.husband === id ? fam.wife : fam.husband;
        if (!otherSpouseId || !individuals[otherSpouseId]) {
          // No other spouse → single parent → lineage root
          return false;
        }
        // If the other spouse has familyAsChild, they're a descendant —
        // this candidate married into a descendant's family
        return individuals[otherSpouseId].familyAsChild != null;
      });
    }

    if (!isMarriedIn) {
      reachable.add(id);
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const person = individuals[currentId];
    if (!person) continue;

    // Traverse DOWN + ACROSS: through families where this person is a spouse
    for (const familyId of person.familiesAsSpouse) {
      const family = families[familyId];
      if (!family) continue;

      // Add spouse
      const spouseId = family.husband === currentId ? family.wife : family.husband;
      if (spouseId && spouseId !== targetId && remainingIds.has(spouseId) && !reachable.has(spouseId)) {
        reachable.add(spouseId);
        queue.push(spouseId);
      }

      // Add children
      for (const childId of family.children) {
        if (childId !== targetId && remainingIds.has(childId) && !reachable.has(childId)) {
          reachable.add(childId);
          queue.push(childId);
        }
      }
    }

    // Traverse UP: through familyAsChild -> parents and siblings
    // Guard: do NOT traverse up into a family where the target is a parent.
    // This prevents cross-married children from "rescuing" the target's
    // married-in spouse and other children via upward traversal.
    const familyAsChildId = person.familyAsChild;
    if (familyAsChildId) {
      const parentFamily = families[familyAsChildId];
      if (parentFamily && parentFamily.husband !== targetId && parentFamily.wife !== targetId) {
        const parentIds = [parentFamily.husband, parentFamily.wife].filter(Boolean) as string[];
        for (const parentId of parentIds) {
          if (remainingIds.has(parentId) && !reachable.has(parentId)) {
            reachable.add(parentId);
            queue.push(parentId);
          }
        }

        for (const siblingId of parentFamily.children) {
          if (siblingId !== currentId && remainingIds.has(siblingId) && !reachable.has(siblingId)) {
            reachable.add(siblingId);
            queue.push(siblingId);
          }
        }
      }
    }
  }

  // Affected = remaining individuals NOT reached
  const affectedIds = new Set<string>();
  for (const id of remainingIds) {
    if (!reachable.has(id)) {
      affectedIds.add(id);
    }
  }

  // Build affected names list (capped at MAX_AFFECTED_NAMES)
  const affectedNames: string[] = [];
  for (const id of affectedIds) {
    if (affectedNames.length >= MAX_AFFECTED_NAMES) break;
    const person = individuals[id];
    if (person) {
      affectedNames.push(getDisplayName(person));
    }
  }

  return {
    hasImpact: affectedIds.size > 0,
    affectedIds,
    affectedNames,
    truncated: affectedIds.size > MAX_AFFECTED_NAMES,
  };
}

// ---------------------------------------------------------------------------
// Version hash
// ---------------------------------------------------------------------------

/**
 * Compute a version token from the tree's lastModifiedAt timestamp.
 * Used for stale data protection in cascade delete flow.
 * The ISO string is the version — it's not a secret, just a freshness check.
 */
export function computeVersionHash(lastModifiedAt: Date): string {
  return lastModifiedAt.toISOString();
}

// ---------------------------------------------------------------------------
// Impact response builder (for API)
// ---------------------------------------------------------------------------

/**
 * Build the impact response object from the unreachable set.
 */
export function buildImpactResponse(
  unreachable: Set<string>,
  gedcomData: GedcomData,
  versionHash: string,
) {
  const affectedCount = unreachable.size;
  const hasImpact = affectedCount > 0;

  const affectedNames: string[] = [];
  for (const id of unreachable) {
    const person = gedcomData.individuals[id];
    if (person) {
      affectedNames.push(getDisplayName(person));
    }
  }

  return {
    hasImpact,
    affectedCount,
    affectedNames,
    versionHash,
  };
}
