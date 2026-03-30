import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeFamily, getTreeIndividual, touchTreeTimestamp } from '@/lib/tree/queries';
import { updateFamilySchema } from '@/lib/tree/schemas';
import { validateFamilyGender } from '@/lib/tree/family-validators';
import { isSyntheticFamilyId } from '@/lib/tree/branch-pointer-guards';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string; familyId: string }> };

// PATCH /api/workspaces/[id]/tree/families/[familyId] — Update a family
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId } = await params;

  // Reject mutations on synthetic pointer families
  if (isSyntheticFamilyId(familyId)) {
    return NextResponse.json(
      { error: 'معرف العائلة غير صالح' },
      { status: 400 },
    );
  }

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, updateFamilySchema);
  if (isParseError(parsed)) return parsed;

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeFamily(tree.id, familyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Guard: isUmmWalad requires workspace enableUmmWalad
  if (parsed.data.isUmmWalad) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { enableUmmWalad: true } });
    if (!workspace?.enableUmmWalad) {
      return NextResponse.json(
        { error: 'ميزة أم ولد غير مفعّلة في هذه المساحة' },
        { status: 400 },
      );
    }
    // Clear MARC/MARR fields when setting isUmmWalad=true
    parsed.data.marriageContractDate = null;
    parsed.data.marriageContractHijriDate = null;
    parsed.data.marriageContractPlace = null;
    parsed.data.marriageContractPlaceId = null;
    parsed.data.marriageContractDescription = null;
    parsed.data.marriageContractNotes = null;
    parsed.data.marriageDate = null;
    parsed.data.marriageHijriDate = null;
    parsed.data.marriagePlace = null;
    parsed.data.marriagePlaceId = null;
    parsed.data.marriageDescription = null;
    parsed.data.marriageNotes = null;
  }

  // Guard: reject MARC/MARR data if effective isUmmWalad would be true
  const effectiveIsUmmWalad = parsed.data.isUmmWalad !== undefined ? parsed.data.isUmmWalad : existing.isUmmWalad;
  if (effectiveIsUmmWalad && !parsed.data.isUmmWalad) {
    // Existing family is ummWalad and the update is not changing it — reject any MARC/MARR
    const marcMarrFields = [
      parsed.data.marriageContractDate, parsed.data.marriageContractHijriDate,
      parsed.data.marriageContractPlace, parsed.data.marriageContractPlaceId,
      parsed.data.marriageContractDescription, parsed.data.marriageContractNotes,
      parsed.data.marriageDate, parsed.data.marriageHijriDate,
      parsed.data.marriagePlace, parsed.data.marriagePlaceId,
      parsed.data.marriageDescription, parsed.data.marriageNotes,
    ];
    if (marcMarrFields.some((v) => v !== undefined && v !== null && v !== '')) {
      return NextResponse.json(
        { error: 'أم ولد لا يمكن أن يكون لها عقد قران أو زفاف' },
        { status: 400 },
      );
    }
  }

  // Verify new husband if provided (not null — null means "remove")
  if (parsed.data.husbandId !== undefined) {
    if (parsed.data.husbandId !== null) {
      // Check if slot is already occupied by a different person
      if (existing.husbandId !== null && existing.husbandId !== parsed.data.husbandId) {
        return NextResponse.json(
          { error: 'هذا الشخص لديه والدان بالفعل' },
          { status: 409 },
        );
      }
      const husband = await getTreeIndividual(tree.id, parsed.data.husbandId);
      if (!husband) {
        return NextResponse.json(
          { error: 'الزوج غير موجود في هذه الشجرة' },
          { status: 400 },
        );
      }
    }
  }

  // Verify new wife if provided (not null — null means "remove")
  if (parsed.data.wifeId !== undefined) {
    if (parsed.data.wifeId !== null) {
      // Check if slot is already occupied by a different person
      if (existing.wifeId !== null && existing.wifeId !== parsed.data.wifeId) {
        return NextResponse.json(
          { error: 'هذا الشخص لديه والدان بالفعل' },
          { status: 409 },
        );
      }
      const wife = await getTreeIndividual(tree.id, parsed.data.wifeId);
      if (!wife) {
        return NextResponse.json(
          { error: 'الزوجة غير موجودة في هذه الشجرة' },
          { status: 400 },
        );
      }
    }
  }

  // Validate gender consistency for the effective husband/wife after update
  const effectiveHusbandId = parsed.data.husbandId !== undefined ? parsed.data.husbandId : existing.husbandId;
  const effectiveWifeId = parsed.data.wifeId !== undefined ? parsed.data.wifeId : existing.wifeId;
  const genderCheck = await validateFamilyGender(effectiveHusbandId, effectiveWifeId, tree.id);
  if (!genderCheck.valid) {
    return NextResponse.json({ error: genderCheck.error }, { status: 400 });
  }

  const family = await prisma.family.update({
    where: { id: familyId },
    data: parsed.data,
    include: { children: true },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'family',
        entityId: familyId,
        payload: parsed.data,
      },
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: family });
}

// DELETE /api/workspaces/[id]/tree/families/[familyId] — Delete a family
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId } = await params;

  // Reject mutations on synthetic pointer families
  if (isSyntheticFamilyId(familyId)) {
    return NextResponse.json(
      { error: 'معرف العائلة غير صالح' },
      { status: 400 },
    );
  }

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeFamily(tree.id, familyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.familyChild.deleteMany({
      where: { familyId },
    });

    await tx.family.delete({
      where: { id: familyId },
    });

    await tx.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'delete',
        entityType: 'family',
        entityId: familyId,
      },
    });
  });

  await touchTreeTimestamp(tree.id);

  return new NextResponse(null, { status: 204 });
}
