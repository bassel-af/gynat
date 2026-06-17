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
  treeId?: string;
}

export function buildDeleteIndividualInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
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
