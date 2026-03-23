import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import { serializeBigInt } from '@/lib/api/serialize';

type RouteParams = { params: Promise<{ slug: string }> };

// GET /api/workspaces/by-slug/[slug] — Resolve workspace by slug
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Verify the user is a member
  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
  });

  if (!membership) {
    return NextResponse.json({ error: 'لست عضوًا في هذه المساحة' }, { status: 403 });
  }

  const memberCount = await prisma.workspaceMembership.count({
    where: { workspaceId: workspace.id },
  });

  return NextResponse.json({
    data: serializeBigInt({
      ...workspace,
      memberCount,
      currentUserRole: membership.role,
      currentUserPermissions: membership.permissions,
      currentUserId: user.id,
    }),
  });
}
