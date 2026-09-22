import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { trackPresence } from '@/lib/admin/presence-tracker';
import { getServerSupabaseUrl } from '@/lib/supabase/internal-url';

interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Extracts and validates the Bearer token from a NextRequest.
 * Returns the authenticated Supabase user or an error message.
 *
 * Phase 2 Live Presence: on successful auth we kick off a fire-and-forget
 * presence write. The tracker is throttled and self-contained; errors and
 * hangs MUST NOT propagate up.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing authorization' };
  }

  const token = authHeader.slice(7);
  const supabase = createClient(
    getServerSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { user: null, error: authError.message };
  }

  if (!user) {
    return { user: null, error: 'User not found' };
  }

  try {
    void trackPresence({
      userId: user.id,
      pathname: request.nextUrl.pathname,
      method: request.method,
    });
  } catch {
    // Synchronous throws from a fire-and-forget call must not propagate.
  }

  return { user, error: null };
}
