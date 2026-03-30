import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string; userId: string }> };

const updateMemberSchema = z.object({
  role: z.enum(['workspace_admin', 'workspace_member']).optional(),
  permissions: z.array(
    z.enum(['tree_editor', 'news_editor', 'album_editor', 'event_editor']),
  ).optional(),
});

async function isLastAdmin(workspaceId: string): Promise<boolean> {
  const adminCount = await prisma.workspaceMembership.count({
    where: { workspaceId, role: 'workspace_admin' },
  });
  return adminCount <= 1;
}

// PATCH /api/workspaces/[id]/members/[userId] — Update member role/permissions
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id, userId: targetUserId } = await params;
  const result = await requireWorkspaceAdmin(request, id);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, updateMemberSchema);
  if (isParseError(parsed)) return parsed;

  // Check if demoting self as last admin
  if (targetUserId === result.user.id && parsed.data.role === 'workspace_member') {
    if (await isLastAdmin(id)) {
      return NextResponse.json(
        { error: 'Cannot demote the last admin' },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.workspaceMembership.update({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId: id } },
    data: parsed.data,
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/workspaces/[id]/members/[userId] — Remove member
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id, userId: targetUserId } = await params;
  const result = await requireWorkspaceAdmin(request, id);
  if (isErrorResponse(result)) return result;

  // Cannot remove self if last admin
  if (targetUserId === result.user.id) {
    if (await isLastAdmin(id)) {
      return NextResponse.json(
        { error: 'Cannot remove the last admin' },
        { status: 400 },
      );
    }
  }

  await prisma.workspaceMembership.delete({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId: id } },
  });

  return NextResponse.json({ data: { success: true } });
}
