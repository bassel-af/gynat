import { NextRequest } from 'next/server';
import { publicTreeLimiter, rateLimitResponse, clientIpKey } from '@/lib/api/rate-limit';
import {
  loadPublicPersonSourceFile,
  publicSourceFileResponse,
  publicSourceNotFound,
} from '@/lib/tree/public-sources';

type RouteParams = { params: Promise<{ slug: string; individualId: string; entryId: string; fileId: string }> };

// GET /api/family/[slug]/person/[individualId]/sources/[entryId]/files/[fileId] — anonymous.
//
// One file of a public-level entry on a publicly shown person. Same hardened
// headers as the member file route, plus noindex; images inline, PDFs as a
// download. Anything not visible is the same 404 and no bytes are read.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug, individualId, entryId, fileId } = await params;

  const rl = publicTreeLimiter.check(clientIpKey(request));
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const file = await loadPublicPersonSourceFile(slug, individualId, entryId, fileId);
  if (!file) return publicSourceNotFound();
  return publicSourceFileResponse(file);
}
