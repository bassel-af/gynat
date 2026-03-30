import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { searchPlacesSchema, createPlaceSchema } from '@/lib/places/schemas';
import { stripArabicDiacritics, ARABIC_DIACRITICS_CHARS } from '@/lib/utils/search';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PlaceWithParent {
  id: string;
  nameAr: string;
  nameEn: string | null;
  parent: PlaceWithParent | null;
}

const PARENT_INCLUDE = {
  parent: { include: { parent: { include: { parent: true } } } },
} as const;

function buildFullPath(place: PlaceWithParent): string {
  const parts: string[] = [place.nameAr];
  let current = place.parent;
  while (current) {
    parts.push(current.nameAr);
    current = current.parent;
  }
  return parts.join('، ');
}

function toPlaceResponse(place: PlaceWithParent) {
  return {
    id: place.id,
    nameAr: place.nameAr,
    nameEn: place.nameEn,
    parentNameAr: place.parent?.nameAr ?? null,
    fullPath: buildFullPath(place),
  };
}

/** Escape LIKE metacharacters (%, _) in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// GET /api/workspaces/[id]/places?q=...
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const authResult = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(authResult)) return authResult;

  const url = new URL(request.url);
  const parsed = searchPlacesSchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { q } = parsed.data;
  const strippedQ = stripArabicDiacritics(q);

  let matchingIds: string[];

  if (strippedQ) {
    const likePattern = `%${escapeLike(strippedQ)}%`;
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM places
      WHERE (workspace_id IS NULL OR workspace_id = ${workspaceId}::uuid)
      AND (
        translate(lower(name_ar), ${ARABIC_DIACRITICS_CHARS}, '') LIKE ${likePattern}
        OR lower(COALESCE(name_en, '')) LIKE ${likePattern}
      )
      ORDER BY name_ar ASC
      LIMIT 50
    `;
    matchingIds = rows.map((r) => r.id);
  } else {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM places
      WHERE (workspace_id IS NULL OR workspace_id = ${workspaceId}::uuid)
      ORDER BY name_ar ASC
      LIMIT 10
    `;
    matchingIds = rows.map((r) => r.id);
  }

  const places = matchingIds.length > 0
    ? await prisma.place.findMany({
        where: { id: { in: matchingIds } },
        orderBy: { nameAr: 'asc' },
        include: PARENT_INCLUDE,
      })
    : [];

  const sorted = strippedQ
    ? [...places].sort((a, b) => {
        const aStarts = stripArabicDiacritics(a.nameAr).startsWith(strippedQ) ||
          (a.nameEn?.toLowerCase().startsWith(strippedQ) ?? false);
        const bStarts = stripArabicDiacritics(b.nameAr).startsWith(strippedQ) ||
          (b.nameEn?.toLowerCase().startsWith(strippedQ) ?? false);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      }).slice(0, 10)
    : places.slice(0, 10);

  return NextResponse.json({ data: sorted.map((p) => toPlaceResponse(p as PlaceWithParent)) });
}

// ---------------------------------------------------------------------------
// POST /api/workspaces/[id]/places
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const authResult = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(authResult)) return authResult;

  const parsed = await parseValidatedBody(request, createPlaceSchema);
  if (isParseError(parsed)) return parsed;

  const { nameAr, nameEn, parentId } = parsed.data;

  // Upsert: check workspace-scoped first, then global
  const existing = await prisma.place.findFirst({
    where: {
      nameAr,
      OR: [{ workspaceId }, { workspaceId: null }],
    },
    include: PARENT_INCLUDE,
  });

  if (existing) {
    return NextResponse.json(
      { data: toPlaceResponse(existing as PlaceWithParent) },
      { status: 200 },
    );
  }

  const created = await prisma.place.create({
    data: {
      workspaceId,
      nameAr,
      nameEn: nameEn ?? null,
      parentId: parentId ?? null,
    },
    include: PARENT_INCLUDE,
  });

  return NextResponse.json(
    { data: toPlaceResponse(created as PlaceWithParent) },
    { status: 201 },
  );
}
