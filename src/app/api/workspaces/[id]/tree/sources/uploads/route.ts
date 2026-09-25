import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { sourceUploadLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { encryptBytes } from '@/lib/crypto/workspace-encryption';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { resolveSourceTreeOr404 } from '@/lib/tree/source-entry-route-helpers';
import {
  processSourceFile,
  sanitizeSourceFileName,
  SourceFileRejectedError,
} from '@/lib/tree/source-file-processing';
import {
  readSingleUploadedFile,
  sweepStagedSourceFiles,
  encryptFileName,
  sourceFileDto,
  sourceFileErrorResponse,
  SourceFileRequestError,
  SOURCE_FILE_META_SELECT,
  QUOTA_EXCEEDED_MESSAGE,
  type SourceFileMetaRow,
} from '@/lib/tree/source-file-helpers';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/sources/uploads?treeId= — ONE file per request.
//
// Stages the file (not yet on any entry): validated by magic bytes, images
// re-encoded (EXIF/GPS stripped), PDFs checked for active content, encrypted
// with the workspace key. The entry create/PATCH/PUT then attaches it by id
// (`fileIds`). Staged files never serve and are swept after 24 h — the sweep
// runs here, at each upload. See `source-file-helpers.ts` for the design.
//
// No audit row and no touchTreeTimestamp: a staged file is not part of the
// tree yet; the attach writes the audit row.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = sourceUploadLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Resolve the tree from the query BEFORE reading the body.
  const tree = await resolveSourceTreeOr404(workspaceId, request.nextUrl.searchParams.get('treeId'));
  if (isErrorResponse(tree)) return tree;

  const uploaded = await readSingleUploadedFile(request);
  if (uploaded instanceof NextResponse) return uploaded;

  let processed;
  try {
    processed = await processSourceFile(uploaded.bytes);
  } catch (error) {
    if (error instanceof SourceFileRejectedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const key = await getWorkspaceKey(workspaceId);
  const fileName = sanitizeSourceFileName(uploaded.name, processed.mimeType);
  const sizeBytes = processed.bytes.length;
  const encrypted = encryptBytes(processed.bytes, key);

  // Best-effort: a failed sweep must never fail an upload.
  await sweepStagedSourceFiles(prisma).catch(() => 0);

  try {
    const row = await prisma.$transaction(async (tx) => {
      // Serialise uploads of one workspace so two cannot both pass the quota.
      await tx.$queryRaw`SELECT 1 FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      const [workspace, used] = await Promise.all([
        tx.workspace.findUnique({ where: { id: workspaceId }, select: { storageQuotaBytes: true } }),
        tx.sourceFile.aggregate({ where: { tree: { workspaceId } }, _sum: { sizeBytes: true } }),
      ]);
      const quota = Number(workspace?.storageQuotaBytes ?? 0);
      if (Number(used._sum.sizeBytes ?? 0) + sizeBytes > quota) {
        throw new SourceFileRequestError(QUOTA_EXCEEDED_MESSAGE, 413);
      }
      return (await tx.sourceFile.create({
        data: {
          treeId: tree.id,
          entryId: null,
          createdById: result.user.id,
          mimeType: processed.mimeType,
          sizeBytes,
          fileName: encryptFileName(fileName, key) as unknown as Uint8Array<ArrayBuffer>,
          data: { create: { data: encrypted as unknown as Uint8Array<ArrayBuffer> } },
        },
        select: SOURCE_FILE_META_SELECT,
      })) as SourceFileMetaRow;
    });

    return NextResponse.json({ data: sourceFileDto(row, key) }, { status: 201 });
  } catch (error) {
    const response = sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
