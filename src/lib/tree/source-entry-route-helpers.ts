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
import {
  canViewSourceEntry,
  type SourcePersonContext,
  type SourceViewer,
  type SourceVisibilityLevel,
} from '@/lib/tree/source-visibility';
import {
  SOURCE_FILE_META_SELECT,
  type SourceFileDto,
  type SourceFileMetaRow,
} from '@/lib/tree/source-file-helpers';

/** The shape every source route returns. `text` is ALWAYS plaintext. */
export interface SourceEntryDto {
  id: string;
  /**
   * The person this source was read through (person routes), else its first
   * linked person THE VIEWER MAY SEE IT ON (`visibleIndividualId`) — never a
   * private person to a non-admin; null for the tree-wide source, a source
   * linked to nobody, or one with no link that passes the viewer's gate. Kept
   * for today's one-person clients until the shared-source DTOs (rework R2)
   * replace it.
   */
  individualId: string | null;
  text: string | null;
  visibility: SourceVisibilityLevel;
  createdAt: string;
  updatedAt: string;
  /** File metadata (plaintext names), oldest first. Never bytes. */
  files: SourceFileDto[];
}

/**
 * A source's links, oldest first, with each person's privacy flag — what the
 * gate needs (`linkedPeople`). Never names: those are decrypted only where a
 * route shows them.
 */
export const SOURCE_LINKS_SELECT = {
  select: { individualId: true, individual: { select: { isPrivate: true } } },
  orderBy: [{ createdAt: 'asc' as const }, { individualId: 'asc' as const }],
};

/** Columns every route selects — never the file tables. */
export const SOURCE_ENTRY_SELECT = {
  id: true,
  treeId: true,
  isTreeWide: true,
  visibility: true,
  text: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  links: SOURCE_LINKS_SELECT,
} as const;

/**
 * `SOURCE_ENTRY_SELECT` plus the entry's file METADATA (never
 * `SourceFileData`) — for routes that return entries to a viewer.
 */
export const SOURCE_ENTRY_WITH_FILES_SELECT = {
  ...SOURCE_ENTRY_SELECT,
  files: {
    select: SOURCE_FILE_META_SELECT,
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
};

export interface SourceLinkRow {
  individualId: string;
  individual?: { isPrivate: boolean } | null;
}

export interface SourceEntryRow {
  id: string;
  treeId: string;
  isTreeWide: boolean;
  visibility: SourceVisibilityLevel;
  text: Uint8Array | Buffer | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Present only when selected with `SOURCE_ENTRY_WITH_FILES_SELECT`. */
  files?: SourceFileMetaRow[];
  /** Present when selected with `SOURCE_ENTRY_SELECT` (oldest link first). */
  links?: SourceLinkRow[];
}

/**
 * The gate context of every linked person. A link whose person row did not
 * come back counts as PRIVATE (fail-closed).
 */
export function linkedPeople(row: { links?: SourceLinkRow[] }): (SourcePersonContext & { id: string })[] {
  return (row.links ?? []).map((l) => ({
    id: l.individualId,
    isPrivate: l.individual?.isPrivate ?? true,
  }));
}

/** The first linked person's id, or null (tree-wide source / linked to nobody). */
export function primaryIndividualId(row: { links?: SourceLinkRow[] }): string | null {
  return row.links?.[0]?.individualId ?? null;
}

/**
 * The first linked person this viewer may see the source on, or null. With no
 * viewer it applies the non-admin gate (fail-closed: never a private person).
 */
export function visibleIndividualId(
  row: { visibility: SourceVisibilityLevel; links?: SourceLinkRow[] },
  viewer: SourceViewer = { kind: 'member' },
): string | null {
  return linkedPeople(row).find((p) => canViewSourceEntry(row, p, viewer))?.id ?? null;
}

/**
 * Build the response DTO from a row plus the PLAINTEXT text the caller already
 * holds. The row's own `text` is a `Bytes` column and is deliberately not read.
 */
export function sourceEntryDto(
  row: Pick<SourceEntryRow, 'id' | 'visibility' | 'createdAt' | 'updatedAt' | 'links'>,
  text: string | null,
  files: SourceFileDto[] = [],
  individualId: string | null = visibleIndividualId(row),
): SourceEntryDto {
  return {
    id: row.id,
    individualId,
    text: text ?? null,
    visibility: row.visibility,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    files,
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

/**
 * The creator bypass for DELETING a source (or one of its files) the viewer
 * cannot see. A non-admin editor's own source sits at «المشرفون فقط», hidden
 * from them; without a bypass undoing their own create would always fail.
 *
 * Rule (state-based — the undo header is client-controlled, so it cannot be
 * the gate): the bypass holds ONLY while the source is still exactly as a
 * non-admin could have left it — they wrote it, it is still at `admins`,
 * every link was made by them to a person who is not private, and every file
 * was uploaded by them. Once an admin takes it over (links someone, links a
 * private person, adds a file), the writer can no longer delete it.
 * Fail-closed: a missing author or person row blocks the bypass.
 */
export function creatorMayDeleteHidden(
  entry: {
    createdById: string | null;
    visibility: SourceVisibilityLevel;
    links?: readonly { createdById?: string | null; individual?: { isPrivate: boolean } | null }[];
    files?: readonly { createdById?: string | null }[];
  },
  userId: string,
): boolean {
  if (entry.createdById !== userId || entry.visibility !== 'admins') return false;
  const linksOk = (entry.links ?? []).every(
    (l) => l.createdById === userId && l.individual?.isPrivate === false,
  );
  const filesOk = (entry.files ?? []).every((f) => f.createdById === userId);
  return linksOk && filesOk;
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
