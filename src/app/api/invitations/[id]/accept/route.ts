import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { invitationAcceptLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/api/serialize';

// POST /api/invitations/[id]/accept — Accept a workspace invitation
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = invitationAcceptLimiter.check(user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const { id } = await context.params;

  // Find invitation
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: 'الدعوة غير موجودة' },
      { status: 404 },
    );
  }

  // Check status is pending
  if (invitation.status !== 'pending') {
    return NextResponse.json(
      { error: 'هذه الدعوة لم تعد صالحة' },
      { status: 410 },
    );
  }

  // Check expiration
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'انتهت صلاحية هذه الدعوة' },
      { status: 410 },
    );
  }

  // Check max uses
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
    return NextResponse.json(
      { error: 'تم استخدام هذه الدعوة بالكامل' },
      { status: 410 },
    );
  }

  // Email match check for email-type invitations
  if (invitation.type === 'email' && invitation.email !== user.email) {
    return NextResponse.json(
      {
        error: 'هذه الدعوة مخصصة لبريد إلكتروني آخر',
        code: 'EMAIL_MISMATCH',
      },
      { status: 403 },
    );
  }

  // Check if already a member
  const existingMembership = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
      },
    },
  });

  if (existingMembership) {
    return NextResponse.json(
      {
        error: 'أنت بالفعل عضو في هذه المساحة',
        code: 'ALREADY_MEMBER',
      },
      { status: 400 },
    );
  }

  // Atomically create membership and update invitation
  try {
    const membership = await prisma.$transaction(async (tx) => {
      const newMembership = await tx.workspaceMembership.create({
        data: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
          role: 'workspace_member',
        },
      });

      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'accepted',
          useCount: invitation.useCount + 1,
        },
      });

      return newMembership;
    });

    return NextResponse.json(
      { data: serializeBigInt(membership) },
      { status: 201 },
    );
  } catch (error: unknown) {
    // Handle unique constraint violation (race condition)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'أنت بالفعل عضو في هذه المساحة',
          code: 'ALREADY_MEMBER',
        },
        { status: 400 },
      );
    }
    console.error('Invitation acceptance failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
