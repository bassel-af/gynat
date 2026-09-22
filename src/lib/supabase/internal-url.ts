/**
 * The base URL every SERVER-SIDE Supabase client talks to.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is the address a browser uses. On a self-hosted
 * box behind a CDN that address resolves to the edge, so the server verifying a
 * user's token would call the public hostname and come back in through the
 * proxy — a round trip that can (and did) time out and surface as «fetch
 * failed» or a spurious 401.
 *
 * `SUPABASE_INTERNAL_URL` overrides it with an address on the host itself (the
 * local Kong listener), so token verification never leaves the machine. It is
 * optional: unset, everything behaves exactly as before.
 *
 * NOT for the browser client — 127.0.0.1 means something different there.
 */
export function getServerSupabaseUrl(): string {
  const internal = process.env.SUPABASE_INTERNAL_URL?.trim();
  if (internal) return internal;
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/**
 * The name of the auth cookie the BROWSER writes.
 *
 * supabase-js derives its storage key from the host of the URL it was given
 * (`sb-${hostname.split('.')[0]}-auth-token`). Point a cookie-reading server
 * client at the internal URL and it starts looking for `sb-127-auth-token`,
 * finds nothing, and bounces every logged-in visitor back to the login page.
 *
 * So the cookie name stays pinned to the PUBLIC url, whatever base URL the
 * server is calling. With no internal override the two agree and this is a
 * no-op.
 *
 * `undefined` means "let the library derive it", which is what happened before
 * this existed — a missing var must not crash the middleware on every request.
 *
 * Env never changes at runtime, so the derivation is memoized per public URL
 * (this runs on every middleware pass).
 */
let cookieNameCache: { publicUrl: string | undefined; name: string | undefined } | null = null;

export function getAuthCookieName(): string | undefined {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (cookieNameCache && cookieNameCache.publicUrl === publicUrl) return cookieNameCache.name;
  let name: string | undefined;
  try {
    name = `sb-${new URL(publicUrl!).hostname.split('.')[0]}-auth-token`;
  } catch {
    name = undefined;
  }
  cookieNameCache = { publicUrl, name };
  return name;
}
