import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';
import {
  buildUpdateIndividualInverse,
  buildCreateIndividualInverse,
  buildDeleteIndividualInverse,
  buildUpdateFamilyInverse,
  buildAddChildInverse,
  buildRemoveChildInverse,
  buildMoveChildInverse,
  buildCreateFamilyInverse,
  buildDeleteFamilyInverse,
  buildCreateRadaFamilyInverse,
  buildUpdateRadaFamilyInverse,
  buildDeleteRadaFamilyInverse,
} from '@/lib/tree/undo-builders';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function okResponse(status = 200): Response {
  return new Response('{}', { status });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(okResponse());
});

describe('buildUpdateIndividualInverse', () => {
  const workspaceId = 'ws-1';
  const individualId = '@I1@';
  const before = { givenName: 'أحمد', surname: 'السعيد' };
  const after = { givenName: 'محمد', surname: 'السعيد' };

  it('undo PATCHes back to the before snapshot with undo header', async () => {
    const { undo } = buildUpdateIndividualInverse({ workspaceId, individualId, before, after });
    await undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals/${individualId}`,
      expect.objectContaining({
        method: 'PATCH',
        isUndo: true,
        body: JSON.stringify(before),
      }),
    );
  });

  it('redo PATCHes forward to the after snapshot with undo header', async () => {
    const { redo } = buildUpdateIndividualInverse({ workspaceId, individualId, before, after });
    await redo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals/${individualId}`,
      expect.objectContaining({
        method: 'PATCH',
        isUndo: true,
        body: JSON.stringify(after),
      }),
    );
  });

  it('undo throws on non-2xx response', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response('{"error":"gone"}', { status: 404 }));
    const { undo } = buildUpdateIndividualInverse({ workspaceId, individualId, before, after });
    await expect(undo()).rejects.toThrow();
  });
});

describe('buildCreateIndividualInverse', () => {
  const workspaceId = 'ws-1';
  const individualId = '@I42@';
  const createPayload = { givenName: 'سارة', surname: 'السعيد', sex: 'F' };

  it('undo DELETEs the created individual', async () => {
    const { undo } = buildCreateIndividualInverse({
      workspaceId,
      createdId: individualId,
      createPayload,
    });
    await undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals/${individualId}`,
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });

  it('redo re-POSTs the original create payload', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }),
    );
    const { redo } = buildCreateIndividualInverse({
      workspaceId,
      createdId: individualId,
      createPayload,
    });
    await redo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals`,
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify(createPayload),
      }),
    );
  });
});

