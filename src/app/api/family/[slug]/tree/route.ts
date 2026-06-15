import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import {
  loadPublicTreeBySlug,
  buildPublicTreePayload,
} from '@/lib/tree/public-serve'
import {
  publicTreeLimiter,
  rateLimitResponse,
  clientIpKey,
} from '@/lib/api/rate-limit'

type RouteParams = { params: Promise<{ slug: string }> }

/**
 * Public JSON feed for a published tree. Anonymous, deny-by-default. The
 * interactive canvas hydrates from this; the SSR page (the human/crawlable
 * surface) lives at /family/[slug].
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params

  // Public IP-based throttling (the authed limiter doesn't cover anon callers).
  const rl = publicTreeLimiter.check(clientIpKey(request))
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds)

  const record = await loadPublicTreeBySlug(slug)
  // 404 for unknown OR private — a private tree is indistinguishable from a
  // missing one to a stranger (no existence leak).
  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ETag folds visibility into the cache key so a visibility change busts it.
  // (A source-visibility change also bumps the home tree's lastModifiedAt when
  // a pointer is created/broken, so it is covered by lastModifiedAt.)
  const etag = computePublicETag(record.lastModifiedAt, record.visibility)
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  const payload = await buildPublicTreePayload(record)

  return NextResponse.json(
    {
      data: payload.data,
      names: payload.names,
      familyName: payload.record.nameAr || payload.record.workspaceNameAr,
    },
    {
      headers: {
        ETag: etag,
        // Public cache (NOT private) — shared caches/CDNs may serve this.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}

function computePublicETag(lastModifiedAt: Date, visibility: string): string {
  const hash = createHash('sha1')
    .update(`${lastModifiedAt.toISOString()}|${visibility}`)
    .digest('hex')
    .slice(0, 16)
  return `"${hash}"`
}
