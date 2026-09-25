/**
 * Sources («المصادر») — the ANONYMOUS public read path (step 7).
 *
 * Deny-by-default and separate from the member routes. A public visitor sees
 * a source entry only when:
 *   - the tree is published (`loadPublicTreeBySlug` — the SAME loader the
 *     public tree serve uses: main trees, and extra trees only with
 *     Collections on), AND
 *   - the person is "publicly shown": present in the SAME redacted public
 *     payload the tree serve builds (`buildPublicTreePayload`), one of the
 *     HOME tree's own people (never a borrowed node) and `publicDisplay ===
 *     'full'` (a private person is `redacted`, a presumed-living person is
 *     `living` — both stay hidden together with their entries), AND
 *   - the ONE gate (`source-visibility.ts`) passes with viewer `public`.
 *
 * Everything else reads as ONE 404 (`publicSourceNotFound`). Sources never
 * enter the public tree payload, the names list, OG, the sitemap or JSON-LD —
 * they are fetched only through these routes.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptBytes } from '@/lib/crypto/workspace-encryption';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { loadPublicTreeBySlug, buildPublicTreePayload, type PublicTreeRecord } from '@/lib/tree/public-serve';
import {
  canViewSourceEntry,
  filterEntriesForViewer,
  inheritedTreeEntry,
  type SourcePersonContext,
  type SourceViewer,
  type SourceVisibilityLevel,
} from '@/lib/tree/source-visibility';
import {
  SOURCE_ENTRY_WITH_FILES_SELECT,
  decryptEntryText,
  isUuid,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import { decryptFileName, sourceFileDtos, type SourceFileDto } from '@/lib/tree/source-file-helpers';
import { contentDispositionFor } from '@/lib/tree/source-file-processing';
import { isSourceFileMime, type SourceFileMime } from '@/lib/tree/source-file-types';

const PUBLIC_VIEWER: SourceViewer = { kind: 'public' };

/** Anonymous source responses: never cached anywhere, never indexed. */
export const PUBLIC_SOURCE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
} as const;

/** The ONE public "not visible" answer — same body as the public tree 404. */
export function publicSourceNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PUBLIC_SOURCE_HEADERS });
}

/** The public DTO: text + file metadata. No level, creator, timestamps or ids of people. */
export interface PublicSourceEntryDto {
  id: string;
  text: string | null;
  files: SourceFileDto[];
}

export interface PublicPersonSources {
  entries: PublicSourceEntryDto[];
  inherited: PublicSourceEntryDto | null;
}

const MAX_SLUG_LENGTH = 200;

async function loadRecord(slug: string): Promise<PublicTreeRecord | null> {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return null;
  return loadPublicTreeBySlug(slug);
}

/**
 * The published tree + the person's gate context, or null when the person is
 * not publicly shown. `publicShown` is derived from the public payload itself
 * (never a re-implemented living rule); `isPrivate` from the DB row as well
 * (defense in depth — both must agree the person is public).
 */
async function resolveShownPerson(
  slug: string,
  individualId: string,
): Promise<{ record: PublicTreeRecord; person: SourcePersonContext } | null> {
  if (!isUuid(individualId)) return null;
  const record = await loadRecord(slug);
  if (!record) return null;

  const payload = await buildPublicTreePayload(record);
  const shown = payload.data.individuals[individualId];
  if (!shown || shown.publicDisplay !== 'full') return null;
  if (!payload.homeIndividualIds.has(individualId)) return null;

  const row = await prisma.individual.findFirst({
    where: { id: individualId, treeId: record.treeId },
    select: { id: true, isPrivate: true },
  });
  if (!row) return null;

  return { record, person: { isPrivate: row.isPrivate, pointed: false, publicShown: true } };
}

function toPublicDto(row: SourceEntryRow, key: Buffer): PublicSourceEntryDto {
  return { id: row.id, text: decryptEntryText(row, key), files: sourceFileDtos(row.files, key) };
}

