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

  // Generic error for all invalid/expired/used invitation states
  // to prevent invitation ID enumeration and status information leakage
  const invalidInvitationResponse = () =>
    NextResponse.json(
      { error: 'دعوة غير صالحة أو منتهية الصلاحية' },
      { status: 404 },
    );

  // Find invitation
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id },
  });

  if (!invitation) {
    return invalidInvitationResponse();
  }

  // Check status is pending
  if (invitation.status !== 'pending') {
    return invalidInvitationResponse();
  }

  // Check expiration
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return invalidInvitationResponse();
  }

  // Check max uses
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
    return invalidInvitationResponse();
  }

  // Email match check for email-type invitations.
  // Case-insensitive: GoTrue stores account emails lowercased, but an admin may
  // type the invite address with different casing (e.g. "Ayman@..." vs the
  // account's "ayman@..."). A case-sensitive comparison silently rejected valid
  // invitations and surfaced the generic "expired" message to the invitee.
  if (
    invitation.type === 'email' &&
    invitation.email?.trim().toLowerCase() !== user.email?.trim().toLowerCase()
  ) {
    // Distinct from the generic invalid/expired response: the invitation is
    // fine, the signed-in account just doesn't match. The /invite page already
    // shows the (masked) invited address, so this leaks nothing new, and the
    // client renders an actionable "sign in with the right email" message
    // instead of a misleading "expired" one.
    return NextResponse.json(
      {
        error:
          'هذه الدعوة مخصصة لبريد إلكتروني آخر. يرجى تسجيل الدخول بالبريد الإلكتروني الذي وصلتك عليه الدعوة.',
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
