import { NextRequest, NextResponse } from 'next/server'
import {
  loadPublicCollectionBySlug,
  buildPublicCollectionPayload,
} from '@/lib/collections/public-serve'
import {
  publicTreeLimiter,
  rateLimitResponse,
  clientIpKey,
} from '@/lib/api/rate-limit'

type RouteParams = { params: Promise<{ slug: string }> }

/**
 * Public JSON feed for a published COLLECTION. Anonymous, deny-by-default.
 * Mirrors /api/family/[slug]/tree but composes a collection's published trees
 * (withholding every non-public item LIVE; see collections/public-serve.ts).
 *
 * The loader is the deny-by-default gate: it returns null for an unknown OR
 * private slug AND when the owning workspace has Collections disabled — so a
 * single generic 404 covers all three (no existence/enablement oracle).
 *
 * Always `noindex` — collections are never search-indexed at the API surface.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params

  // Public IP-based throttling (the authed limiter doesn't cover anon callers).
  const rl = publicTreeLimiter.check(clientIpKey(request))
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds)

  const record = await loadPublicCollectionBySlug(slug)
  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = await buildPublicCollectionPayload(record)

  return NextResponse.json(payload, {
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      // Public cache (NOT private) — shared caches/CDNs may serve this.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
