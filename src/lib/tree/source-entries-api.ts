/**
 * Sources («المصادر») — client `apiFetch` wrappers for the entry API (step 4)
 * and its files (step 5). Thin glue: every permission and visibility decision is made on
 * the server (source-visibility.ts). Each wrapper takes an optional `treeId`
 * to target an `extra` tree; absent ⇒ the workspace main tree.
 *
 * PII: entry texts may name living people. Never interpolate them into
 * Error.message, console.* or telemetry.
 */
import { apiFetch } from '@/lib/api/client';
import type { SourceEntryDto } from '@/lib/tree/source-entry-route-helpers';
import type { SourceFileDto } from '@/lib/tree/source-file-helpers';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';

export type { SourceEntryDto, SourceFileDto };

export interface PersonSources {
  entries: SourceEntryDto[];
  inherited: SourceEntryDto | null;
}

export interface SourceListItem extends SourceEntryDto {
  personName: string | null;
  fileCount: number;
}

export interface SourceListPage {
  entries: SourceListItem[];
  total: number;
  nextCursor: number | null;
  /** Every id the search/filter matched (≤ 500) — «تحديد الكل». */
  matchedIds: string[];
  matchedIdsTruncated: boolean;
  scanTruncated: boolean;
}

/** What a restore (undo) needs to re-create a text entry. */
export interface RestorableSourceEntry {
  text: string;
  visibility: SourceVisibilityLevel;
}

