/**
 * Session Undo (Phase 15a) — inverse-command builders for tree mutations.
 *
 * TRUST: snapshot payloads are captured from client-side decrypted data.
 * They are UI convenience, not a trust boundary. Server routes MUST
 * re-validate (Zod + authz) on every inverse call.
 *
 * PII: payload objects (names, dates, notes) must never be interpolated
 * into Error.message, console.*, or analytics events. Any thrown Error
 * message from here is generic.
 */

import { apiFetch } from '@/lib/api/client';

export interface Inverse {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

async function requireOk(res: Response): Promise<Response> {
  if (!res.ok && res.status !== 204) {
    throw new Error(`undo API error: ${res.status}`);
  }
  return res;
}

/**
 * Merge an optional `treeId` into a mutation body. When the inverse targets an
 * `extra` tree, the body must carry its `treeId` so the API mutates that tree
 * instead of the workspace main tree. Absent ⇒ the body is unchanged.
 */
function withTreeId(body: unknown, treeId?: string): unknown {
  if (!treeId || typeof body !== 'object' || body === null) return body;
  return { ...(body as Record<string, unknown>), treeId };
}

async function patchJson(path: string, body: unknown, treeId?: string): Promise<void> {
  const res = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTreeId(body, treeId)),
    isUndo: true,
  });
  await requireOk(res);
}

async function postJson(path: string, body: unknown, treeId?: string): Promise<{ id?: string }> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTreeId(body, treeId)),
    isUndo: true,
  });
  await requireOk(res);
  try {
    const json = await res.json();
    return json?.data ?? {};
  } catch {
    return {};
  }
}

async function del(path: string, treeId?: string): Promise<void> {
  const res = await apiFetch(path, {
    method: 'DELETE',
    isUndo: true,
    ...(treeId
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ treeId }) }
      : {}),
  });
  await requireOk(res);
}

// ---------------------------------------------------------------------------
// Individual
// ---------------------------------------------------------------------------

export interface UpdateIndividualInverseParams {
  workspaceId: string;
  individualId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** When set, the inverse targets this `extra` tree; absent ⇒ the main tree. */
  treeId?: string;
}

export function buildUpdateIndividualInverse({
  workspaceId,
  individualId,
  before,
  after,
  treeId,
}: UpdateIndividualInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/individuals/${individualId}`;
  return {
    undo: () => patchJson(url, before, treeId),
    redo: () => patchJson(url, after, treeId),
  };
}

export interface CreateIndividualInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
  treeId?: string;
}

export function buildCreateIndividualInverse({
  workspaceId,
  createdId,
  createPayload,
  treeId,
}: CreateIndividualInverseParams): Inverse {
  let currentId = createdId;
  const deleteUrl = () => `/api/workspaces/${workspaceId}/tree/individuals/${currentId}`;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals`;
  return {
    undo: () => del(deleteUrl(), treeId),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload, treeId);
      if (id) currentId = id;
    },
  };
}

export interface DeleteIndividualInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
  /**
   * Sources («المصادر»): the person's TEXT entries, captured before the delete
   * (whatever the actor could see). The delete cascades them away; undo
   * re-creates each under the person's NEW id. Files are never restored.
   */
  sourceEntries?: ReadonlyArray<{ text: string; visibility: string }>;
  treeId?: string;
}

export function buildDeleteIndividualInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
  sourceEntries = [],
  treeId,
}: DeleteIndividualInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals`;
  const deleteUrl = () =>
    `/api/workspaces/${workspaceId}/tree/individuals/${currentId ?? _deletedId}`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot, treeId);
      if (id) currentId = id;
      if (!id || sourceEntries.length === 0) return;
      // Best-effort, in order: the person is back either way, and one refused
      // entry must not make the stack believe the whole undo failed (redo
      // would then delete a person it thinks is absent).
      for (const entry of sourceEntries) {
        await postJson(
          `/api/workspaces/${workspaceId}/tree/individuals/${id}/sources`,
          { text: entry.text, visibility: entry.visibility },
          treeId,
        ).catch(() => undefined);
      }
    },
    redo: () => del(deleteUrl(), treeId),
  };
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export interface UpdateFamilyInverseParams {
  workspaceId: string;
  familyId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  treeId?: string;
}

export function buildUpdateFamilyInverse({
  workspaceId,
  familyId,
  before,
  after,
  treeId,
}: UpdateFamilyInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/families/${familyId}`;
  return {
    undo: () => patchJson(url, before, treeId),
    redo: () => patchJson(url, after, treeId),
  };
}

