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
export const joinCodeLimiter = new RateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 });
export const workspaceCreateLimiter = new RateLimiter({ maxRequests: 3, windowMs: 60 * 60 * 1000 });
export const invitationAcceptLimiter = new RateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 });
export const treeMutateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60 * 1000 });
export const inviteCodeGenLimiter = new RateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 });
export const profileUpdateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 });