/** A shown person's public entries + the inherited tree-wide entry, or null (→ 404). */
export async function loadPublicPersonSources(
  slug: string,
  individualId: string,
): Promise<PublicPersonSources | null> {
  const resolved = await resolveShownPerson(slug, individualId);
  if (!resolved) return null;
  const { record, person } = resolved;

  const [ownRows, treeRow] = await Promise.all([
    prisma.sourceEntry.findMany({
      where: { treeId: record.treeId, individualId, visibility: 'public' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SOURCE_ENTRY_WITH_FILES_SELECT,
    }) as unknown as Promise<SourceEntryRow[]>,
    prisma.sourceEntry.findFirst({
      where: { treeId: record.treeId, individualId: null },
      select: SOURCE_ENTRY_WITH_FILES_SELECT,
    }) as unknown as Promise<SourceEntryRow | null>,
  ]);

  // Gate FIRST (the query's level filter is only an optimisation), decrypt
  // only what passed.
  const visible = filterEntriesForViewer(ownRows, person, PUBLIC_VIEWER);
  const inherited = inheritedTreeEntry(ownRows, treeRow, person, PUBLIC_VIEWER);
  if (visible.length === 0 && !inherited) return { entries: [], inherited: null };

  const key = await getWorkspaceKey(record.workspaceId);
  return {
    entries: visible.map((row) => toPublicDto(row, key)),
    inherited: inherited ? toPublicDto(inherited, key) : null,
  };
}

interface FileRow {
  id: string;
  mimeType: string;
  fileName: Uint8Array | Buffer;
  entry: { id: string; individualId: string | null; visibility: SourceVisibilityLevel } | null;
}

export interface PublicSourceFile {
  bytes: Buffer;
  mimeType: SourceFileMime;
  fileName: string;
}

/** Bytes are read and decrypted ONLY after every check passed. */
async function readFile(record: PublicTreeRecord, file: FileRow): Promise<PublicSourceFile | null> {
  if (!isSourceFileMime(file.mimeType)) return null;
  const stored = await prisma.sourceFileData.findUnique({ where: { fileId: file.id }, select: { data: true } });
  if (!stored) return null;
  const key = await getWorkspaceKey(record.workspaceId);
  return {
    bytes: decryptBytes(Buffer.from(stored.data), key),
    mimeType: file.mimeType,
    fileName: decryptFileName(file.fileName, key),
  };
}

const FILE_SELECT = {
  id: true,
  mimeType: true,
  fileName: true,
  entry: { select: { id: true, individualId: true, visibility: true } },
} as const;

/** One file of a shown person's own entry — single scoped lookup, then the gate. */
export async function loadPublicPersonSourceFile(
  slug: string,
  individualId: string,
  entryId: string,
  fileId: string,
): Promise<PublicSourceFile | null> {
  if (!isUuid(entryId) || !isUuid(fileId)) return null;
  const resolved = await resolveShownPerson(slug, individualId);
  if (!resolved) return null;
  const { record, person } = resolved;

  const file = (await prisma.sourceFile.findFirst({
    where: { id: fileId, entryId, treeId: record.treeId, entry: { treeId: record.treeId, individualId } },
    select: FILE_SELECT,
  })) as FileRow | null;
  if (!file?.entry || file.entry.individualId !== individualId) return null;
  if (!canViewSourceEntry(file.entry, person, PUBLIC_VIEWER)) return null;
  return readFile(record, file);
}

/** One file of the tree-wide entry, only when that entry itself is public-level. */
export async function loadPublicTreeEntryFile(slug: string, fileId: string): Promise<PublicSourceFile | null> {
  if (!isUuid(fileId)) return null;
  const record = await loadRecord(slug);
  if (!record) return null;

  const file = (await prisma.sourceFile.findFirst({
    where: { id: fileId, treeId: record.treeId, entry: { treeId: record.treeId, individualId: null } },
    select: FILE_SELECT,
  })) as FileRow | null;
  if (!file?.entry || file.entry.individualId !== null) return null;
  if (!canViewSourceEntry(file.entry, null, PUBLIC_VIEWER)) return null;
  return readFile(record, file);
}

/** Same hardened headers as the member file route, plus noindex. */
export function publicSourceFileResponse(file: PublicSourceFile): NextResponse {
  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.bytes.length),
      'Content-Disposition': contentDispositionFor(file.mimeType, file.fileName),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...PUBLIC_SOURCE_HEADERS,
    },
  });
}
