import { NextRequest, NextResponse } from 'next/server';
import { publicTreeLimiter, rateLimitResponse, clientIpKey } from '@/lib/api/rate-limit';
import {
  loadPublicPersonSources,
  publicSourceNotFound,
  PUBLIC_SOURCE_HEADERS,
} from '@/lib/tree/public-sources';

type RouteParams = { params: Promise<{ slug: string; individualId: string }> };

// GET /api/family/[slug]/person/[individualId]/sources — anonymous.
//
// «زوار الشجرة المنشورة» entries of a person the public tree shows, plus the
// inherited tree-wide entry. Unknown / private tree, hidden person and
// malformed ids all read as the same 404. Never cached, never indexed.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug, individualId } = await params;

  const rl = publicTreeLimiter.check(clientIpKey(request));
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const sources = await loadPublicPersonSources(slug, individualId);
  if (!sources) return publicSourceNotFound();

  return NextResponse.json({ data: sources }, { headers: PUBLIC_SOURCE_HEADERS });
}
