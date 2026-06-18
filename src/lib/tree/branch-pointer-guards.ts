/**
 * Branch pointer mutation guards.
 *
 * These functions are used by tree mutation endpoints to reject
 * edits to pointed (read-only) entities.
 */

/** Check if an individual ID is in the set of pointed IDs */
export function isPointedIndividualId(
  individualId: string,
  pointedIds: Set<string>,
): boolean {
  return pointedIds.has(individualId);
}

/** Check if a family ID is in the set of pointed family IDs */
export function isPointedFamilyId(
  familyId: string,
  pointedFamilyIds: Set<string>,
): boolean {
  return pointedFamilyIds.has(familyId);
}

/**
 * Check if a family ID is a synthetic stitching family created by mergePointedSubtree.
 * Synthetic family IDs follow the pattern: ptr-{pointerId}-fam
 */
export function isSyntheticFamilyId(familyId: string): boolean {
  return /^ptr-.+-fam$/.test(familyId);
}

/**
 * Narrow a branch pointer to a STITCHABLE one — a real anchored pointer with a
 * non-null anchor and relationship. Anchor-less collection-link pointers are
 * source descriptors with no anchor to graft onto, so they must never be fed to
 * the deep-copy / stitch path (going-private freeze, token-revoke auto-copy).
 * Centralizes that invariant so the deep-copy loops share one guard.
 */
export function isStitchablePointer<
  T extends { anchorIndividualId: string | null; relationship: string | null },
>(pointer: T): pointer is T & { anchorIndividualId: string; relationship: string } {
  return pointer.anchorIndividualId != null && pointer.relationship != null;
}
