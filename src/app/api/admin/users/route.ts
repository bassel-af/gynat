import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformOwner } from '@/lib/api/admin-auth';
import { logAdminAccess } from '@/lib/audit/admin-access';
import { getUserAccounts } from '@/lib/admin/users';
import { withUserCache } from '@/lib/admin/cache';

const CACHE_TTL_MS = 60_000;

/**
 * GET /api/admin/users
 *
 * All platform accounts (name, email, workspace count, join date, last
 * activity) for the /admin/users drill-down. Owner-only — every call is
 * written to `AdminAccessLog`. Unlike the metrics endpoints this
 * intentionally returns user identity fields; see the rationale in
 * `src/lib/admin/users.ts`. Never 500s: query failures come back as
 * `{ error: 'query_failed' }` so the page shows an inline error.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (auth instanceof NextResponse) return auth;

  await logAdminAccess({
    userId: auth.user.id,
    action: 'admin_users_read',
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  try {
    const payload = await withUserCache(
      auth.user.id,
      'users',
      () => getUserAccounts(),
      CACHE_TTL_MS,
    );
    return NextResponse.json(payload);
  } catch (err) {
    const errorType =
      err instanceof Error ? err.constructor.name : typeof err;
    return NextResponse.json({ error: 'query_failed', errorType });
  }
}
