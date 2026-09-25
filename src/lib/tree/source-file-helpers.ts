/**
 * Sources («المصادر») step 5 — server helpers shared by the file routes and
 * the entry routes that attach files.
 *
 * UPLOAD DESIGN (staged uploads):
 * 1. The client uploads each file on its own: `POST sources/uploads?treeId=`
 *    (one file per request). The file is validated, re-encoded, encrypted and
 *    stored as a STAGED `SourceFile` — `entryId` null, owned by the uploader.
 * 2. The entry create (`POST individuals/[id]/sources`), edit
 *    (`PATCH sources/[entryId]`) or tree-entry upsert (`PUT sources/tree-entry`)
 *    sends `fileIds` to attach those staged files, in the same transaction as
 *    the entry write. Only the uploader's own staged files of the same tree
 *    attach; anything else fails the whole request with one generic message.
 * 3. Staged files nobody attached within 24 h are deleted by a lazy sweep that
 *    runs at each upload (indexed on staged rows only).
 *
 * A staged file is never served: the serve route matches a file by its entry,
 * and a staged file has none. An entry never ends with neither text nor
 * files: create/PATCH/PUT check it, and deleting an entry's last file of a
 * text-less entry deletes the entry.
 */
import { NextResponse } from 'next/server';
import type { Prisma } from '../../../generated/prisma/client';
import { encryptField, decryptField } from '@/lib/crypto/workspace-encryption';
import { MAX_FILES_PER_ENTRY } from '@/lib/tree/source-entry-schemas';
import {
  MAX_SOURCE_FILE_BYTES,
  FILE_TOO_LARGE_MESSAGE,
  type SourceFileMime,
} from '@/lib/tree/source-file-types';

export { MAX_FILES_PER_ENTRY };

/** A staged upload older than this is abandoned and swept. */
export const STAGED_FILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Largest request body accepted by the upload route: one 8 MB file plus
 * multipart overhead (boundaries, headers, the file name). Stays under the
 * 10 MB body buffer of the Next middleware.
 */
export const MAX_UPLOAD_BODY_BYTES = MAX_SOURCE_FILE_BYTES + 64 * 1024;

export const QUOTA_EXCEEDED_MESSAGE =
  'امتلأت مساحة التخزين المخصّصة لمساحة العائلة، فلا يمكن رفع ملفات أخرى';
export const TOO_MANY_FILES_MESSAGE = `لا يمكن إرفاق أكثر من ${MAX_FILES_PER_ENTRY} ملفًا بالمصدر الواحد`;
export const STAGED_FILES_UNAVAILABLE_MESSAGE = 'بعض الملفات لم تعد متاحة، أعد رفعها ثم احفظ';
export const ENTRY_NEEDS_TEXT_OR_FILES_MESSAGE = 'لا يمكن ترك المصدر بلا نص ولا ملفات';

/** The file-metadata DTO. `fileName` is plaintext; never bytes. */
export interface SourceFileDto {
  id: string;
  mimeType: SourceFileMime;
  sizeBytes: number;
  fileName: string;
}

/** File METADATA columns — never the `SourceFileData` bytes. */
export const SOURCE_FILE_META_SELECT = {
  id: true,
  mimeType: true,
  sizeBytes: true,
  fileName: true,
} as const;

export interface SourceFileMetaRow {
  id: string;
  mimeType: string;
  sizeBytes: number;
  fileName: Uint8Array | Buffer;
}

export function encryptFileName(name: string, key: Buffer): Buffer {
  return encryptField(name, key);
}

export function decryptFileName(value: Uint8Array | Buffer, key: Buffer): string {
  return decryptField(Buffer.isBuffer(value) ? value : Buffer.from(value), key);
}

export function sourceFileDto(row: SourceFileMetaRow, key: Buffer): SourceFileDto {
  return {
    id: row.id,
    mimeType: row.mimeType as SourceFileMime,
    sizeBytes: row.sizeBytes,
    fileName: decryptFileName(row.fileName, key),
  };
}

export function sourceFileDtos(rows: readonly SourceFileMetaRow[] | undefined, key: Buffer): SourceFileDto[] {
  return (rows ?? []).map((r) => sourceFileDto(r, key));
}

// ---------------------------------------------------------------------------
// Errors that abort a transaction and become a response
// ---------------------------------------------------------------------------

export class SourceFileRequestError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'SourceFileRequestError';
  }
}

export function sourceFileErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SourceFileRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Staged-file sweep and attach
// ---------------------------------------------------------------------------

type Db = Pick<Prisma.TransactionClient, 'sourceFile'>;

