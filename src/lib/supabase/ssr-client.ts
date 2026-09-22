import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { getAuthCookieName, getServerSupabaseUrl } from './internal-url';

/**
 * The ONE way a server-side, cookie-backed Supabase client is built.
 *
 * Every caller (RSC `cookies()`, the middleware request/response pair, the
 * OAuth callback) differs only in where its cookies live, so that is all it
 * passes. The URL and the cookie name are decided here, together, because they
 * must agree: the client calls the internal URL while the cookie keeps the name
 * the browser derived from the PUBLIC one (see `internal-url.ts`). A caller that
 * built its own client could pick up one without the other and log everyone out.
 */
export function createSsrClient(cookies: CookieMethodsServer) {
  return createServerClient(
    getServerSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: getAuthCookieName() }, cookies },
  );
}
