import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { prisma } from '@/lib/db';
import type { User } from '@supabase/supabase-js';

interface WorkspaceAuthResult {
  user: User;
  membership: { userId: string; workspaceId: string; role: string; permissions: string[] };
}

/**
 * Authenticates the user and verifies workspace membership.
 * Returns the user and membership, or a NextResponse error.
 */
export async function requireWorkspaceMember(
  request: NextRequest,
  workspaceId: string,
): Promise<WorkspaceAuthResult | NextResponse> {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });

  if (!membership) {
    return NextResponse.json({ error: 'لست عضوًا في هذه المساحة' }, { status: 403 });
  }

  return { user, membership };
}

/**
 * Authenticates the user and verifies workspace admin role.
 * Returns the user and membership, or a NextResponse error.
 */
export async function requireWorkspaceAdmin(
  request: NextRequest,
  workspaceId: string,
): Promise<WorkspaceAuthResult | NextResponse> {
  const result = await requireWorkspaceMember(request, workspaceId);

  if (result instanceof NextResponse) {
    return result;
  }

  if (result.membership.role !== 'workspace_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return result;
}

/**
 * Authenticates the user and verifies tree editing permission.
 * Allows workspace admins (implicit) or members with tree_editor permission.
 * Returns the user and membership, or a NextResponse error.
 */
export async function requireTreeEditor(
  request: NextRequest,
  workspaceId: string,
): Promise<WorkspaceAuthResult | NextResponse> {
  const result = await requireWorkspaceMember(request, workspaceId);

  if (result instanceof NextResponse) {
    return result;
  }

  if (
    result.membership.role === 'workspace_admin' ||
    result.membership.permissions.includes('tree_editor')
  ) {
    return result;
  }

  return NextResponse.json(
    { error: 'ليس لديك صلاحية تعديل شجرة العائلة' },
    { status: 403 },
  );
}

/**
 * Type guard to check if the result is an error response.
 */
export function isErrorResponse(
  result: WorkspaceAuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
