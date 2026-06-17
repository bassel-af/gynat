// TODO(production): This is a single-process in-memory rate limiter.
// It will not work correctly across multiple instances (e.g., multiple pods or serverless).
// Replace with Redis-backed or Upstash-backed rate limiting before horizontal scaling.
import { NextResponse } from 'next/server';

export class RateLimiter {
  private store: Map<string, { count: number; resetAt: number }>;
  private maxRequests: number;
  private windowMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor({ maxRequests, windowMs }: { maxRequests: number; windowMs: number }) {
    this.store = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.resetAt < now) this.store.delete(key);
      }
    }, 60_000);
    // Don't prevent process exit
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  reset(): void {
    this.store.clear();
  }

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (entry.count < this.maxRequests) {
      entry.count++;
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
}

export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

// Pre-configured instances
export const joinCodeLimiter = new RateLimiter({ maxRequests: 20, windowMs: 15 * 60 * 1000 });
export const workspaceCreateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 });
export const invitationAcceptLimiter = new RateLimiter({ maxRequests: 30, windowMs: 15 * 60 * 1000 });
export const treeMutateLimiter = new RateLimiter({ maxRequests: 200, windowMs: 60 * 1000 });
export const inviteCodeGenLimiter = new RateLimiter({ maxRequests: 20, windowMs: 15 * 60 * 1000 });
export const profileUpdateLimiter = new RateLimiter({ maxRequests: 30, windowMs: 15 * 60 * 1000 });
export const treeExportLimiter = new RateLimiter({ maxRequests: 20, windowMs: 15 * 60 * 1000 });
export const treeImportLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 });
export const cascadePreviewLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });
export const auditLogLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60 * 1000 });
// Public, anonymous, IP-keyed limiters (the authed limiters above don't cover
// anonymous callers). Public tree reads are heavily cached, so this only needs
// to blunt scrapers/enumeration, not normal browsing.
export const publicTreeLimiter = new RateLimiter({ maxRequests: 120, windowMs: 60 * 1000 });
export const publicReportLimiter = new RateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 });
// Collections add-by-link resolution is IP-keyed (S10): resolving a pasted code
// against the share-token / public-slug tables is a guess surface, so it's
// throttled hard to blunt enumeration even though the caller is authenticated.
export const collectionLinkResolveLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });

/** Extract the client IP from forwarding headers (first hop), for IP-keyed rate limiting. */
export function clientIpKey(request: { headers: { get(name: string): string | null } }): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
