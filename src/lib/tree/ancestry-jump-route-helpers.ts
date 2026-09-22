/**
 * «قفزة نسب» — small helpers shared by the POST and PATCH/DELETE route files.
 */

/** The shape every jump route returns. `notes` is ALWAYS plaintext. */
export interface AncestryJumpDto {
  id: string;
  treeId: string;
  descendantId: string;
  ancestorFamilyId: string;
  generationsMin: number | null;
  generationsMax: number | null;
  notes: string | null;
}

/**
 * Build the response DTO from a Prisma row plus the PLAINTEXT notes the caller
 * already holds. The row's own `notes` is a `Bytes` column and must never be
 * serialized into a response, so it is deliberately not read here.
 */
export function jumpDto(
  row: {
    id: string;
    treeId: string;
    descendantId: string;
    ancestorFamilyId: string;
    generationsMin: number | null;
    generationsMax: number | null;
  },
  notes: string | null,
): AncestryJumpDto {
  return {
    id: row.id,
    treeId: row.treeId,
    descendantId: row.descendantId,
    ancestorFamilyId: row.ancestorFamilyId,
    generationsMin: row.generationsMin,
    generationsMax: row.generationsMax,
    notes,
  };
}

/**
 * True when a Prisma error is the `(tree_id, descendant_id)` unique-index
 * violation that backstops rule J4 (one jump per person). Routes translate it
 * into the Arabic 409 so a race between two editors never surfaces as a 500.
 */
export function isDuplicateJumpError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}
