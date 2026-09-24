/**
 * Sources («المصادر») — small helpers shared by the source-entry routes.
 *
 * Mirrors `ancestry-jump-route-helpers.ts`: a hand-listed plaintext DTO (the
 * `text` column is `Bytes` and never leaves the server), one 404, and the
 * viewer/tree resolution every route repeats.
 *
 * NOTE — no `touchTreeTimestamp` in any source route. Sources are NOT part of
 * the tree GET payload (`GedcomData`), so a source-only change must not bump
 * `FamilyTree.lastModifiedAt`: that would needlessly invalidate every cached
 * tree (ETag) for a change the tree payload cannot reflect.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { decryptSourceEntryRow } from '@/lib/tree/encryption';
import type { SourceViewer, SourceVisibilityLevel } from '@/lib/tree/source-visibility';

/** The shape every source route returns. `text` is ALWAYS plaintext. */
export interface SourceEntryDto {
  id: string;
  individualId: string | null;
  text: string | null;
  visibility: SourceVisibilityLevel;
  createdAt: string;
  updatedAt: string;
}

/** Columns every route selects — never the file tables. */
export const SOURCE_ENTRY_SELECT = {
  id: true,
  treeId: true,
  individualId: true,
  visibility: true,
  text: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface SourceEntryRow {
  id: string;
  treeId: string;
  individualId: string | null;
  visibility: SourceVisibilityLevel;
  text: Uint8Array | Buffer | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Build the response DTO from a row plus the PLAINTEXT text the caller already
 * holds. The row's own `text` is a `Bytes` column and is deliberately not read.
 */
export function sourceEntryDto(
  row: Pick<SourceEntryRow, 'id' | 'individualId' | 'visibility' | 'createdAt' | 'updatedAt'>,
  text: string | null,
): SourceEntryDto {
  return {
    id: row.id,
    individualId: row.individualId ?? null,
    text: text ?? null,
    visibility: row.visibility,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Decrypt a row's `text` column (null stays null). */
export function decryptEntryText(
  row: { text: Uint8Array | Buffer | null },
  key: Buffer,
): string | null {
  return (decryptSourceEntryRow({ text: row.text }, key) as unknown as { text: string | null }).text;
}

// ---------------------------------------------------------------------------
// 404 / ids
// ---------------------------------------------------------------------------

export const SOURCE_NOT_FOUND_MESSAGE = 'غير موجود';

/**
 * The ONE "not visible" answer: nonexistent, malformed, other tree, other
 * workspace and gated-out all read identically.
 */
export function sourceNotFound(): NextResponse {
  return NextResponse.json({ error: SOURCE_NOT_FOUND_MESSAGE }, { status: 404 });
}

const uuidSchema = z.string().uuid();

/** Path ids reach Prisma against `@db.Uuid` columns; check the shape first. */
export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}

/** Sources are per-viewer: never cached by a browser or a proxy, no ETag. */
export const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

// ---------------------------------------------------------------------------
// Viewer / permissions
// ---------------------------------------------------------------------------

export function isWorkspaceAdmin(membership: { role: string }): boolean {
  return membership.role === 'workspace_admin';
}

/** admin = workspace_admin of the workspace that owns the tree; else member. */
export function viewerFor(membership: { role: string }): SourceViewer {
  return { kind: isWorkspaceAdmin(membership) ? 'admin' : 'member' };
}

export const ADMIN_ONLY_VISIBILITY_MESSAGE = 'تغيير من يرى المصدر متاح للمشرفين فقط';

export function adminOnlyVisibility(): NextResponse {
  return NextResponse.json({ error: ADMIN_ONLY_VISIBILITY_MESSAGE }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Tree resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the tree a source route targets — the same scoping as
 * `resolveTargetTreeOr404` (`{ id, workspaceId, kind: main|extra }`, absent
 * `treeId` → the workspace main tree) but it selects ONLY the id. The shared
 * resolver loads the whole tree (every individual and family), which a
 * per-person sources call has no use for. A missing main tree is a 404 here
 * rather than lazily created: a source always hangs off an existing tree.
 * A malformed `treeId` answers the same 404 as a foreign one.
 */
export async function resolveSourceTreeOr404(
  workspaceId: string,
  treeId: string | null | undefined,
): Promise<{ id: string } | NextResponse> {
  if (treeId !== undefined && treeId !== null && !isUuid(treeId)) return treeNotFound();
  const tree = treeId
    ? await prisma.familyTree.findFirst({
        where: { id: treeId, workspaceId, kind: { in: ['main', 'extra'] } },
        select: { id: true },
      })
    : await prisma.familyTree.findFirst({
        where: { workspaceId, kind: 'main' },
        select: { id: true },
      });
  if (!tree) return treeNotFound();
  return { id: tree.id };
}

function treeNotFound(): NextResponse {
  return NextResponse.json({ error: 'الشجرة غير موجودة' }, { status: 404 });
}

/** True when a Prisma error is a unique-index violation (tree-wide entry race). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/** Display name from a DECRYPTED individual, as the tree mapper builds it. */
export function individualDisplayName(ind: {
  givenName: string | null;
  surname: string | null;
  fullName: string | null;
}): string {
  if (ind.givenName) return ind.surname ? `${ind.givenName} ${ind.surname}` : ind.givenName;
  return ind.fullName ?? '';
}
