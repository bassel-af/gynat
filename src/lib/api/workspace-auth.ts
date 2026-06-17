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
 * Authenticates the user and verifies collection-editing permission.
 * Allows workspace admins (implicit) or members with collection_editor.
 * Mirrors requireTreeEditor. Collection VISIBILITY changes stay admin-only —
 * gate those with requireWorkspaceAdmin, not this helper.
 */
export async function requireCollectionEditor(
  request: NextRequest,
  workspaceId: string,
): Promise<WorkspaceAuthResult | NextResponse> {
  const result = await requireWorkspaceMember(request, workspaceId);

  if (result instanceof NextResponse) {
    return result;
  }

  if (
    result.membership.role === 'workspace_admin' ||
    result.membership.permissions.includes('collection_editor')
  ) {
    return result;
  }

  return NextResponse.json(
    { error: 'ليس لديك صلاحية تعديل المجموعات' },
    { status: 403 },
  );
}

/**
 * Feature gate: returns a 404 NextResponse when the workspace has
 * `enableCollections` off (deny-by-default — collections must be invisible,
 * not "403 forbidden", when the feature is disabled), or null to proceed.
 * Route handlers call this FIRST, before the auth guard: when collections are
 * off the route behaves as if it doesn't exist — even a non-member gets 404,
 * never a 403 that would reveal the workspace.
 */
export async function requireCollectionsEnabled(
  workspaceId: string,
): Promise<NextResponse | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableCollections: true },
  });

  if (!workspace || !workspace.enableCollections) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return null;
}

/**
 * Type guard to check if a guard result is an error `NextResponse`. Generic so
 * it narrows any `T | NextResponse` (auth guards, tree resolvers, …) to its
 * non-error branch — the runtime check (`instanceof NextResponse`) is unchanged.
 */
export function isErrorResponse<T>(
  result: T | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
