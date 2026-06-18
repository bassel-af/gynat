import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api/auth';
import { workspaceCreateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { serializeBigInt } from '@/lib/api/serialize';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { generateWorkspaceKey, wrapKey } from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';

const createWorkspaceSchema = z.object({
  slug: z.string().max(64).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  nameAr: z.string().min(1, 'Arabic name is required').max(200),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
});

// POST /api/workspaces — Create workspace
export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { allowed, retryAfterSeconds } = workspaceCreateLimiter.check(user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createWorkspaceSchema);
  if (isParseError(parsed)) return parsed;

  // Per-user workspace creation limit — count only workspaces the user owns (is admin of),
  // not all memberships, so being invited to workspaces doesn't block creating new ones
  const workspaceCount = await prisma.workspaceMembership.count({
    where: { userId: user.id, role: 'workspace_admin' },
  });
  const maxWorkspaces = process.env.NODE_ENV === 'development' ? 50 : 10;
  if (workspaceCount >= maxWorkspaces) {
    return NextResponse.json(
      { error: 'لقد وصلت إلى الحد الأقصى لعدد مساحات العائلة' },
      { status: 403 },
    );
  }

  const { slug, nameAr, description, logoUrl } = parsed.data;

  // Phase 10b: generate a fresh per-workspace data key and wrap it with the
  // master key BEFORE opening the transaction. This keeps the crypto work
  // outside the DB transaction (no point holding a row lock while we call
  // randomBytes), and guarantees every new workspace ships with a usable key.
  const plaintextKey = generateWorkspaceKey();
  const encryptedKey = wrapKey(plaintextKey, getMasterKey());

  try {
    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        // Cast via unknown — Prisma Bytes type is Uint8Array<ArrayBuffer>
        // while Node Buffer is a subclass with ArrayBufferLike.
        data: {
          slug,
          nameAr,
          description: description ?? null,
          logoUrl: logoUrl ?? null,
          createdById: user.id,
          encryptedKey,
        } as unknown as Parameters<typeof tx.workspace.create>[0]['data'],
      });

      await tx.workspaceMembership.create({
        data: {
          userId: user.id,
          workspaceId: ws.id,
          role: 'workspace_admin',
        },
      });

      return ws;
    });

    return NextResponse.json({ data: serializeBigInt(workspace) }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: 'A workspace with this slug already exists' }, { status: 409 });
    }
    console.error('Workspace creation failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/workspaces — List user's workspaces
export async function GET(request: NextRequest) {
  const { user, error: authError } = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });

  return NextResponse.json({
    data: serializeBigInt(memberships.map((m) => ({
      role: m.role,
      workspace: m.workspace,
    }))),
  });
}
