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
import type {
  PersonSourceDto,
  SourceSummaryDto,
  SourceWithPeopleDto,
} from '@/lib/tree/source-links';

export type { SourceEntryDto, SourceFileDto, PersonSourceDto, SourceSummaryDto, SourceWithPeopleDto };

export interface PersonSources {
  /** Each carries `people` / `sharedCount`: the OTHER people this viewer may see. */
  entries: PersonSourceDto[];
  inherited: SourceEntryDto | null;
  /** «مصادر أسرته» (editors, only when `entries` is empty). */
  familyHints?: SourceSummaryDto[];
}

export interface SourceListItem extends SourceEntryDto {
  /** First 20 people (real names — the list is admin only). */
  people: { id: string; name: string }[];
  peopleCount: number;
  fileCount: number;
  /** @deprecated compatibility until the «المصادر» page reads `people`. */
  personName: string | null;
}

export interface SourceListPage {
  entries: SourceListItem[];
  total: number;
  nextCursor: number | null;
  /** Every id the search/filter matched (≤ 500) — «تحديد الكل». */
  matchedIds: string[];
  matchedIdsTruncated: boolean;
  scanTruncated: boolean;
  /** Tab sizes for the current search / level: «الكل» · «مشترك» · «ليس مصدرًا لأحد». */
  counts: { all: number; shared: number; unlinked: number };
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

/** Body of `POST sources` — `personIds[0]` is the starting person. */
export interface CreateSourceBody {
  text?: string | null;
  fileIds?: string[];
  visibility?: SourceVisibilityLevel;
  personIds: string[];
}

/** One source for many people, in one save. */
export async function createSource(
  workspaceId: string,
  body: CreateSourceBody,
  treeId?: string,
): Promise<PersonSourceDto> {
  return json(
    await apiFetch(`${base(workspaceId)}/sources`, jsonInit('POST', { ...body, ...(treeId ? { treeId } : {}) })),
  );
}

/** One-person create (today's form): `createSource` with that person only. */
export async function createSourceEntry(
  workspaceId: string,
  individualId: string,
  /** `text` or `fileIds` (staged uploads) — at least one. */
  body: { text?: string | null; fileIds?: string[]; visibility?: SourceVisibilityLevel },
  treeId?: string,
): Promise<PersonSourceDto> {
  return createSource(workspaceId, { ...body, personIds: [individualId] }, treeId);
}

/** Body of `PATCH sources/[id]`. */
export interface PatchSourceBody {
  /** `null` clears the text (the source must keep a file). */
  text?: string | null;
  fileIds?: string[];
  visibility?: SourceVisibilityLevel;
  addPersonIds?: string[];
  removePersonIds?: string[];
  /** The answer to «هذا آخر شخص لهذا المصدر». */
  onLastLink?: 'delete' | 'keep';
}

/** The PATCH would remove the source's last person and no `onLastLink` was sent. */
export class LastLinkError extends Error {
  constructor() {
    super('last_link');
    this.name = 'LastLinkError';
  }
}

/**
 * Edit a source (content and/or people). Returns the source with its
 * visible people, or `null` when the last person was removed with
 * `onLastLink: 'delete'` (the source is gone). Throws `LastLinkError` when
 * the server asks what to do with the last person.
 */
export async function patchSource(
  workspaceId: string,
  entryId: string,
  body: PatchSourceBody,
  treeId?: string,
): Promise<SourceWithPeopleDto | null> {
  const res = await apiFetch(
    `${base(workspaceId)}/sources/${entryId}`,
    jsonInit('PATCH', { ...body, ...(treeId ? { treeId } : {}) }),
  );
  if (res.status === 409) {
    const code = await res
      .json()
      .then((b: { code?: unknown }) => b?.code)
      .catch(() => null);
    if (code === 'last_link') throw new LastLinkError();
  }
  if (!res.ok) throw new Error(`sources API error: ${res.status}`);
  const payload = (await res.json()) as { data: SourceWithPeopleDto | null; deleted?: boolean };
  return payload.deleted ? null : payload.data;
}

export async function updateSourceEntry(
  workspaceId: string,
  entryId: string,
  /** `text: null` clears the text (the entry must keep a file). */
  body: { text?: string | null; fileIds?: string[]; visibility?: SourceVisibilityLevel },
  treeId?: string,
): Promise<SourceEntryDto> {
  // Content only: never removes a person, so never deletes the source.
  return (await patchSource(workspaceId, entryId, body, treeId)) as SourceEntryDto;
}

/**
 * Delete a source. `deleted: false` = a non-admin removed only the people
 * they can see; the source stays for people hidden from them.
 */
export async function deleteSourceEntry(
  workspaceId: string,
  entryId: string,
  treeId?: string,
): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`${base(workspaceId)}/sources/${entryId}`, jsonInit('DELETE', treeId ? { treeId } : {}));
  if (res.status === 204) return { deleted: true };
  return json<{ deleted: boolean }>(res);
}

/** «معاينة المصدر» — one source with the people this viewer may see (editors). */
export async function fetchSourcePreview(
  workspaceId: string,
  entryId: string,
  treeId?: string,
): Promise<SourceWithPeopleDto> {
  return json(await apiFetch(`${base(workspaceId)}/sources/${entryId}${query({ treeId })}`));
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
    /** «مشترك» (≥ 2 people) / «ليس مصدرًا لأحد». */
    filter?: 'shared' | 'unlinked';
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
  /** Distinct people shown on the public tree that those public sources are for. */
  publicPeopleCount: number;
  /** The tree-wide entry, handled separately from the list and bulk. */
  treeEntry: { id: string; visibility: SourceVisibilityLevel } | null;
}

export async function fetchPublishSourcesSummary(
  workspaceId: string,
  treeId?: string,
): Promise<PublishSourcesSummary> {
  return json(await apiFetch(`${base(workspaceId)}/sources/publish-summary${query({ treeId })}`));
}

/** «المصدر» typing help: sources of the tree (≤ 10), as this viewer may see them. */
export async function fetchSourceSuggestionSummaries(
  workspaceId: string,
  q: string,
  treeId?: string,
): Promise<SourceSummaryDto[]> {
  const data = await json<{ suggestions: SourceSummaryDto[] }>(
    await apiFetch(`${base(workspaceId)}/sources/suggestions${query({ q, treeId })}`),
  );
  return data.suggestions;
}

/** Text-only suggestions (distinct texts) for today's form. */
export async function fetchSourceSuggestions(workspaceId: string, q: string, treeId?: string): Promise<string[]> {
  const rows = await fetchSourceSuggestionSummaries(workspaceId, q, treeId);
  return [...new Set(rows.map((r) => r.text).filter((t): t is string => typeof t === 'string' && t !== ''))];
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