describe('buildDeleteIndividualInverse', () => {
  const workspaceId = 'ws-1';
  const individualId = '@I7@';
  const snapshot = { givenName: 'علي', surname: 'الحسيني', sex: 'M' };

  it('undo re-POSTs the deleted individual from snapshot', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@I101@' } }), { status: 201 }),
    );
    const { undo } = buildDeleteIndividualInverse({
      workspaceId,
      deletedId: individualId,
      snapshot,
    });
    await undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals`,
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify(snapshot),
      }),
    );
  });

  it('redo DELETEs the recreated individual using the new id returned by undo', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@I101@' } }), { status: 201 }),
    );
    const inverse = buildDeleteIndividualInverse({
      workspaceId,
      deletedId: individualId,
      snapshot,
    });
    await inverse.undo();
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await inverse.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      `/api/workspaces/${workspaceId}/tree/individuals/@I101@`,
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });
});

describe('buildUpdateFamilyInverse', () => {
  it('undo/redo PATCH /families/{id} with before/after', async () => {
    const before = { husbandId: '@I1@', wifeId: null };
    const after = { husbandId: '@I1@', wifeId: '@I2@' };
    const inv = buildUpdateFamilyInverse({
      workspaceId: 'ws-1',
      familyId: '@F1@',
      before,
      after,
    });
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@',
      expect.objectContaining({
        method: 'PATCH',
        isUndo: true,
        body: JSON.stringify(before),
      }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@',
      expect.objectContaining({
        method: 'PATCH',
        isUndo: true,
        body: JSON.stringify(after),
      }),
    );
  });
});

describe('buildAddChildInverse', () => {
  it('undo DELETEs child from family; redo re-POSTs', async () => {
    const inv = buildAddChildInverse({
      workspaceId: 'ws-1',
      familyId: '@F1@',
      individualId: '@I9@',
    });
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@/children/@I9@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@/children',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify({ individualId: '@I9@' }),
      }),
    );
  });
});

describe('buildRemoveChildInverse', () => {
  it('undo re-POSTs child; redo DELETEs again', async () => {
    const inv = buildRemoveChildInverse({
      workspaceId: 'ws-1',
      familyId: '@F1@',
      individualId: '@I9@',
    });
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@/children',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify({ individualId: '@I9@' }),
      }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@/children/@I9@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });
});

describe('buildCreateFamilyInverse', () => {
  it('undo DELETEs the created family; redo re-POSTs', async () => {
    const createPayload = { husbandId: '@I1@', wifeId: '@I2@' };
    const inv = buildCreateFamilyInverse({
      workspaceId: 'ws-1',
      createdId: '@F42@',
      createPayload,
    });
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families/@F42@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@F99@' } }), { status: 201 }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify(createPayload),
      }),
    );
  });
});

describe('buildDeleteFamilyInverse', () => {
  it('undo re-POSTs the family snapshot; redo DELETEs again', async () => {
    const snapshot = { husbandId: '@I1@', wifeId: '@I2@', childrenIds: ['@I3@'] };
    const inv = buildDeleteFamilyInverse({
      workspaceId: 'ws-1',
      deletedId: '@F1@',
      snapshot,
    });
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@F7@' } }), { status: 201 }),
    );
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify(snapshot),
      }),
    );
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F7@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });
});

describe('buildCreateRadaFamilyInverse', () => {
  it('undo DELETEs; redo re-POSTs', async () => {
    const createPayload = { fosterFatherId: '@I1@', fosterMotherId: '@I2@', childrenIds: ['@I3@'], notes: null };
    const inv = buildCreateRadaFamilyInverse({
      workspaceId: 'ws-1',
      createdId: '@R42@',
      createPayload,
    });
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/rada-families/@R42@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@R99@' } }), { status: 201 }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/rada-families',
      expect.objectContaining({ method: 'POST', isUndo: true, body: JSON.stringify(createPayload) }),
    );
  });
});

describe('buildUpdateRadaFamilyInverse', () => {
  it('undo/redo PATCH /rada-families/{id}', async () => {
    const before = { fosterFatherId: '@I1@', fosterMotherId: null, notes: null };
    const after = { fosterFatherId: '@I1@', fosterMotherId: '@I2@', notes: 'x' };
    const inv = buildUpdateRadaFamilyInverse({
      workspaceId: 'ws-1',
      radaFamilyId: '@R1@',
      before,
      after,
    });
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/rada-families/@R1@',
      expect.objectContaining({ method: 'PATCH', isUndo: true, body: JSON.stringify(before) }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/rada-families/@R1@',
      expect.objectContaining({ method: 'PATCH', isUndo: true, body: JSON.stringify(after) }),
    );
  });
});

describe('buildDeleteRadaFamilyInverse', () => {
  it('undo re-POSTs; redo DELETEs', async () => {
    const snapshot = { fosterFatherId: '@I1@', fosterMotherId: '@I2@', childrenIds: ['@I3@'], notes: null };
    const inv = buildDeleteRadaFamilyInverse({
      workspaceId: 'ws-1',
      deletedId: '@R1@',
      snapshot,
    });
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@R7@' } }), { status: 201 }),
    );
    await inv.undo();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/rada-families',
      expect.objectContaining({ method: 'POST', isUndo: true, body: JSON.stringify(snapshot) }),
    );
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/rada-families/@R7@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });
});

describe('buildMoveChildInverse', () => {
  it('undo moves back; redo moves forward again', async () => {
    const inv = buildMoveChildInverse({
      workspaceId: 'ws-1',
      fromFamilyId: '@F1@',
      toFamilyId: '@F2@',
      individualId: '@I9@',
    });
    await inv.undo();
    // undo: restore to original family — from current (toFamilyId) move back to fromFamilyId
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/families/@F2@/children/@I9@/move',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify({ targetFamilyId: '@F1@' }),
      }),
    );
    await inv.redo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@/children/@I9@/move',
      expect.objectContaining({
        method: 'POST',
        isUndo: true,
        body: JSON.stringify({ targetFamilyId: '@F2@' }),
      }),
    );
  });
});