// ---------------------------------------------------------------------------
// Family children
// ---------------------------------------------------------------------------

export interface FamilyChildInverseParams {
  workspaceId: string;
  familyId: string;
  individualId: string;
  treeId?: string;
}

export function buildAddChildInverse({
  workspaceId,
  familyId,
  individualId,
  treeId,
}: FamilyChildInverseParams): Inverse {
  const childUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children/${individualId}`;
  const postUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children`;
  return {
    undo: () => del(childUrl, treeId),
    redo: () => postJson(postUrl, { individualId }, treeId).then(() => undefined),
  };
}

export function buildRemoveChildInverse({
  workspaceId,
  familyId,
  individualId,
  treeId,
}: FamilyChildInverseParams): Inverse {
  const childUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children/${individualId}`;
  const postUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children`;
  return {
    undo: () => postJson(postUrl, { individualId }, treeId).then(() => undefined),
    redo: () => del(childUrl, treeId),
  };
}

export interface MoveChildInverseParams {
  workspaceId: string;
  fromFamilyId: string;
  toFamilyId: string;
  individualId: string;
  treeId?: string;
}

export function buildMoveChildInverse({
  workspaceId,
  fromFamilyId,
  toFamilyId,
  individualId,
  treeId,
}: MoveChildInverseParams): Inverse {
  const moveFrom = `/api/workspaces/${workspaceId}/tree/families/${toFamilyId}/children/${individualId}/move`;
  const moveTo = `/api/workspaces/${workspaceId}/tree/families/${fromFamilyId}/children/${individualId}/move`;
  return {
    undo: () =>
      postJson(moveFrom, { targetFamilyId: fromFamilyId }, treeId).then(() => undefined),
    redo: () =>
      postJson(moveTo, { targetFamilyId: toFamilyId }, treeId).then(() => undefined),
  };
}

// ---------------------------------------------------------------------------
// Family create/delete
// ---------------------------------------------------------------------------

export interface CreateFamilyInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
  treeId?: string;
}

export function buildCreateFamilyInverse({
  workspaceId,
  createdId,
  createPayload,
  treeId,
}: CreateFamilyInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/families`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/families/${currentId}`, treeId),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload, treeId);
      if (id) currentId = id;
    },
  };
}

export interface DeleteFamilyInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
  treeId?: string;
}

export function buildDeleteFamilyInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
  treeId,
}: DeleteFamilyInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/families`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot, treeId);
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/families/${currentId ?? _deletedId}`, treeId),
  };
}

// ---------------------------------------------------------------------------
// Rada'a family create/update/delete
// ---------------------------------------------------------------------------

export interface CreateRadaFamilyInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
  treeId?: string;
}

export function buildCreateRadaFamilyInverse({
  workspaceId,
  createdId,
  createPayload,
  treeId,
}: CreateRadaFamilyInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/rada-families`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/rada-families/${currentId}`, treeId),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload, treeId);
      if (id) currentId = id;
    },
  };
}

export interface UpdateRadaFamilyInverseParams {
  workspaceId: string;
  radaFamilyId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  treeId?: string;
}

export function buildUpdateRadaFamilyInverse({
  workspaceId,
  radaFamilyId,
  before,
  after,
  treeId,
}: UpdateRadaFamilyInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/rada-families/${radaFamilyId}`;
  return {
    undo: () => patchJson(url, before, treeId),
    redo: () => patchJson(url, after, treeId),
  };
}

export interface DeleteRadaFamilyInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
  treeId?: string;
}

export function buildDeleteRadaFamilyInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
  treeId,
}: DeleteRadaFamilyInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/rada-families`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot, treeId);
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/rada-families/${currentId ?? _deletedId}`, treeId),
  };
}

// ---------------------------------------------------------------------------
// Ancestry jump («قفزة نسب») create/update/delete
//
// PATCH moves neither endpoint (see ancestry-jump-schemas.ts), so every inverse
// here is a single-row operation. The composite "jump to a brand-new person"
// undo (individual → family → jump) is assembled by the caller, not here.
// ---------------------------------------------------------------------------

export interface CreateAncestryJumpInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
  treeId?: string;
}

export function buildCreateAncestryJumpInverse({
  workspaceId,
  createdId,
  createPayload,
  treeId,
}: CreateAncestryJumpInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/ancestry-jumps`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/ancestry-jumps/${currentId}`, treeId),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload, treeId);
      if (id) currentId = id;
    },
  };
}

export interface UpdateAncestryJumpInverseParams {
  workspaceId: string;
  jumpId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  treeId?: string;
}

export function buildUpdateAncestryJumpInverse({
  workspaceId,
  jumpId,
  before,
  after,
  treeId,
}: UpdateAncestryJumpInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/ancestry-jumps/${jumpId}`;
  return {
    undo: () => patchJson(url, before, treeId),
    redo: () => patchJson(url, after, treeId),
  };
}

