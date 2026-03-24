import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth';
import { searchPlacesSchema, createPlaceSchema } from '@/lib/places/schemas';
import { stripArabicDiacritics } from '@/lib/utils/search';

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

/** Build the full hierarchical path for a place (e.g., "الخرج، الرياض، المملكة العربية السعودية") */
function buildFullPath(place: PlaceWithParent): string {
  const parts: string[] = [place.nameAr];
  let current = place.parent;
  while (current) {
    parts.push(current.nameAr);
    current = current.parent;
  }
  return parts.join('، ');
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

  // Arabic diacritics characters to strip in SQL translate()
  const DIACRITICS = '\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u065F\u0670';

  // Step 1: Find matching place IDs using raw SQL with diacritics stripping
  let matchingIds: string[];

  if (strippedQ) {
    const likePattern = `%${strippedQ}%`;
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM places
      WHERE (workspace_id IS NULL OR workspace_id = ${workspaceId}::uuid)
      AND (
        translate(lower(name_ar), ${DIACRITICS}, '') LIKE ${likePattern}
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

  // Step 2: Fetch full records with parent hierarchy using Prisma
  const places = matchingIds.length > 0
    ? await prisma.place.findMany({
        where: { id: { in: matchingIds } },
        orderBy: { nameAr: 'asc' },
        include: {
          parent: {
            include: {
              parent: {
                include: {
                  parent: true,
                },
              },
            },
          },
        },
      })
    : [];

  // Prioritize startsWith matches, take top 10
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

  const data = sorted.map((place: PlaceWithParent) => ({
    id: place.id,
    nameAr: place.nameAr,
    nameEn: place.nameEn,
    parentNameAr: place.parent?.nameAr ?? null,
    fullPath: buildFullPath(place),
  }));

  return NextResponse.json({ data });
}

// ---------------------------------------------------------------------------
// POST /api/workspaces/[id]/places
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const authResult = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(authResult)) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createPlaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { nameAr, nameEn, parentId } = parsed.data;

  // Upsert behavior: check if nameAr already exists for this workspace
  const existing = await prisma.place.findFirst({
    where: { workspaceId, nameAr },
    include: {
      parent: {
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      },
    },
  });

  if (existing) {
    const placeData = {
      id: existing.id,
      nameAr: existing.nameAr,
      nameEn: existing.nameEn,
      parentNameAr: (existing as PlaceWithParent).parent?.nameAr ?? null,
      fullPath: buildFullPath(existing as PlaceWithParent),
    };
    return NextResponse.json({ data: placeData }, { status: 200 });
  }

  const created = await prisma.place.create({
    data: {
      workspaceId,
      nameAr,
      nameEn: nameEn ?? null,
      parentId: parentId ?? null,
    },
    include: {
      parent: {
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      },
    },
  });

  const placeData = {
    id: created.id,
    nameAr: created.nameAr,
    nameEn: created.nameEn,
    parentNameAr: (created as PlaceWithParent).parent?.nameAr ?? null,
    fullPath: buildFullPath(created as PlaceWithParent),
  };

  return NextResponse.json({ data: placeData }, { status: 201 });
}
