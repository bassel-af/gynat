import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformOwner } from '@/lib/api/admin-auth';
import { logAdminAccess } from '@/lib/audit/admin-access';
import { getContentMetrics } from '@/lib/admin/queries';
import { withUserCache } from '@/lib/admin/cache';

const CACHE_TTL_MS = 60_000;

/**
 * GET /api/admin/metrics/content
 *
 * Returns a full per-workspace headcount of recorded individuals (every
 * workspace, including empty ones). Owner-only — every call is written to
 * `AdminAccessLog`. Like the other metric routes, a query failure is
 * surfaced inline via a `{ error: 'query_failed' }` envelope so the
 * dashboard renders a red card instead of 500ing.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (auth instanceof NextResponse) return auth;

  await logAdminAccess({
    userId: auth.user.id,
    action: 'admin_metrics_content_read',
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  try {
    const payload = await withUserCache(
      auth.user.id,
      'content',
      () => getContentMetrics(),
      CACHE_TTL_MS,
    );
    return NextResponse.json(payload);
  } catch (err) {
    const errorType =
      err instanceof Error ? err.constructor.name : typeof err;
    return NextResponse.json({ error: 'query_failed', errorType });
  }
}
