import { describe, test, expect, vi } from 'vitest';
import type { Individual } from '@/lib/gedcom/types';
import { persistDeepCopy, type DeepCopyResult } from '@/lib/tree/branch-pointer-deep-copy';

function makeIndividual(id: string): Individual {
  return {
    id,
    type: 'INDI',
    name: id,
    givenName: id,
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
  };
}

function makeTx() {
  return {
    individual: { createMany: vi.fn().mockResolvedValue({}) },
    family: { createMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
    familyChild: { create: vi.fn().mockResolvedValue({}) },
    copyProvenance: { create: vi.fn().mockResolvedValue({}) },
  };
}

const KEY = Buffer.alloc(32);

describe('persistDeepCopy provenance', () => {
  test('writes a CopyProvenance row when provenance is provided', async () => {
    const copyResult: DeepCopyResult = {
      individuals: { newRoot: makeIndividual('newRoot') },
      families: {},
      idMap: new Map([['oldRoot', 'newRoot']]),
      stitchFamily: null,
      reuseStitch: null,
    };
    const tx = makeTx();

    await persistDeepCopy(tx as never, 'target-tree', copyResult, KEY, {
      reason: 'going_private',
      sourceWorkspaceId: 'src-ws',
      sourceTreeId: 'src-tree',
      sourceRootId: 'oldRoot',
      copiedRootId: 'newRoot',
    });

    expect(tx.copyProvenance.create).toHaveBeenCalledTimes(1);
    const arg = tx.copyProvenance.create.mock.calls[0][0];
    expect(arg.data.reason).toBe('going_private');
    expect(arg.data.sourceWorkspaceId).toBe('src-ws');
    expect(arg.data.sourceRootId).toBe('oldRoot');
    expect(arg.data.copiedTreeId).toBe('target-tree');
    expect(arg.data.copiedRootId).toBe('newRoot');
  });

  test('does NOT write provenance when none is provided (back-compat)', async () => {
    const copyResult: DeepCopyResult = {
      individuals: { newRoot: makeIndividual('newRoot') },
      families: {},
      idMap: new Map(),
      stitchFamily: null,
      reuseStitch: null,
    };
    const tx = makeTx();

    await persistDeepCopy(tx as never, 'target-tree', copyResult, KEY);

    expect(tx.copyProvenance.create).not.toHaveBeenCalled();
    // still persists individuals
    expect(tx.individual.createMany).toHaveBeenCalledTimes(1);
  });
});