const base = (workspaceId: string) => `/api/workspaces/${workspaceId}/tree`;

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`sources API error: ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function ok(res: Response): Promise<void> {
  if (!res.ok && res.status !== 204) throw new Error(`sources API error: ${res.status}`);
}

export async function fetchPersonSources(
  workspaceId: string,
  individualId: string,
  treeId?: string,
): Promise<PersonSources> {
  return json(await apiFetch(`${base(workspaceId)}/individuals/${individualId}/sources${query({ treeId })}`));
}

export async function createSourceEntry(
  workspaceId: string,
  individualId: string,
  /** `text` or `fileIds` (staged uploads) — at least one. */
  body: { text?: string | null; fileIds?: string[]; visibility?: SourceVisibilityLevel },
  treeId?: string,
): Promise<SourceEntryDto> {
  return json(
    await apiFetch(
      `${base(workspaceId)}/individuals/${individualId}/sources`,
      jsonInit('POST', { ...body, ...(treeId ? { treeId } : {}) }),
    ),
  );
}

export async function updateSourceEntry(
  workspaceId: string,
  entryId: string,
  /** `text: null` clears the text (the entry must keep a file). */
  body: { text?: string | null; fileIds?: string[]; visibility?: SourceVisibilityLevel },
  treeId?: string,
): Promise<SourceEntryDto> {
  return json(
    await apiFetch(
      `${base(workspaceId)}/sources/${entryId}`,
      jsonInit('PATCH', { ...body, ...(treeId ? { treeId } : {}) }),
    ),
  );
}

export async function deleteSourceEntry(workspaceId: string, entryId: string, treeId?: string): Promise<void> {
  await ok(await apiFetch(`${base(workspaceId)}/sources/${entryId}`, jsonInit('DELETE', treeId ? { treeId } : {})));
}

export async function fetchTreeEntry(workspaceId: string, treeId?: string): Promise<SourceEntryDto | null> {
  const data = await json<{ entry: SourceEntryDto | null }>(
    await apiFetch(`${base(workspaceId)}/sources/tree-entry${query({ treeId })}`),
  );
  return data.entry;
}

export async function putTreeEntry(
  workspaceId: string,
  body: { text?: string | null; fileIds?: string[]; visibility: SourceVisibilityLevel },
  treeId?: string,
): Promise<SourceEntryDto> {
  return json(
    await apiFetch(
      `${base(workspaceId)}/sources/tree-entry`,
      jsonInit('PUT', { ...body, ...(treeId ? { treeId } : {}) }),
    ),
  );
}

export async function deleteTreeEntry(workspaceId: string, treeId?: string): Promise<void> {
  await ok(await apiFetch(`${base(workspaceId)}/sources/tree-entry`, jsonInit('DELETE', treeId ? { treeId } : {})));
}

export async function listTreeSources(
  workspaceId: string,
  params: {
    treeId?: string;
    q?: string;
    visibility?: SourceVisibilityLevel;
    /** `pending` = not yet at the public level (the publish flow's list). */
    scope?: 'pending';
    cursor?: number;
    limit?: number;
  } = {},
): Promise<SourceListPage> {
  return json(await apiFetch(`${base(workspaceId)}/sources${query(params)}`));
}

export async function bulkSources(
  workspaceId: string,
  body: { ids: string[]; action: 'setVisibility' | 'delete'; visibility?: SourceVisibilityLevel },
  treeId?: string,
): Promise<{ updated?: number; deleted?: number }> {
  return json(
    await apiFetch(
      `${base(workspaceId)}/sources/bulk`,
      jsonInit('POST', { ...body, ...(treeId ? { treeId } : {}) }),
    ),
  );
}

/** The publish flow's «المصادر في الشجرة المنشورة» numbers (admins). */
export interface PublishSourcesSummary {
  /** Every person entry of the tree not yet visible to visitors (uncapped). */
  pendingIds: string[];
  /** Person entries already at the public level. */
  publicCount: number;
  /** The tree-wide entry, handled separately from the list and bulk. */
  treeEntry: { id: string; visibility: SourceVisibilityLevel } | null;
}

export async function fetchPublishSourcesSummary(
  workspaceId: string,
  treeId?: string,
): Promise<PublishSourcesSummary> {
  return json(await apiFetch(`${base(workspaceId)}/sources/publish-summary${query({ treeId })}`));
}

export async function fetchSourceSuggestions(workspaceId: string, q: string): Promise<string[]> {
  const data = await json<{ suggestions: string[] }>(
    await apiFetch(`${base(workspaceId)}/sources/suggestions${query({ q })}`),
  );
  return data.suggestions;
}

/**
 * The text entries an undo can re-create. A non-admin may only create at
 * «المشرفون فقط», so their restore lowers the level to that (keeps the text;
 * an admin can raise it again). File-only entries carry no text: not
 * restorable (files are never restored by undo).
 */
export function restorableSourceEntries(
  entries: readonly SourceEntryDto[],
  isAdmin: boolean,
): RestorableSourceEntry[] {
  return entries
    .filter((e): e is SourceEntryDto & { text: string } => typeof e.text === 'string' && e.text !== '')
    .map((e) => ({ text: e.text, visibility: isAdmin ? e.visibility : 'admins' }));
}

// ---------------------------------------------------------------------------
// Files (step 5)
// ---------------------------------------------------------------------------

/**
 * Upload ONE file (image or PDF, ≤ 8 MB). It is staged: send the returned id
 * in `fileIds` of the entry create / update / tree-entry save to attach it.
 * An upload never attached is deleted by the server after 24 h. The browser
 * sets the multipart Content-Type (with its boundary) — never set it here.
 * Rejections throw with the server's Arabic message.
 */
export async function uploadSourceFile(
  workspaceId: string,
  file: File | Blob,
  treeId?: string,
): Promise<SourceFileDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`${base(workspaceId)}/sources/uploads${query({ treeId })}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((b: { error?: unknown }) => (typeof b?.error === 'string' ? b.error : null))
      .catch(() => null);
    throw new Error(message ?? `sources API error: ${res.status}`);
  }
  return ((await res.json()) as { data: SourceFileDto }).data;
}

/**
 * The file's route. It needs the Bearer token, so an `<img src>` cannot load
 * it directly — use `fetchSourceFileBlob` + `URL.createObjectURL`.
 */
export function sourceFileUrl(workspaceId: string, entryId: string, fileId: string, treeId?: string): string {
  return `${base(workspaceId)}/sources/${entryId}/files/${fileId}${query({ treeId })}`;
}

/** Fetch a file's bytes (authenticated) as a Blob for display or download. */
export async function fetchSourceFileBlob(
  workspaceId: string,
  entryId: string,
  fileId: string,
  treeId?: string,
): Promise<Blob> {
  const res = await apiFetch(sourceFileUrl(workspaceId, entryId, fileId, treeId));
  if (!res.ok) throw new Error(`sources API error: ${res.status}`);
  return res.blob();
}

/**
 * Delete one file of an entry (not undoable). `entryDeleted` is true when it
 * was the last file of an entry without text — the entry is gone too.
 */
export async function deleteSourceFile(
  workspaceId: string,
  entryId: string,
  fileId: string,
  treeId?: string,
): Promise<{ entryDeleted: boolean }> {
  return json(
    await apiFetch(
      `${base(workspaceId)}/sources/${entryId}/files/${fileId}`,
      jsonInit('DELETE', treeId ? { treeId } : {}),
    ),
  );
}
