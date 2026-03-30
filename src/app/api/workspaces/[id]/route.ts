import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { serializeBigInt } from '@/lib/api/serialize';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

const updateWorkspaceSchema = z.object({
  nameAr: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().nullable().optional(),
  enableUmmWalad: z.boolean().optional(),
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

  const parsed = await parseValidatedBody(request, updateWorkspaceSchema);
  if (isParseError(parsed)) return parsed;

  const workspace = await prisma.workspace.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: serializeBigInt(workspace) });
}
