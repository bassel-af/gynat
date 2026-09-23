/**
 * «قفزة نسب» — server backstop: a person who carries a jump must never be given
 * recorded parents by any route other than the move-to-new-father route.
 *
 * A jump says "this person's line continues up to that distant couple"; a
 * recorded father beside it would be a second, competing claim (rule J3). The
 * client refuses these paths first; this is the fail-closed server-side check
 * every "give this person parents" route runs before (or inside the transaction
 * of) its insert.
 */
import { NextResponse } from 'next/server';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ANCESTRY_JUMP_ERROR_MESSAGES,
  ANCESTRY_JUMP_ERROR_STATUS,
} from '@/lib/tree/ancestry-jump-validators';

/** Whether any of `ids` is the descendant of a jump in `treeId`. Empty input → no query. */
export async function hasJumpDescendant(
  db: Pick<Prisma.TransactionClient, 'ancestryJump'>,
  treeId: string,
  ids: readonly string[],
): Promise<boolean> {
  if (ids.length === 0) return false;
  const rows = await db.ancestryJump.findMany({
    where: { treeId, descendantId: { in: [...ids] } },
    select: { descendantId: true },
  });
  return rows.length > 0;
}

/**
 * In-memory variant over an already-loaded tree (`TREE_INCLUDES` carries its
 * `ancestryJumps` rows) — no extra query.
 */
export function treeHasJumpDescendant(
  tree: { ancestryJumps: readonly { descendantId: string }[] },
  ids: readonly string[],
): boolean {
  return tree.ancestryJumps.some((j) => ids.includes(j.descendantId));
}

/** The 409 `{ error, code: 'child_has_jump' }` response. */
export function childHasJumpResponse(): NextResponse {
  return NextResponse.json(
    { error: ANCESTRY_JUMP_ERROR_MESSAGES.child_has_jump, code: 'child_has_jump' },
    { status: ANCESTRY_JUMP_ERROR_STATUS.child_has_jump },
  );
}

/** Sentinel thrown inside a transaction so the route can map it to the 409. */
export class ChildHasJumpError extends Error {
  constructor() {
    super('CHILD_HAS_JUMP');
  }
}
