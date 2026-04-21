import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { serializeBigInt } from '@/lib/api/serialize';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { logAdminAccess } from '@/lib/audit/admin-access';

type RouteParams = { params: Promise<{ id: string }> };

const updateWorkspaceSchema = z.object({
  nameAr: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().nullable().optional(),
  enableUmmWalad: z.boolean().optional(),
  enableRadaa: z.boolean().optional(),
  enableKunya: z.boolean().optional(),
  enableAuditLog: z.boolean().optional(),
  enableVersionControl: z.boolean().optional(),
  enableTreeExport: z.boolean().optional(),
  allowMemberExport: z.boolean().optional(),
  hideBirthDateForFemale: z.boolean().optional(),
  hideBirthDateForMale: z.boolean().optional(),
  defaultNewPersonDeceased: z.boolean().optional(),
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

  // Dependency: enableVersionControl requires enableAuditLog
  if (parsed.data.enableAuditLog === false) {
    parsed.data.enableVersionControl = false;
  }
  if (parsed.data.enableVersionControl === true) {
    const currentWorkspace = await prisma.workspace.findUnique({
      where: { id },
      select: { enableAuditLog: true },
    });
    const effectiveAuditLog = parsed.data.enableAuditLog ?? currentWorkspace?.enableAuditLog ?? false;
    if (!effectiveAuditLog) {
      return NextResponse.json(
        { error: 'يجب تفعيل سجل التعديلات أولاً قبل تفعيل التحكم بالإصدارات' },
        { status: 400 },
      );
    }
  }

  // Dependency: allowMemberExport requires enableTreeExport
  if (parsed.data.enableTreeExport === false) {
    parsed.data.allowMemberExport = false;
  }
  if (parsed.data.allowMemberExport === true) {
    const currentWorkspace = await prisma.workspace.findUnique({
      where: { id },
      select: { enableTreeExport: true },
    });
    const effectiveExport = parsed.data.enableTreeExport ?? currentWorkspace?.enableTreeExport ?? true;
    if (!effectiveExport) {
      return NextResponse.json(
        { error: 'يجب تفعيل تصدير الشجرة أولاً قبل السماح للأعضاء' },
        { status: 400 },
      );
    }
  }

  // Snapshot privacy-sensitive export toggles so we can emit an admin access
  // log entry per field that actually flipped (security review M1).
  // NOTE: existing privacy-sensitive toggles (enableAuditLog, enableKunya,
  // hideBirthDateFor*) are NOT audited today — this PR closes the gap only
  // for the two new export fields; the wider gap is flagged for follow-up.
  const AUDITED_FIELDS = ['enableTreeExport', 'allowMemberExport'] as const;
  const touchesAuditedField = AUDITED_FIELDS.some((f) => f in parsed.data);
  const before = touchesAuditedField
    ? await prisma.workspace.findUnique({
        where: { id },
        select: { enableTreeExport: true, allowMemberExport: true },
      })
    : null;

  const workspace = await prisma.workspace.update({
    where: { id },
    data: parsed.data,
  });

  if (before) {
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      null;
    const userAgent = request.headers.get('user-agent') ?? null;

    for (const field of AUDITED_FIELDS) {
      const oldValue = before[field];
      const newValue = workspace[field];
      if (oldValue === newValue) continue;
      // Best-effort; logAdminAccess never throws.
      await logAdminAccess({
        userId: result.user.id,
        action: 'workspace_setting_change',
        workspaceId: id,
        entityType: 'workspace',
        entityId: id,
        reason: `${field}: ${oldValue} -> ${newValue}`,
        ipAddress,
        userAgent,
      });
    }
  }

  return NextResponse.json({ data: serializeBigInt(workspace) });
}
