/**
 * Sources («المصادر») — the tree loader never touches sources.
 *
 * The tree GET payload / `GedcomData` is source-free by construction: the
 * shared `TREE_INCLUDES` never names a source relation (so the loader never
 * reads `source_entries` / `source_files` / `source_file_data`), and
 * `dbTreeToGedcomData` never copies a stray source-shaped field through.
 */
import { describe, test, expect } from 'vitest';
import { TREE_INCLUDES } from '@/lib/tree/queries';
import { dbTreeToGedcomData, type DbTree, type DbIndividual, type DbFamily } from '@/lib/tree/mapper';
import { encryptField } from '@/lib/crypto/workspace-encryption';
import { findSourceKeys, STRAY_SOURCES } from './helpers/source-leak';

const KEY = Buffer.alloc(32, 7);

function dbIndividual(id: string, givenName: string): DbIndividual {
  return {
    id,
    treeId: 'tree-1',
    gedcomId: null,
    givenName: encryptField(givenName, KEY),
    surname: null,
    fullName: null,
    sex: 'M',
    birthDate: null,
    birthPlace: null,
    birthPlaceId: null,
    birthPlaceRef: null,
    birthDescription: null,
    birthNotes: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
    deathPlaceId: null,
    deathPlaceRef: null,
    deathDescription: null,
    deathNotes: null,
    deathHijriDate: null,
    kunya: null,
    notes: null,
    isDeceased: false,
    isPrivate: false,
    // A buggy include would hand the mapper these — they must not surface.
    sourceEntries: STRAY_SOURCES,
    sourceLinks: STRAY_SOURCES,
  } as unknown as DbIndividual;
}

function dbFamily(id: string, husbandId: string, wifeId: string | null): DbFamily {
  return {
    id,
    treeId: 'tree-1',
    gedcomId: null,
    husbandId,
    wifeId,
    children: [{ familyId: id, individualId: 'SON' }],
    isDivorced: false,
    isUmmWalad: false,
    sourceEntries: STRAY_SOURCES,
    sourceLinks: STRAY_SOURCES,
    citations: STRAY_SOURCES,
  } as unknown as DbFamily;
}

describe('tree loader — sources are never selected', () => {
  test('TREE_INCLUDES names no source relation at any depth', () => {
    expect(findSourceKeys(TREE_INCLUDES)).toEqual([]);
  });

  test('TREE_INCLUDES has no sourceFileData / files relation', () => {
    const json = JSON.stringify(TREE_INCLUDES);
    expect(json).not.toMatch(/sourceFile|fileData/i);
  });
});

describe('dbTreeToGedcomData — output is source-free', () => {
  test('stray source relations on the DB rows never reach GedcomData', () => {
    const dbTree = {
      id: 'tree-1',
      workspaceId: 'ws-1',
      individuals: [dbIndividual('DAD', 'محمد'), dbIndividual('SON', 'باسل')],
      families: [dbFamily('F1', 'DAD', null)],
      radaFamilies: [],
      ancestryJumps: [],
      sourceEntries: STRAY_SOURCES,
      sourceFiles: STRAY_SOURCES,
    } as unknown as DbTree;

    const data = dbTreeToGedcomData(dbTree, KEY);
    expect(Object.keys(data.individuals)).toHaveLength(2);
    expect(findSourceKeys(data)).toEqual([]);
  });
});

describe('findSourceKeys (leak detector self-check)', () => {
  test('flags nested source / citation keys', () => {
    const hits = findSourceKeys({
      individuals: { I1: { sources: [] } },
      families: { F1: { citations: [] } },
      sourceEntries: {},
    });
    expect(hits.sort()).toEqual(['$.families.F1.citations', '$.individuals.I1.sources', '$.sourceEntries']);
  });

  test('flags shared-source links (`sourceLinks`) anywhere', () => {
    expect(findSourceKeys({ individuals: { I1: { sourceLinks: [] } }, sourceLinks: [] }).sort()).toEqual([
      '$.individuals.I1.sourceLinks',
      '$.sourceLinks',
    ]);
  });

  test('ignores branch-pointer workspace provenance', () => {
    expect(findSourceKeys({ individuals: { I1: { _sourceWorkspaceId: 'ws' } } })).toEqual([]);
  });
});
