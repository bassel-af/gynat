/**
 * Live Presence — pure helpers (route allow-list, classifier, query stubs).
 *
 * This module is the only place where path strings are turned into the
 * canonical patterns that get written to `User.lastActiveRoute`. The
 * allow-list is intentional: an unknown path returns `null` and the
 * tracker skips the write. UUIDs and slugs MUST never survive into the
 * DB column.
 *
 * See `docs/prd-admin-dashboard.md` §4.4 and the consolidated team-lead
 * spec in the agent thread for design intent.
 */

export type ActivityCategory = 'viewing' | 'editing';

// Slug: lowercase alnum, single-char OK, internal hyphens, no leading/trailing
// hyphen. UUID: standard 8-4-4-4-12 hex (case-insensitive flag on each route).
// `+` quantifiers ensure no empty segments and `\.` is excluded by both —
// path traversal (`.`, `..`) is rejected because neither class matches `.`.
const SLUG = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`^/workspaces$`), '/workspaces'],
  [new RegExp(`^/workspaces/${SLUG}$`), '/workspaces/[slug]'],
  [new RegExp(`^/workspaces/${SLUG}/tree$`), '/workspaces/[slug]/tree'],
  [new RegExp(`^/workspaces/${SLUG}/tree/audit$`), '/workspaces/[slug]/tree/audit'],
  [new RegExp(`^/profile$`), '/profile'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/individuals$`, 'i'), '/api/workspaces/[id]/tree/individuals'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/individuals/${UUID}$`, 'i'), '/api/workspaces/[id]/tree/individuals/[id]'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/families$`, 'i'), '/api/workspaces/[id]/tree/families'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/families/${UUID}$`, 'i'), '/api/workspaces/[id]/tree/families/[id]'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/families/${UUID}/children$`, 'i'), '/api/workspaces/[id]/tree/families/[id]/children'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/families/${UUID}/children/${UUID}$`, 'i'), '/api/workspaces/[id]/tree/families/[id]/children/[id]'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/rada-families$`, 'i'), '/api/workspaces/[id]/tree/rada-families'],
  [new RegExp(`^/api/workspaces/${UUID}/tree/rada-families/${UUID}$`, 'i'), '/api/workspaces/[id]/tree/rada-families/[id]'],
];

function isAllowedPathChars(pathname: string): boolean {
  // Fast-fail for control bytes, %-encoded anything (caller must pre-decode),
  // and query/fragment markers (caller must strip first). Belt-and-braces
  // with the route regex which would also reject these.
  for (let i = 0; i < pathname.length; i++) {
    const code = pathname.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
    const ch = pathname[i];
    if (ch === '%' || ch === '?' || ch === '#' || ch === '\\') return false;
  }
  return true;
}

/**
 * Returns the canonical route pattern for a known shape, or `null` (skip
 * the write) for anything else. UUIDs and slugs are templated; control
 * bytes, traversal, query/fragment, and unknown shapes all yield null.
 */
export function normalizeRoutePattern(pathname: string): string | null {
  if (!pathname) return null;
  if (!isAllowedPathChars(pathname)) return null;
  const stripped =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  for (const [re, pattern] of ROUTES) {
    if (re.test(stripped)) return pattern;
  }
  return null;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// API mutation route patterns recognised as "editing" when called with a
// mutating method. Listed explicitly (not derived from API_ROUTES) because
// the v1 categorization is opinionated — read-only endpoints under /api
// are still "viewing" even if they hit /tree.
const EDITING_PATTERNS: ReadonlySet<string> = new Set([
  '/api/workspaces/[id]/tree/individuals',
  '/api/workspaces/[id]/tree/individuals/[id]',
  '/api/workspaces/[id]/tree/families',
  '/api/workspaces/[id]/tree/families/[id]',
  '/api/workspaces/[id]/tree/families/[id]/children',
  '/api/workspaces/[id]/tree/families/[id]/children/[id]',
  '/api/workspaces/[id]/tree/rada-families',
  '/api/workspaces/[id]/tree/rada-families/[id]',
]);

/**
 * Classify a normalized route + HTTP method into an activity category.
 *
 * Defaults to 'viewing' for anything we don't explicitly know about. This
 * is the safer default: 'editing' is the alarm-state ("someone is mutating
 * the tree") and we don't want to inflate that count from unknown routes.
 */
export function classifyRoute(pattern: string, method: string): ActivityCategory {
  if (EDITING_PATTERNS.has(pattern) && MUTATING_METHODS.has(method.toUpperCase())) {
    return 'editing';
  }
  return 'viewing';
}

/**
 * For the per-workspace breakdown we only know each user's last-recorded
 * route (no method). We classify the breakdown based on whether the
 * pattern is *capable* of editing — i.e. it appears in the editing
 * pattern allow-list.
 */
function isEditingPattern(pattern: string | null): boolean {
  if (!pattern) return false;
  return EDITING_PATTERNS.has(pattern);
}

// ---------------------------------------------------------------------------
// Query helpers (Phase 2 Live Presence)
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/db';

const K_ANONYMITY_MIN_MEMBERS = 5;

export interface PerWorkspaceActive {
  workspaceId: string;
  name: string;
  activeCount: number;
  dominantCategory: ActivityCategory;
}

export interface SmallWorkspacesRollup {
  workspaceCount: number;
  activeCount: number;
}

export interface ActiveWorkspaceBreakdown {
  perWorkspace: PerWorkspaceActive[];
  smallWorkspacesRollup: SmallWorkspacesRollup | null;
  /** Distinct workspaces with at least one active user (any size). */
  activeWorkspaces: number;
}

export interface PresenceResponse {
  active1m: number;
  active5m: number;
  activeWorkspaces: number;
  perWorkspace: PerWorkspaceActive[];
  smallWorkspacesRollup: SmallWorkspacesRollup | null;
  heatmap: number[][];
  peak: { count: number; recordedAt: string | null };
}

export async function getActiveUserCount(windowSeconds: number): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  return prisma.user.count({
    where: {
      isPlatformOwner: false,
      lastActiveAt: { gte: since },
    },
  });
}

export async function getActiveWorkspaceBreakdown(
  windowSeconds: number,
): Promise<ActiveWorkspaceBreakdown> {
  const since = new Date(Date.now() - windowSeconds * 1000);

  const groupsRaw = await prisma.user.groupBy({
    by: ['lastActiveWorkspaceId'],
    where: {
      isPlatformOwner: false,
      lastActiveAt: { gte: since },
    },
    _count: { _all: true },
    orderBy: { lastActiveWorkspaceId: 'asc' },
  });
  const groups = groupsRaw as Array<{
    lastActiveWorkspaceId: string | null;
    _count: { _all: number };
  }>;

  const workspaceIds = groups
    .map((g) => g.lastActiveWorkspaceId)
    .filter((id): id is string => id !== null);

  if (workspaceIds.length === 0) {
    return {
      perWorkspace: [],
      smallWorkspacesRollup: null,
      activeWorkspaces: 0,
    };
  }

  const [membershipsRaw, workspacesRaw, activeUsersRaw] = await Promise.all([
    prisma.workspaceMembership.groupBy({
      by: ['workspaceId'],
      where: { workspaceId: { in: workspaceIds } },
      _count: { userId: true },
      orderBy: { workspaceId: 'asc' },
    }),
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, nameAr: true },
    }),
    prisma.user.findMany({
      where: {
        isPlatformOwner: false,
        lastActiveAt: { gte: since },
        lastActiveWorkspaceId: { in: workspaceIds },
      },
      select: { lastActiveWorkspaceId: true, lastActiveRoute: true },
    }),
  ]);
  const memberships = membershipsRaw as Array<{ workspaceId: string; _count: { userId: number } }>;
  const workspaces = workspacesRaw as Array<{ id: string; nameAr: string }>;
  const activeUsers = activeUsersRaw as Array<{
    lastActiveWorkspaceId: string | null;
    lastActiveRoute: string | null;
  }>;

  const memberCountById = new Map(memberships.map((m) => [m.workspaceId, m._count.userId]));
  const nameById = new Map(workspaces.map((w) => [w.id, w.nameAr]));

  // Tally editing vs viewing per workspace in one pass.
  const tally = new Map<string, { editing: number; viewing: number }>();
  for (const u of activeUsers) {
    if (!u.lastActiveWorkspaceId) continue;
    let c = tally.get(u.lastActiveWorkspaceId);
    if (!c) {
      c = { editing: 0, viewing: 0 };
      tally.set(u.lastActiveWorkspaceId, c);
    }
    if (isEditingPattern(u.lastActiveRoute)) c.editing += 1;
    else c.viewing += 1;
  }

  const perWorkspace: PerWorkspaceActive[] = [];
  let smallWorkspaceCount = 0;
  let smallActiveCount = 0;

  for (const g of groups) {
    if (g.lastActiveWorkspaceId === null) continue;
    const wsId = g.lastActiveWorkspaceId;
    const memberCount = memberCountById.get(wsId) ?? 0;
    const activeCount = g._count._all;

    if (memberCount < K_ANONYMITY_MIN_MEMBERS) {
      smallWorkspaceCount += 1;
      smallActiveCount += activeCount;
      continue;
    }

    const counts = tally.get(wsId) ?? { editing: 0, viewing: 0 };
    // D3: tie → 'viewing'. Editing requires affirmative majority.
    perWorkspace.push({
      workspaceId: wsId,
      name: nameById.get(wsId) ?? '',
      activeCount,
      dominantCategory: counts.editing > counts.viewing ? 'editing' : 'viewing',
    });
  }

  return {
    perWorkspace,
    smallWorkspacesRollup:
      smallWorkspaceCount === 0
        ? null
        : { workspaceCount: smallWorkspaceCount, activeCount: smallActiveCount },
    activeWorkspaces: perWorkspace.length + smallWorkspaceCount,
  };
}

export async function getQuietWindowHeatmap(): Promise<number[][]> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0),
  );

  const rows = (await prisma.user.findMany({
    where: {
      isPlatformOwner: false,
      lastActiveAt: { gte: since },
    },
    select: { lastActiveAt: true },
  })) as Array<{ lastActiveAt: Date | null }>;

  for (const r of rows) {
    if (!r.lastActiveAt) continue;
    // Server-UTC; no DST handling. JS getUTCDay(): Sun=0..Sat=6.
    const day = r.lastActiveAt.getUTCDay();
    const hour = r.lastActiveAt.getUTCHours();
    grid[day][hour] += 1;
  }
  return grid;
}

export async function updatePeakConcurrency(currentCount: number): Promise<void> {
  try {
    // Atomic single-statement: only writes when currentCount is strictly
    // greater than the recorded peak. No TOCTOU.
    await prisma.$executeRaw`
      UPDATE platform_stats
      SET peak_concurrent_users = ${currentCount},
          peak_recorded_at = now()
      WHERE peak_concurrent_users < ${currentCount}
    `;
  } catch {
    // Best-effort. Dashboard reads must never 500 on a missed peak update.
  }
}

export async function getPresenceMetrics(): Promise<PresenceResponse> {
  const [active1m, active5m, breakdown, heatmap, peakRow] = await Promise.all([
    getActiveUserCount(60),
    getActiveUserCount(300),
    getActiveWorkspaceBreakdown(300),
    getQuietWindowHeatmap(),
    prisma.platformStat.findUnique({ where: { id: 1 } }) as Promise<
      { peakConcurrentUsers: number; peakRecordedAt: Date | null } | null
    >,
  ]);

  return {
    active1m,
    active5m,
    activeWorkspaces: breakdown.activeWorkspaces,
    perWorkspace: breakdown.perWorkspace,
    smallWorkspacesRollup: breakdown.smallWorkspacesRollup,
    heatmap,
    peak: {
      count: peakRow?.peakConcurrentUsers ?? 0,
      recordedAt: peakRow?.peakRecordedAt
        ? peakRow.peakRecordedAt.toISOString()
        : null,
    },
  };
}
