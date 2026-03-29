import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { createShareTokenSchema } from '@/lib/tree/branch-pointer-schemas';
import { generateShareToken, hashToken } from '@/lib/tree/branch-share-token';

type RouteParams = { params: Promise<{ id: string }> };

/** Max active (non-revoked, non-expired) share tokens per workspace */
const MAX_TOKENS_PER_WORKSPACE = 20;

/** Default token expiry: 30 days */
const TOKEN_EXPIRY_DAYS = 30;

// POST /api/workspaces/[id]/share-tokens — Create a share token
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createShareTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { rootIndividualId, depthLimit, includeGrafts, targetWorkspaceSlug, isPublic } = parsed.data;

  // Verify root individual exists in this workspace's tree
  const individual = await prisma.individual.findFirst({
    where: {
      id: rootIndividualId,
      tree: { workspaceId },
    },
  });

  if (!individual) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في شجرة هذه المساحة' },
      { status: 404 },
    );
  }

  // Check token limit
  const activeCount = await prisma.branchShareToken.count({
    where: {
      sourceWorkspaceId: workspaceId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (activeCount >= MAX_TOKENS_PER_WORKSPACE) {
    return NextResponse.json(
      { error: 'تم الوصول للحد الأقصى من رموز المشاركة' },
      { status: 429 },
    );
  }

  // Resolve target workspace ID from slug
  let targetWorkspaceId: string | null = null;
  if (targetWorkspaceSlug && !isPublic) {
    const targetWs = await prisma.workspace.findUnique({
      where: { slug: targetWorkspaceSlug },
      select: { id: true },
    });
    if (!targetWs) {
      return NextResponse.json(
        { error: 'المساحة المستهدفة غير موجودة' },
        { status: 404 },
      );
    }
    targetWorkspaceId = targetWs.id;
  }

  // Generate token and store hash
  const token = generateShareToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);

  const record = await prisma.branchShareToken.create({
    data: {
      tokenHash,
      sourceWorkspaceId: workspaceId,
      rootIndividualId,
      depthLimit: depthLimit ?? null,
      includeGrafts,
      targetWorkspaceId,
      isPublic,
      maxUses: 100,
      expiresAt,
      createdById: result.user.id,
    },
  });

  return NextResponse.json(
    { data: { id: record.id, token } },
    { status: 201 },
  );
}

// GET /api/workspaces/[id]/share-tokens — List share tokens
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tokens = await prisma.branchShareToken.findMany({
    where: { sourceWorkspaceId: workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      rootIndividual: {
        select: { givenName: true, surname: true },
      },
      targetWorkspace: {
        select: { slug: true, nameAr: true },
      },
    },
  });

  // Count active pointers per token via groupBy (Prisma v7 driver adapters don't support _count with where in include)
  const tokenIds = tokens.map((t) => t.id);
  const activeCounts = tokenIds.length > 0
    ? await prisma.branchPointer.groupBy({
        by: ['shareTokenId'],
        where: {
          shareTokenId: { in: tokenIds },
          status: 'active',
        },
        _count: { id: true },
      })
    : [];
  const countMap = new Map(activeCounts.map((r) => [r.shareTokenId, r._count.id]));

  const shaped = tokens.map((t) => ({
    id: t.id,
    rootPersonName: [t.rootIndividual.givenName, t.rootIndividual.surname]
      .filter(Boolean)
      .join(' '),
    depthLimit: t.depthLimit,
    activePointerCount: countMap.get(t.id) ?? 0,
    isPublic: t.isPublic,
    targetWorkspaceName: t.targetWorkspace?.nameAr ?? null,
    isRevoked: t.isRevoked,
    expiresAt: t.expiresAt,
    createdAt: t.createdAt,
  }));

  return NextResponse.json({ data: shaped });
}
