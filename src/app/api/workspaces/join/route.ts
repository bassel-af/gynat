import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { joinCodeLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

const joinSchema = z.object({
  code: z.string().min(1, 'Code is required').max(64),
});

// POST /api/workspaces/join — Join workspace via invite code
export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = joinCodeLimiter.check(user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, joinSchema);
  if (isParseError(parsed)) return parsed;

  const { code } = parsed.data;

  // Find a valid invitation: not revoked, not expired, not over max uses
  const invitation = await prisma.workspaceInvitation.findFirst({
    where: {
      code,
      type: 'code',
      status: 'pending',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: 'Invite code is invalid or expired' },
      { status: 404 },
    );
  }

  // Check max uses
  if (invitation.maxUses !== null && invitation.useCount >= invitation.maxUses) {
    return NextResponse.json(
      { error: 'Invite code is invalid or expired' },
      { status: 404 },
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
      { error: 'You are already a member of this workspace' },
      { status: 400 },
    );
  }

  // Use an interactive transaction to atomically:
  // 1. Re-read the invitation (to get a consistent useCount)
  // 2. Check max uses again (prevents race condition)
  // 3. Create the membership
  // 4. Increment the use count
  const result = await prisma.$transaction(async (tx: {
    workspaceInvitation: {
      findFirst: typeof prisma.workspaceInvitation.findFirst;
      update: typeof prisma.workspaceInvitation.update;
    };
    workspaceMembership: {
      create: typeof prisma.workspaceMembership.create;
    };
  }) => {
    // Re-read invitation inside transaction for consistent snapshot
    const freshInvitation = await tx.workspaceInvitation.findFirst({
      where: {
        id: invitation.id,
        status: 'pending',
      },
    });

    if (!freshInvitation) {
      return { error: 'Invite code is invalid or expired', status: 404 as const };
    }

    // Re-check max uses with fresh data (prevents race condition)
    if (freshInvitation.maxUses !== null && freshInvitation.useCount >= freshInvitation.maxUses) {
      return { error: 'Invite code is invalid or expired', status: 404 as const };
    }

    // Create membership
    const membership = await tx.workspaceMembership.create({
      data: {
        userId: user.id,
        workspaceId: invitation.workspaceId,
        role: 'workspace_member',
      },
    });

    // Increment use count atomically
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { useCount: freshInvitation.useCount + 1 },
    });

    return { data: membership };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
