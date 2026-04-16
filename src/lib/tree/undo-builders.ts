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

async function patchJson(path: string, body: unknown): Promise<void> {
  const res = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    isUndo: true,
  });
  await requireOk(res);
}

async function postJson(path: string, body: unknown): Promise<{ id?: string }> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

async function del(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE', isUndo: true });
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
}

export function buildUpdateIndividualInverse({
  workspaceId,
  individualId,
  before,
  after,
}: UpdateIndividualInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/individuals/${individualId}`;
  return {
    undo: () => patchJson(url, before),
    redo: () => patchJson(url, after),
  };
}

export interface CreateIndividualInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
}

export function buildCreateIndividualInverse({
  workspaceId,
  createdId,
  createPayload,
}: CreateIndividualInverseParams): Inverse {
  let currentId = createdId;
  const deleteUrl = () => `/api/workspaces/${workspaceId}/tree/individuals/${currentId}`;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals`;
  return {
    undo: () => del(deleteUrl()),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload);
      if (id) currentId = id;
    },
  };
}

export interface DeleteIndividualInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
}

export function buildDeleteIndividualInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
}: DeleteIndividualInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/individuals`;
  const deleteUrl = () =>
    `/api/workspaces/${workspaceId}/tree/individuals/${currentId ?? _deletedId}`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot);
      if (id) currentId = id;
    },
    redo: () => del(deleteUrl()),
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
}

export function buildUpdateFamilyInverse({
  workspaceId,
  familyId,
  before,
  after,
}: UpdateFamilyInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/families/${familyId}`;
  return {
    undo: () => patchJson(url, before),
    redo: () => patchJson(url, after),
  };
}

// ---------------------------------------------------------------------------
// Family children
// ---------------------------------------------------------------------------

export interface FamilyChildInverseParams {
  workspaceId: string;
  familyId: string;
  individualId: string;
}

export function buildAddChildInverse({
  workspaceId,
  familyId,
  individualId,
}: FamilyChildInverseParams): Inverse {
  const childUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children/${individualId}`;
  const postUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children`;
  return {
    undo: () => del(childUrl),
    redo: () => postJson(postUrl, { individualId }).then(() => undefined),
  };
}

export function buildRemoveChildInverse({
  workspaceId,
  familyId,
  individualId,
}: FamilyChildInverseParams): Inverse {
  const childUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children/${individualId}`;
  const postUrl = `/api/workspaces/${workspaceId}/tree/families/${familyId}/children`;
  return {
    undo: () => postJson(postUrl, { individualId }).then(() => undefined),
    redo: () => del(childUrl),
  };
}

export interface MoveChildInverseParams {
  workspaceId: string;
  fromFamilyId: string;
  toFamilyId: string;
  individualId: string;
}

export function buildMoveChildInverse({
  workspaceId,
  fromFamilyId,
  toFamilyId,
  individualId,
}: MoveChildInverseParams): Inverse {
  const moveFrom = `/api/workspaces/${workspaceId}/tree/families/${toFamilyId}/children/${individualId}/move`;
  const moveTo = `/api/workspaces/${workspaceId}/tree/families/${fromFamilyId}/children/${individualId}/move`;
  return {
    undo: () =>
      postJson(moveFrom, { targetFamilyId: fromFamilyId }).then(() => undefined),
    redo: () =>
      postJson(moveTo, { targetFamilyId: toFamilyId }).then(() => undefined),
  };
}

// ---------------------------------------------------------------------------
// Family create/delete
// ---------------------------------------------------------------------------

export interface CreateFamilyInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
}

export function buildCreateFamilyInverse({
  workspaceId,
  createdId,
  createPayload,
}: CreateFamilyInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/families`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/families/${currentId}`),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload);
      if (id) currentId = id;
    },
  };
}

export interface DeleteFamilyInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
}

export function buildDeleteFamilyInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
}: DeleteFamilyInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/families`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot);
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/families/${currentId ?? _deletedId}`),
  };
}

// ---------------------------------------------------------------------------
// Rada'a family create/update/delete
// ---------------------------------------------------------------------------

export interface CreateRadaFamilyInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
}

export function buildCreateRadaFamilyInverse({
  workspaceId,
  createdId,
  createPayload,
}: CreateRadaFamilyInverseParams): Inverse {
  let currentId = createdId;
  const createUrl = `/api/workspaces/${workspaceId}/tree/rada-families`;
  return {
    undo: () => del(`/api/workspaces/${workspaceId}/tree/rada-families/${currentId}`),
    redo: async () => {
      const { id } = await postJson(createUrl, createPayload);
      if (id) currentId = id;
    },
  };
}

export interface UpdateRadaFamilyInverseParams {
  workspaceId: string;
  radaFamilyId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export function buildUpdateRadaFamilyInverse({
  workspaceId,
  radaFamilyId,
  before,
  after,
}: UpdateRadaFamilyInverseParams): Inverse {
  const url = `/api/workspaces/${workspaceId}/tree/rada-families/${radaFamilyId}`;
  return {
    undo: () => patchJson(url, before),
    redo: () => patchJson(url, after),
  };
}

export interface DeleteRadaFamilyInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
}

export function buildDeleteRadaFamilyInverse({
  workspaceId,
  deletedId: _deletedId,
  snapshot,
}: DeleteRadaFamilyInverseParams): Inverse {
  let currentId: string | null = null;
  const createUrl = `/api/workspaces/${workspaceId}/tree/rada-families`;
  return {
    undo: async () => {
      const { id } = await postJson(createUrl, snapshot);
      if (id) currentId = id;
    },
    redo: () => del(`/api/workspaces/${workspaceId}/tree/rada-families/${currentId ?? _deletedId}`),
  };
}
