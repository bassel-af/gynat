// @vitest-environment node
/**
 * Sources («المصادر») rework R3 — goal doc §8 item 8, end to end on the
 * public serve: even when the loaded DB tree carries stray shared-source
 * relations (`sourceLinks`, `sourceEntries`) on its rows, the anonymous public
 * payload (`buildPublicTreePayload` → data + crawlable names) is source-free.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { encryptField } from '@/lib/crypto/workspace-encryption';
import { findSourceKeys, STRAY_SOURCES } from './helpers/source-leak';

const KEY = Buffer.alloc(32, 3);

vi.mock('@/lib/db', () => ({
  prisma: { branchPointer: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return { ...actual, getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 3)) };
});
const queries = vi.hoisted(() => ({ getTreeByWorkspaceId: vi.fn(), getOrCreateTargetTree: vi.fn() }));
vi.mock('@/lib/tree/queries', () => queries);

import { buildPublicTreePayload, type PublicTreeRecord } from '@/lib/tree/public-serve';

const enc = (s: string) => encryptField(s, KEY);

function dbIndividual(id: string, givenName: string, isDeceased: boolean) {
  return {
    id, treeId: 'tree-1', gedcomId: null, givenName: enc(givenName), surname: null, fullName: null, sex: 'M',
    birthDate: null, birthPlace: null, birthPlaceId: null, birthPlaceRef: null, birthDescription: null,
    birthNotes: null, birthHijriDate: null, deathDate: null, deathPlace: null, deathPlaceId: null,
    deathPlaceRef: null, deathDescription: null, deathNotes: null, deathHijriDate: null, kunya: null,
    notes: null, isDeceased, isPrivate: false,
    sourceEntries: STRAY_SOURCES,
    sourceLinks: STRAY_SOURCES,
  };
}

function dbTree() {
  return {
    id: 'tree-1',
    workspaceId: 'ws-1',
    individuals: [dbIndividual('DAD', 'محمد', true), dbIndividual('SON', 'باسل', false)],
    families: [{
      id: 'F1', treeId: 'tree-1', gedcomId: null, husbandId: 'DAD', wifeId: null,
      children: [{ familyId: 'F1', individualId: 'SON' }], isDivorced: false, isUmmWalad: false,
      sourceLinks: STRAY_SOURCES, citations: STRAY_SOURCES,
    }],
    radaFamilies: [],
    ancestryJumps: [],
    sourceEntries: STRAY_SOURCES,
    sourceLinks: STRAY_SOURCES,
    sourceFiles: STRAY_SOURCES,
  };
}

const RECORD = (kind: 'main' | 'extra'): PublicTreeRecord => ({
  treeId: 'tree-1', workspaceId: 'ws-1', workspaceNameAr: 'آل سعيد', nameAr: null, kind,
  visibility: 'public_listed', lastModifiedAt: new Date(), publicSlug: 'abc', enableKunya: true,
  hideBirthDateForFemale: false, hideBirthDateForMale: false, personPagesIndexable: true,
});

beforeEach(() => {
  queries.getTreeByWorkspaceId.mockResolvedValue(dbTree());
  queries.getOrCreateTargetTree.mockResolvedValue(dbTree());
});

describe('public tree payload — never carries sources', () => {
  test.each(['main', 'extra'] as const)('%s tree: data and names are source-free', async (kind) => {
    const payload = await buildPublicTreePayload(RECORD(kind));
    expect(Object.keys(payload.data.individuals).sort()).toEqual(['DAD', 'SON']);
    expect(findSourceKeys(payload.data)).toEqual([]);
    expect(findSourceKeys(payload.names)).toEqual([]);
    expect(JSON.stringify(payload.data)).not.toContain('طبقات ابن سعد');
  });
});
