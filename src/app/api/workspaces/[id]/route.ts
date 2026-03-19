import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { serializeBigInt } from '@/lib/api/serialize';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string }> };

const updateWorkspaceSchema = z.object({
  nameAr: z.string().min(1).optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

// GET /api/workspaces/[id] — Get workspace details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireWorkspaceMember(request, id);
  if (isErrorResponse(result)) return result;

  const workspace = await prisma.workspace.findUnique({
    where: { id },
  });

  const memberCount = await prisma.workspaceMembership.count({
    where: { workspaceId: id },
  });

  return NextResponse.json({
    data: serializeBigInt({ ...workspace, memberCount }),
  });
}

// PATCH /api/workspaces/[id] — Update workspace settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireWorkspaceAdmin(request, id);
  if (isErrorResponse(result)) return result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: serializeBigInt(workspace) });
}
