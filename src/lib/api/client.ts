import { createClient } from '@/lib/supabase/client';

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
  options: RequestInit = {},
): Promise<Response> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session');
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Authorization: `Bearer ${session.access_token}`,
  };

  return fetch(path, {
    ...options,
    headers,
  });
}
