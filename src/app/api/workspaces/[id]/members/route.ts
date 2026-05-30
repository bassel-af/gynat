import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { sendEmail } from '@/lib/email/transport';
import { buildInviteEmail } from '@/lib/email/templates/invite';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  // .trim() runs before .email() so a space-padded address still validates;
  // the handler then lowercases it (see below) to match the GoTrue account.
  email: z.string().trim().max(254).email('Valid email is required'),
  individualId: z.string().uuid().optional(),
});

// GET /api/workspaces/[id]/members — List members
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireWorkspaceMember(request, id);
  if (isErrorResponse(result)) return result;

  const members = await prisma.workspaceMembership.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  return NextResponse.json({ data: members });
}

// POST /api/workspaces/[id]/members — Invite by email
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireWorkspaceAdmin(request, id);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, inviteSchema);
  if (isParseError(parsed)) return parsed;

  const { individualId } = parsed.data;
  // Normalize the invite address: GoTrue stores account emails lowercased, so
  // the invitation must match. Trim + lowercase so a capitalized or
  // space-padded address still matches the invitee's account at accept time
  // (and so the duplicate-member check below isn't fooled by casing).
  const email = parsed.data.email.trim().toLowerCase();

  // Check if email is already a member
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const existingMembership = await prisma.workspaceMembership.findMany({
      where: { workspaceId: id, userId: existingUser.id },
    });

    if (existingMembership.length > 0) {
      return NextResponse.json(
        { error: 'This email is already a member of this workspace' },
        { status: 400 },
      );
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId: id,
      type: 'email',
      email,
      individualId: individualId ?? null,
      invitedById: result.user.id,
      expiresAt,
      maxUses: 1,
    },
  });

  // Look up workspace name and inviter name for the email
  let emailSent = false;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: { nameAr: true },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { displayName: true },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4000';
    const inviteUrl = `${siteUrl}/invite/${invitation.id}`;

    const emailContent = buildInviteEmail({
      workspaceName: workspace?.nameAr ?? 'عائلة',
      inviterName: inviter?.displayName ?? 'عضو',
      inviteUrl,
    });

    await sendEmail({
      to: email,
      ...emailContent,
    });
    emailSent = true;
  } catch (error) {
    console.error('Failed to send invitation email:', error);
  }

  return NextResponse.json({ data: invitation, emailSent }, { status: 201 });
}
