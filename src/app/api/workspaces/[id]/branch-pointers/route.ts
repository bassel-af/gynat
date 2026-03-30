import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { redeemTokenSchema } from '@/lib/tree/branch-pointer-schemas';
import { hashToken } from '@/lib/tree/branch-share-token';
import { validateSpouseGender } from '@/lib/tree/family-validators';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

/** Max active branch pointers per workspace */
const MAX_POINTERS_PER_WORKSPACE = 50;

/** Generic error message for invalid/expired/revoked tokens (security: no info leakage) */
const INVALID_TOKEN_ERROR = 'رمز المشاركة غير صالح أو منتهي الصلاحية';

// GET /api/workspaces/[id]/branch-pointers — List incoming branch pointers
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const pointers = await prisma.branchPointer.findMany({
    where: { targetWorkspaceId: workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      sourceWorkspace: {
        select: { nameAr: true },
      },
      rootIndividual: {
        select: { givenName: true, surname: true },
      },
    },
  });

  const data = pointers.map((p) => ({
    id: p.id,
    sourceWorkspaceNameAr: p.sourceWorkspace.nameAr,
    sourceRootName: [p.rootIndividual.givenName, p.rootIndividual.surname]
      .filter(Boolean)
      .join(' ') || 'غير معروف',
    anchorIndividualId: p.anchorIndividualId,
    relationship: p.relationship,
    status: p.status,
  }));

  return NextResponse.json({ data });
}

