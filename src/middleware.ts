import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { prisma } from '@/lib/db';
import { trackPresence } from '@/lib/admin/presence-tracker';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/auth/confirm',
  '/auth/forgot-password',
  '/policy',
  '/islamic-gedcom',
  '/family', // public tree pages (anonymous, deny-by-default in the route)
  '/collections', // public collection pages (anonymous, deny-by-default in the route)
  '/test', // test route for browser testing
  '/design-preview', // design direction prototype (no-auth preview)
  '/public-tree-preview', // public-tree feature mockups (no-auth preview)
  '/public-tree-components', // public-tree component preview harness (no-auth preview)
  '/public-tree-view-preview', // read-only public viewer preview (no-auth preview)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.includes('.') // files with extensions (images, fonts, etc.)
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api');
}

function isAdminApiRoute(pathname: string): boolean {
  return pathname === '/api/admin' || pathname.startsWith('/api/admin/');
}

function isAdminPageRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware entirely for static assets (no session refresh needed)
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Phase 0 SEO split: `/` is public (crawlers + anonymous visitors must
  // render the server-side hero), but authenticated humans should bounce
  // straight to `/workspaces`. We refresh the session here so the redirect
  // reflects the current auth state; anonymous visitors fall through with
  // the refreshed cookies attached.
  if (pathname === '/') {
    const { user, supabaseResponse } = await updateSession(request);
    if (user) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      return NextResponse.redirect(new URL('/workspaces', origin));
    }
    return supabaseResponse;
  }

  // Allow public paths without session refresh
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // /api/admin/* — defense-in-depth gate. Must be checked BEFORE the
  // generic /api/* skip below; otherwise any forgotten guard inside an
  // admin handler would be reachable. Returns JSON (not a redirect).
  if (isAdminApiRoute(pathname)) {
    const { user } = await updateSession(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isPlatformOwner: true },
    });
    if (!dbUser?.isPlatformOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // For all other API routes, skip session refresh entirely.
  // API route handlers verify auth themselves via getAuthenticatedUser() which calls
  // GoTrue directly with the Bearer token. Running updateSession() here would double
  // the GoTrue calls (one in middleware + one in handler), wasting Kong rate-limit budget.
  // Client-side token refresh is handled by @supabase/ssr's createBrowserClient.
  if (isApiRoute(pathname)) {
    return NextResponse.next();
  }

  // For protected page routes, verify/refresh the session and redirect if unauthenticated
  const { user, supabaseResponse } = await updateSession(request);

  if (!user) {
    // Anchor redirect to NEXT_PUBLIC_SITE_URL — behind a proxy Next.js's
    // request.url uses the upstream listen address (localhost:4000), which
    // would send users to a non-reachable URL.
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const loginUrl = new URL('/auth/login', origin);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin/* — defense-in-depth gate for the page routes. The /admin layout
  // also re-checks server-side, but bouncing here saves the wasted render.
  if (isAdminPageRoute(pathname)) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isPlatformOwner: true },
    });
    if (!dbUser?.isPlatformOwner) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      return NextResponse.redirect(new URL('/workspaces', origin));
    }
    return supabaseResponse;
  }

  // Phase 2 Live Presence — fire-and-forget tracker. Skipped for /admin/*
  // (handled above with its own return) and for unauth (we already
  // returned a redirect). Errors and slow promises must not affect the
  // request response.
  try {
    void trackPresence({
      userId: user.id,
      pathname,
      method: request.method,
    });
  } catch {
    // Synchronous throws from a fire-and-forget call must not propagate.
  }

  return supabaseResponse;
}

export const config = {
  // Next 15 supports the Node.js runtime for middleware. We need it because
  // the admin gate calls into Prisma (`@/lib/db`), which transitively pulls
  // in `node:crypto` via the workspace master-key validator — both of which
  // are unsupported in the edge runtime.
  runtime: 'nodejs',
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
