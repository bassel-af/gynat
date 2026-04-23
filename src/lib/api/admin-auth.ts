import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';
import type { User, SupabaseClient } from '@supabase/supabase-js';

interface PlatformOwnerAuthResult {
  user: User;
}

export type LayoutGuardResult =
  | { ok: true; user: User }
  | { ok: false; redirectTo: '/auth/login' | '/workspaces' };

/**
 * Authenticates the request and verifies the user is a platform owner
 * (`User.isPlatformOwner === true`). Accepts either a Bearer Authorization
 * header or, if no Authorization header is present, a Supabase session
 * cookie. A present-but-invalid Bearer token rejects 401 without falling
 * back to the cookie (failed intent, not a foot-gun). Returns `{ user }`
 * on success or a `NextResponse` error on failure — same shape as
 * `requireWorkspaceAdmin` in `src/lib/api/workspace-auth.ts`.
 *
 * SECURITY: this is the ONLY supported gate for `/api/admin/*` route
 * handlers. The middleware also enforces the flag as a defense-in-depth
 * fallback, but every handler MUST still call this guard. A coverage test
 * (`src/test/admin-auth-coverage.test.ts`) globs admin route modules and
 * fails if any handler omits the call.
 */
export async function requirePlatformOwner(
  request: NextRequest,
): Promise<PlatformOwnerAuthResult | NextResponse> {
  let user: User | null = null;
  let authError: string | null = null;

  const hasAuthHeader = request.headers.get('authorization') !== null;
  if (hasAuthHeader) {
    const result = await getAuthenticatedUser(request);
    user = result.user;
    authError = result.error;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    authError = error?.message ?? null;
  }

  if (!user) {
    return NextResponse.json({ error: authError ?? 'Unauthorized' }, { status: 401 });
  }

  // Generic 403 message — do NOT leak whether the user exists or whether
  // they were merely missing the flag.
  const denied = NextResponse.json(
    { error: 'Forbidden' },
    { status: 403 },
  );

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isPlatformOwner: true },
  });

  if (!dbUser || !dbUser.isPlatformOwner) {
    return denied;
  }

  return { user };
}

/**
 * Pure decision function used by `src/app/admin/layout.tsx`. Returns the
 * decision rather than calling `redirect()` so the logic is unit-testable
 * without spinning up the Next runtime.
 *
 * Supabase server client is passed in so the caller controls cookie wiring.
 */
export async function checkPlatformOwnerForLayout(
  supabase: SupabaseClient,
): Promise<LayoutGuardResult> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, redirectTo: '/auth/login' };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isPlatformOwner: true },
  });

  if (!dbUser?.isPlatformOwner) {
    return { ok: false, redirectTo: '/workspaces' };
  }

  return { ok: true, user };
}
