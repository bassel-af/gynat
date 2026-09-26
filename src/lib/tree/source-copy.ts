/**
 * Sources («المصادر») step 8 — carry sources into a copied tree.
 *
 * The ONE helper every copy path calls, inside its own transaction, right
 * after `persistDeepCopy` (the copied people must exist for the link FKs).
 * The companion of `copyAncestryJumps`: a source travels only with a person
 * or tree that travels.
 *
 * - `same` (whole-tree copy inside one workspace): every source, incl. ones
 *   linked to nobody; links to every landed person; ciphertext copied as-is
 *   (one key).
 * - `cross` (a copy into another family's workspace): only level-3
 *   («public») sources; only links to landed people the public tree SHOWS
 *   (not private AND not presumed living — `isLinkedPersonShown`, the same
 *   rule as the public serve; birth date read with the SOURCE key); a
 *   source left with no such link is not copied (no orphans in another
 *   family); text, file names and bytes re-encrypted under the target key;
 *   no user id of the source family is carried.
 * - The tree-wide source travels only when `includeTreeWide` (whole-tree
 *   copies) — a branch copy never carries it.
 * - Staged (unattached) files are never read: files come only through their
 *   source.
 * - The TARGET workspace quota never blocks a copy: a file that does not fit
 *   is skipped and counted; a text-less source that keeps no file is dropped.
 */
import crypto from 'crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { encryptBytes, decryptBytes } from '@/lib/crypto/workspace-encryption';
import { isLinkedPersonShown } from '@/lib/tree/source-link-shown';

export type SourceCopyMode =
  | { kind: 'same' }
  | { kind: 'cross'; sourceKey: Buffer; targetKey: Buffer };

export interface CopySourcesInput {
  fromTreeId: string;
  toTreeId: string;
  targetWorkspaceId: string;
  /** Old individual id → new id, for every person that landed in the copy. */
  idMap: ReadonlyMap<string, string>;
  mode: SourceCopyMode;
  /** Whole-tree copies only. */
  includeTreeWide: boolean;
}

export interface CopySourcesResult {
  /** Files left out because they did not fit the target workspace quota. */
  skippedSourceFiles: number;
}

/**
 * Interactive-transaction timeout for a copy that carries source files
 * (Prisma's 5 s default is too short for several 8 MB files).
 */
export const SOURCE_COPY_TX_TIMEOUT_MS = 60_000;

type CopySourcesTx = Pick<
  Prisma.TransactionClient,
  'sourceEntry' | 'sourceLink' | 'sourceFile' | 'sourceFileData' | 'workspace' | '$queryRaw'
>;

type Bytes = Uint8Array | Buffer;

export async function copySources(
  tx: CopySourcesTx,
  input: CopySourcesInput,
): Promise<CopySourcesResult> {
  const { mode, idMap } = input;
  const cross = mode.kind === 'cross';

  const rows = await tx.sourceEntry.findMany({
    where: {
      treeId: input.fromTreeId,
      ...(cross ? { visibility: 'public' as const } : {}),
      ...(input.includeTreeWide ? {} : { isTreeWide: false }),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      isTreeWide: true,
      visibility: true,
      text: true,
      createdById: true,
      createdAt: true,
      links: {
        select: {
          individualId: true,
          createdById: true,
          createdAt: true,
          individual: { select: { isPrivate: true, isDeceased: true, birthDate: true } },
        },
      },
      files: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, mimeType: true, sizeBytes: true, fileName: true, createdById: true, createdAt: true },
      },
    },
  });

  const now = new Date();
  const planned = rows
    .map((row) => ({
      row,
      links: row.links.filter(
        // A missing person row counts as not shown (fail-closed).
        (l) => idMap.has(l.individualId) && (!cross || isLinkedPersonShown(l.individual, mode.sourceKey, now)),
      ),
    }))
    .filter(({ row, links }) => row.isTreeWide || !cross || links.length > 0);
  if (planned.length === 0) return { skippedSourceFiles: 0 };

  // Serialise with uploads into the same workspace (same lock as the upload route).
  await tx.$queryRaw`SELECT 1 FROM workspaces WHERE id = ${input.targetWorkspaceId}::uuid FOR UPDATE`;
  const [workspace, used] = await Promise.all([
    tx.workspace.findUnique({ where: { id: input.targetWorkspaceId }, select: { storageQuotaBytes: true } }),
    tx.sourceFile.aggregate({ where: { tree: { workspaceId: input.targetWorkspaceId } }, _sum: { sizeBytes: true } }),
  ]);
  let remaining = Number(workspace?.storageQuotaBytes ?? 0) - Number(used._sum.sizeBytes ?? 0);

  const recrypt = (value: Bytes): Buffer =>
    cross
      ? encryptBytes(decryptBytes(Buffer.from(value), mode.sourceKey), mode.targetKey)
      : Buffer.from(value);
  const author = (id: string | null) => (cross ? null : id);

  let skippedSourceFiles = 0;
  for (const { row, links } of planned) {
    const kept: { file: (typeof row.files)[number]; bytes: Bytes }[] = [];
    for (const file of row.files) {
      if (file.sizeBytes > remaining) {
        skippedSourceFiles++;
        continue;
      }
      const blob = await tx.sourceFileData.findUnique({ where: { fileId: file.id }, select: { data: true } });
      if (!blob) continue;
      remaining -= file.sizeBytes;
      kept.push({ file, bytes: blob.data });
    }
    // A source never ends with neither text nor files.
    if (row.text === null && kept.length === 0) continue;

    const sourceId = crypto.randomUUID();
    await tx.sourceEntry.create({
      data: {
        id: sourceId,
        treeId: input.toTreeId,
        isTreeWide: row.isTreeWide,
        visibility: row.visibility,
        text: row.text === null ? null : (recrypt(row.text) as unknown as Uint8Array<ArrayBuffer>),
        createdById: author(row.createdById),
        createdAt: row.createdAt,
      },
    });
    if (links.length > 0) {
      await tx.sourceLink.createMany({
        data: links.map((l) => ({
          sourceId,
          individualId: idMap.get(l.individualId)!,
          treeId: input.toTreeId,
          createdById: author(l.createdById),
          createdAt: l.createdAt,
        })),
      });
    }
    for (const { file, bytes } of kept) {
      await tx.sourceFile.create({
        data: {
          treeId: input.toTreeId,
          entryId: sourceId,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          fileName: recrypt(file.fileName) as unknown as Uint8Array<ArrayBuffer>,
          createdById: author(file.createdById),
          createdAt: file.createdAt,
          data: { create: { data: recrypt(bytes) as unknown as Uint8Array<ArrayBuffer> } },
        },
        select: { id: true },
      });
    }
  }

  return { skippedSourceFiles };
}
