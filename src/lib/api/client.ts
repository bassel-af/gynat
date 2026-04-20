import { createClient } from '@/lib/supabase/client';

/**
 * Extension to fetch's RequestInit.
 *
 * `isUndo` — Phase 15a. When true, adds the `X-Gynat-Undo: true` header so
 * mutation routes can tag the audit-log description as an undo action. The
 * option itself is NOT forwarded to `fetch()`.
 */
export interface ApiFetchInit extends RequestInit {
  isUndo?: boolean;
}

/**
 * Client-side fetch wrapper that automatically attaches the Bearer token
 * from the current Supabase session to API requests.
 *
 * NOTE: We intentionally use `getSession()` here (not `getUser()`) because this
 * is a client-side convenience helper that only needs the access token for the
 * Authorization header. The server side (src/lib/api/auth.ts) always calls
 * `getUser()` to cryptographically verify the token before trusting the user
 * identity. The client-side session is not used for access control decisions.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchInit = {},
): Promise<Response> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  const { isUndo, headers: userHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(userHeaders as Record<string, string>),
    Authorization: `Bearer ${session.access_token}`,
  };

  if (isUndo) {
    headers['X-Gynat-Undo'] = 'true';
  }

  return fetch(path, {
    ...rest,
    headers,
  });
}
