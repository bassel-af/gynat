import { prisma } from '@/lib/db';

/**
 * Hard cap on the number of `extra` (collections) trees a single workspace may
 * hold. Enforced by EVERY path that mints an extra tree — the extra-trees POST
 * route, the duplicate route, AND the copy paths (own-tree + cross-workspace
 * borrowed-branch). Lives in a lib module (not a route) so the copy helpers can
 * enforce it without importing a route.
 */
export const MAX_EXTRA_TREES_PER_WORKSPACE = 50;

/**
 * Thrown by the copy helpers when the target workspace is already at the extra
 * cap. Routes catch this and map it to the same 429 contract the POST route
 * returns (`rateLimitResponse(0)`).
 */
export class ExtraTreeCapError extends Error {
  constructor() {
    super('extra-tree cap reached');
    this.name = 'ExtraTreeCapError';
  }
}

/**
 * Throw {@link ExtraTreeCapError} when the workspace already holds the maximum
 * number of extra trees. Call BEFORE the copy transaction so a rejected copy
 * never writes anything.
 */
export async function assertExtraTreeCapacity(workspaceId: string): Promise<void> {
  const existingCount = await prisma.familyTree.count({
    where: { workspaceId, kind: 'extra' },
  });
  if (existingCount >= MAX_EXTRA_TREES_PER_WORKSPACE) {
    throw new ExtraTreeCapError();
  }
}
