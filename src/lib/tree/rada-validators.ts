/**
 * Check if any foster parent is also listed as a child (circular reference).
 */
export function detectCircularRadaRef(
  fosterFatherId: string | null | undefined,
  fosterMotherId: string | null | undefined,
  childrenIds: string[],
): boolean {
  const childSet = new Set(childrenIds)
  if (fosterFatherId && childSet.has(fosterFatherId)) return true
  if (fosterMotherId && childSet.has(fosterMotherId)) return true
  return false
}

/**
 * Check if childrenIds array contains duplicates.
 */
export function detectDuplicateChildren(childrenIds: string[]): boolean {
  return new Set(childrenIds).size !== childrenIds.length
}
