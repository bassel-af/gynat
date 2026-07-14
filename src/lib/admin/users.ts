/**
 * Platform Owner Dashboard — user accounts drill-down.
 *
 * DELIBERATE EXCEPTION to the "never return displayName / email" rule in
 * `queries.ts`: that rule protects the aggregate METRICS surface. This
 * helper backs the owner's account-management drill-down (/admin/users),
 * where identifying the account is the whole point. It stays acceptable
 * because:
 *   - Owner-only, defense-in-depth gated (middleware + layout + route).
 *   - Every read is written to `AdminAccessLog` by the route.
 *   - Still metadata only: profile fields the user typed at signup plus
 *     counts/timestamps — no tree data, no encrypted-column reads.
 */

import { prisma } from '@/lib/db';

export interface UserAccountRow {
  id: string;
  displayName: string;
  email: string;
  isPlatformOwner: boolean;
  /** Number of workspaces the user is a member of. */
  workspaceCount: number;
  /** ISO timestamp — account creation (join date). */
  createdAt: string;
  /** ISO timestamp of last presence heartbeat; null if never seen. */
  lastActiveAt: string | null;
}

export interface UserAccountsPayload {
  totalUsers: number;
  users: UserAccountRow[];
}

export async function getUserAccounts(): Promise<UserAccountsPayload> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      email: true,
      isPlatformOwner: true,
      createdAt: true,
      lastActiveAt: true,
      // Include-based count without a nested `where` — supported by the
      // Prisma v7 pg driver-adapter (see queries.ts engagement note).
      _count: { select: { workspaceMemberships: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const rows: UserAccountRow[] = (users as Array<{
    id: string;
    displayName: string;
    email: string;
    isPlatformOwner: boolean;
    createdAt: Date;
    lastActiveAt: Date | null;
    _count: { workspaceMemberships: number };
  }>).map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    isPlatformOwner: u.isPlatformOwner,
    workspaceCount: u._count.workspaceMemberships,
    createdAt: u.createdAt.toISOString(),
    lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
  }));

  return { totalUsers: rows.length, users: rows };
}