/** Delete staged uploads nobody attached within the TTL. Global and cheap (partial index). */
export async function sweepStagedSourceFiles(db: Db, now: Date = new Date()): Promise<number> {
  const { count } = await db.sourceFile.deleteMany({
    where: { entryId: null, createdAt: { lt: new Date(now.getTime() - STAGED_FILE_TTL_MS) } },
  });
  return count;
}

/**
 * Attach the caller's own staged files to an entry, inside the caller's
 * transaction. Refuses (whole request) when any id is not a fresh staged file
 * of this user in this tree, or when the entry would exceed the per-entry cap.
 * The entry row is locked so two concurrent attaches cannot pass the cap.
 */
export async function attachStagedFiles(
  tx: Pick<Prisma.TransactionClient, 'sourceFile' | '$queryRaw'>,
  args: { entryId: string; treeId: string; userId: string; fileIds: readonly string[] | undefined },
  now: Date = new Date(),
): Promise<SourceFileMetaRow[]> {
  const ids = [...new Set(args.fileIds ?? [])];
  if (ids.length === 0) return [];

  await tx.$queryRaw`SELECT 1 FROM source_entries WHERE id = ${args.entryId}::uuid FOR UPDATE`;

  const existing = await tx.sourceFile.count({ where: { entryId: args.entryId } });
  if (existing + ids.length > MAX_FILES_PER_ENTRY) {
    throw new SourceFileRequestError(TOO_MANY_FILES_MESSAGE, 400);
  }

  const where = {
    id: { in: ids },
    entryId: null,
    treeId: args.treeId,
    createdById: args.userId,
    createdAt: { gte: new Date(now.getTime() - STAGED_FILE_TTL_MS) },
  };
  const { count } = await tx.sourceFile.updateMany({ where, data: { entryId: args.entryId } });
  if (count !== ids.length) {
    throw new SourceFileRequestError(STAGED_FILES_UNAVAILABLE_MESSAGE, 400);
  }

  return (await tx.sourceFile.findMany({
    where: { id: { in: ids }, entryId: args.entryId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: SOURCE_FILE_META_SELECT,
  })) as SourceFileMetaRow[];
}

/** Metadata-only audit payload for attached / removed files. */
export function fileAuditMeta(rows: readonly { mimeType: string; sizeBytes: number }[]) {
  return rows.map((r) => ({ mimeType: r.mimeType, sizeBytes: r.sizeBytes }));
}

// ---------------------------------------------------------------------------
// Reading one uploaded file from a multipart request
// ---------------------------------------------------------------------------

export const NO_FILE_MESSAGE = 'أرفق ملفًا واحدًا';
export const LENGTH_REQUIRED_MESSAGE = 'تعذّر تحديد حجم الطلب';

function tooLarge(): NextResponse {
  return NextResponse.json({ error: FILE_TOO_LARGE_MESSAGE }, { status: 413 });
}

/**
 * Read exactly one file from a multipart request, never buffering more than
 * `MAX_UPLOAD_BODY_BYTES`:
 * 1. `Content-Length` must be present and within the cap — checked BEFORE a
 *    single body byte is read (no `request.formData()` on a huge body).
 * 2. The body is then read as a stream with the same cap, so a lying
 *    Content-Length cannot smuggle more.
 * 3. The file's REAL byte length is checked (never the client's `file.size`).
 */
export async function readSingleUploadedFile(
  request: Request,
): Promise<{ bytes: Buffer; name: string } | NextResponse> {
  const declared = request.headers.get('content-length');
  const length = declared !== null && /^\d+$/.test(declared.trim()) ? Number(declared) : NaN;
  if (!Number.isFinite(length)) {
    return NextResponse.json({ error: LENGTH_REQUIRED_MESSAGE }, { status: 411 });
  }
  if (length > MAX_UPLOAD_BODY_BYTES) return tooLarge();

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !request.body) {
    return NextResponse.json({ error: NO_FILE_MESSAGE }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return tooLarge();
    }
    chunks.push(value);
  }

  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    return NextResponse.json({ error: NO_FILE_MESSAGE }, { status: 400 });
  }

  const uploaded = [...form.values()].filter((v): v is File => typeof v !== 'string');
  if (uploaded.length !== 1) return NextResponse.json({ error: NO_FILE_MESSAGE }, { status: 400 });

  const bytes = Buffer.from(await uploaded[0].arrayBuffer());
  if (bytes.length > MAX_SOURCE_FILE_BYTES) return tooLarge();
  return { bytes, name: uploaded[0].name ?? '' };
}
