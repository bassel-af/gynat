import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth';
import { getOrCreateTree } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/tree — Get workspace family tree data
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tree = await getOrCreateTree(workspaceId);
  const gedcomData = dbTreeToGedcomData(tree);

  return NextResponse.json({ data: gedcomData });
}