// POST /api/workspaces/[id]/branch-pointers — Redeem a share token
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, redeemTokenSchema);
  if (isParseError(parsed)) return parsed;

  const { token, anchorIndividualId, selectedPersonId, relationship, linkChildrenToAnchor } = parsed.data;

  // Look up token by hash
  const tokenHash = hashToken(token);
  const shareToken = await prisma.branchShareToken.findFirst({
    where: {
      tokenHash,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!shareToken) {
    return NextResponse.json(
      { error: INVALID_TOKEN_ERROR },
      { status: 400 },
    );
  }

  // Check use count
  if (shareToken.useCount >= shareToken.maxUses) {
    return NextResponse.json(
      { error: INVALID_TOKEN_ERROR },
      { status: 400 },
    );
  }

  // Check workspace scope (by workspace ID, not slug — security finding #7)
  // If targetWorkspaceId is set, only that workspace can redeem. If null, any workspace can.
  if (!shareToken.isPublic && shareToken.targetWorkspaceId && shareToken.targetWorkspaceId !== workspaceId) {
    return NextResponse.json(
      { error: INVALID_TOKEN_ERROR },
      { status: 400 },
    );
  }

  // Prevent self-pointing
  if (shareToken.sourceWorkspaceId === workspaceId) {
    return NextResponse.json(
      { error: 'لا يمكن ربط فرع من نفس المساحة' },
      { status: 400 },
    );
  }

  // Check pointer limit
  const activePointerCount = await prisma.branchPointer.count({
    where: {
      targetWorkspaceId: workspaceId,
      status: 'active',
    },
  });

  if (activePointerCount >= MAX_POINTERS_PER_WORKSPACE) {
    return NextResponse.json(
      { error: 'تم الوصول للحد الأقصى من الفروع المرتبطة' },
      { status: 429 },
    );
  }

  // Verify anchor individual exists in the target workspace's tree
  const anchor = await prisma.individual.findFirst({
    where: {
      id: anchorIndividualId,
      tree: { workspaceId },
    },
  });

  if (!anchor) {
    return NextResponse.json(
      { error: 'الشخص المرجعي غير موجود في شجرة هذه المساحة' },
      { status: 404 },
    );
  }

  // Rule 4: One pointer per anchor — reject if anchor already has an active pointer
  const existingPointer = await prisma.branchPointer.findFirst({
    where: {
      targetWorkspaceId: workspaceId,
      anchorIndividualId,
      status: 'active',
    },
  });

  if (existingPointer) {
    return NextResponse.json(
      { error: 'يوجد ربط فرع مسبق لهذا الشخص. لا يمكن إضافة أكثر من ربط واحد حالياً.' },
      { status: 400 },
    );
  }

  // Rule 1: Child/sibling — selected person must not have parents in the subtree
  if (relationship === 'child' || relationship === 'sibling') {
    // Check if the selected person has a familyAsChild in the source tree
    const selectedAsChild = await prisma.familyChild.findFirst({
      where: {
        individualId: selectedPersonId,
        family: { tree: { workspaceId: shareToken.sourceWorkspaceId } },
      },
    });
    if (selectedAsChild) {
      return NextResponse.json(
        { error: 'لا يمكن الربط كابن أو أخ: الشخص المختار لديه والدان في الفرع المشارَك.' },
        { status: 400 },
      );
    }
  }

  // Rule 2: Parent — no duplicate gender
  if (relationship === 'parent') {
    const selectedPerson = await prisma.individual.findFirst({
      where: {
        id: selectedPersonId,
        tree: { workspaceId: shareToken.sourceWorkspaceId },
      },
      select: { sex: true },
    });

    if (!selectedPerson || !selectedPerson.sex) {
      return NextResponse.json(
        { error: 'يجب تحديد جنس الشخص المختار أولاً.' },
        { status: 400 },
      );
    }

    // Check if anchor already has a parent of the same gender
    const anchorFamiliesAsChild = await prisma.family.findMany({
      where: {
        children: { some: { individualId: anchorIndividualId } },
        tree: { workspaceId },
      },
      select: { husbandId: true, wifeId: true },
    });

    const hasSameGenderParent = anchorFamiliesAsChild.some((fam) =>
      selectedPerson.sex === 'M' ? fam.husbandId !== null : fam.wifeId !== null,
    );

    if (hasSameGenderParent) {
      const errorMsg = selectedPerson.sex === 'M'
        ? 'لا يمكن إضافة أب — يوجد بالفعل أب لهذا الشخص في الشجرة.'
        : 'لا يمكن إضافة أم — يوجد بالفعل أم لهذا الشخص في الشجرة.';
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }
  }

  // Spouse gender validation: anchor and selected must not be same known sex
  if (relationship === 'spouse') {
    const selectedPerson = await prisma.individual.findFirst({
      where: { id: selectedPersonId, tree: { workspaceId: shareToken.sourceWorkspaceId } },
      select: { sex: true },
    });
    const spouseCheck = validateSpouseGender(anchor.sex, selectedPerson?.sex ?? null);
    if (!spouseCheck.valid) {
      return NextResponse.json({ error: spouseCheck.error }, { status: 400 });
    }
  }

  // Wrap pointer creation in a transaction to prevent race conditions
  let pointer;
  try {
    pointer = await prisma.$transaction(async (tx) => {
      // Re-check Rule 4 inside transaction to prevent races
      const raceCheck = await tx.branchPointer.findFirst({
        where: {
          targetWorkspaceId: workspaceId,
          anchorIndividualId,
          status: 'active',
        },
      });
      if (raceCheck) {
        throw new Error('DUPLICATE_ANCHOR_POINTER');
      }

      // Re-check token revocation inside transaction to prevent race with concurrent revoke
      const freshToken = await tx.branchShareToken.findUnique({
        where: { id: shareToken.id },
        select: { isRevoked: true },
      });
      if (!freshToken || freshToken.isRevoked) {
        throw new Error('TOKEN_REVOKED');
      }

      // Increment use count
      await tx.branchShareToken.update({
        where: { id: shareToken.id },
        data: { useCount: { increment: 1 } },
      });

      // Create the branch pointer
      // rootIndividualId = boundary root (token's root, e.g., فدوى)
      // selectedIndividualId = the person picked by the admin (e.g., خالد)
      return tx.branchPointer.create({
        data: {
          sourceWorkspaceId: shareToken.sourceWorkspaceId,
          rootIndividualId: shareToken.rootIndividualId,
          selectedIndividualId: selectedPersonId,
          depthLimit: shareToken.depthLimit,
          includeGrafts: shareToken.includeGrafts,
          targetWorkspaceId: workspaceId,
          anchorIndividualId,
          relationship,
          linkChildrenToAnchor: relationship === 'spouse' ? linkChildrenToAnchor : false,
          status: 'active',
          shareTokenId: shareToken.id,
          createdById: result.user.id,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'DUPLICATE_ANCHOR_POINTER') {
      return NextResponse.json(
        { error: 'يوجد ربط نشط بالفعل على هذا الشخص' },
        { status: 400 },
      );
    }
    if (message === 'TOKEN_REVOKED') {
      return NextResponse.json(
        { error: 'الرمز غير صالح أو منتهي الصلاحية' },
        { status: 400 },
      );
    }
    throw err;
  }

  return NextResponse.json({ data: pointer }, { status: 201 });
}
