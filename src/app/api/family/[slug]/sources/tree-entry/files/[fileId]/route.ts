import { NextRequest } from 'next/server';
import { publicTreeLimiter, rateLimitResponse, clientIpKey } from '@/lib/api/rate-limit';
import {
  loadPublicTreeEntryFile,
  publicSourceFileResponse,
  publicSourceNotFound,
} from '@/lib/tree/public-sources';

type RouteParams = { params: Promise<{ slug: string; fileId: string }> };

// GET /api/family/[slug]/sources/tree-entry/files/[fileId] — anonymous.
//
// One file of the tree-wide entry («مصدر الشجرة»), served only while that
// entry is at the public level. Same headers and 404 as the person file route.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug, fileId } = await params;

  const rl = publicTreeLimiter.check(clientIpKey(request));
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const file = await loadPublicTreeEntryFile(slug, fileId);
  if (!file) return publicSourceNotFound();
  return publicSourceFileResponse(file);
}