export interface DeleteAncestryJumpInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
  treeId?: string;
}

export function buildDeleteAncestryJumpInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
  treeId,
}: DeleteAncestryJumpInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/ancestry-jumps`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot, treeId);
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/ancestry-jumps/${currentId ?? _deletedId}`, treeId),
  };
}

// ---------------------------------------------------------------------------
// Ancestry jump — moved up to a brand-new father
//
// The forward action is ONE atomic server call (create F + his couple +
// re-point the jump), so both directions are single calls too: undo is
// move-back (jump back to P with the pre-move range, then delete the couple
// and F — the server refuses with 409 if anything was built on F since); redo
// replays the move with the saved father form and re-captures the new ids.
// ---------------------------------------------------------------------------

export interface MoveJumpToNewFatherInverseParams {
  workspaceId: string;
  jumpId: string;
  fatherId: string;
  familyId: string;
  childId: string;
  /** The father's individual body, exactly as the forward call sent it. */
  fatherPayload: Record<string, unknown>;
  /** The range BEFORE the move (the move shrinks it by one). */
  preMoveRange: { generationsMin: number | null; generationsMax: number | null };
  treeId?: string;
}

export function buildMoveJumpToNewFatherInverse({
  workspaceId,
  jumpId,
  fatherId,
  familyId,
  childId,
  fatherPayload,
  preMoveRange,
  treeId,
}: MoveJumpToNewFatherInverseParams): Inverse {
  const base = `/api/workspaces/${workspaceId}/tree/ancestry-jumps/${jumpId}`;
  let currentFatherId = fatherId;
  let currentFamilyId = familyId;
  return {
    undo: async () => {
      await postJson(
        `${base}/move-back`,
        { fatherId: currentFatherId, familyId: currentFamilyId, childId, ...preMoveRange },
        treeId,
      );
    },
    redo: async () => {
      const data = (await postJson(`${base}/move-to-new-father`, { father: fatherPayload }, treeId)) as {
        individual?: { id?: string };
        family?: { id?: string };
      };
      if (data.individual?.id) currentFatherId = data.individual.id;
      if (data.family?.id) currentFamilyId = data.family.id;
    },
  };
}

// ---------------------------------------------------------------------------
// Source entry («مصدر») — text-only (step 4)
//
// Creating an entry, editing its text or level, and deleting a text-only entry
// are undoable. Uploading/deleting a file is not (files are never restored).
// A re-created entry gets a NEW id, so each builder re-captures it.
// ---------------------------------------------------------------------------

export interface CreateSourceEntryInverseParams {
  workspaceId: string;
  individualId: string;
  createdId: string;
  createPayload: { text: string; visibility?: string };
  treeId?: string;
}

export function buildCreateSourceEntryInverse({
  workspaceId,
  individualId,
  createdId,
  createPayload,
  treeId,
}: CreateSourceEntryInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals/${individualId}/sources`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/sources/${currentId}`, treeId),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload, treeId);
      if (id) currentId = id;
    },
  };
}

export interface UpdateSourceEntryInverseParams {
  workspaceId: string;
  entryId: string;
  before: { text?: string; visibility?: string };
  after: { text?: string; visibility?: string };
  treeId?: string;
}

export function buildUpdateSourceEntryInverse({
  workspaceId,
  entryId,
  before,
  after,
  treeId,
}: UpdateSourceEntryInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/sources/${entryId}`;
  return {
    undo: () => patchJson(url, before, treeId),
    redo: () => patchJson(url, after, treeId),
  };
}

export interface DeleteSourceEntryInverseParams {
  workspaceId: string;
  individualId: string;
  deletedId: string;
  snapshot: { text: string; visibility: string };
  treeId?: string;
}

export function buildDeleteSourceEntryInverse({
  workspaceId,
  individualId,
  deletedId,
  snapshot,
  treeId,
}: DeleteSourceEntryInverseParams): Inverse {
  let currentId = deletedId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals/${individualId}/sources`;
  return {
    undo: async () => {
      const { id } = await postJson(
        createUrl,
        { text: snapshot.text, visibility: snapshot.visibility },
        treeId,
      );
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/sources/${currentId}`, treeId),
  };
}
