// @vitest-environment node
/**
 * Cross-workspace copies must never carry MORE about a person than the
 * borrower was allowed to SEE on the surface they borrowed from.
 *
 *  - public-slug (whole published tree) → the public redaction (private people
 *    blanked, living people's exact birth hidden, source kunya/birth-date
 *    settings applied) — the same pass `/family/[slug]` serves.
 *  - private share-token branch, and every anchored branch-pointer copy
 *    (manual copy, token revoke, going-private freeze) → the member redaction
 *    (private people blanked), exactly what the live `GET /tree` merge showed.
 *
 * Each path runs through the REAL mapper / redactors / prepare / persist with a
 * source tree encrypted under the SOURCE key; the rows handed to `createMany`
 * are decrypted with the TARGET key and searched for the private plaintext.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  generateWorkspaceKey,
  encryptFieldNullable,
  decryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';
import type { DbTree } from '@/lib/tree/mapper';

const SOURCE_WS = 'ws-source';
const TARGET_WS = 'ws-target';
const SOURCE_TREE = 'tree-source';
const TARGET_TREE = 'tree-target';
const ROOT = 'ind-root';
const PRIVATE_ID = 'ind-private';
const LIVING_ID = 'ind-living';
const ANCHOR = 'ind-anchor';

const KEY_A = generateWorkspaceKey(); // source
const KEY_B = generateWorkspaceKey(); // target

// Every plaintext value that belongs to the PRIVATE person.
const PRIVATE_SECRETS = [
  'سرّاء',
  'المخفية',
  'أم الأسرار',
  'ملاحظة خاصة جدا',
  '1991-04-04',
  'مكان الميلاد السري',
  '1411-09-19',
  '2020-01-01',
  'ملاحظة الوفاة السرية',
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function individualBase(treeId: string) {
  const now = new Date();
  return {
    treeId, gedcomId: null, sex: null, isDeceased: false, isPrivate: false,
    createdById: null, createdAt: now, updatedAt: now,
    birthPlaceId: null, deathPlaceId: null, birthPlaceRef: null, deathPlaceRef: null,
    givenName: null, surname: null, fullName: null,
    birthDate: null, birthPlace: null, birthDescription: null, birthNotes: null, birthHijriDate: null,
    deathDate: null, deathPlace: null, deathDescription: null, deathNotes: null, deathHijriDate: null,
    kunya: null, notes: null,
  };
}

function familyBase(treeId: string) {
  return {
    treeId, gedcomId: null,
    marriageContractPlaceId: null, marriagePlaceId: null, divorcePlaceId: null,
    marriageContractPlaceRef: null, marriagePlaceRef: null, divorcePlaceRef: null,
    isUmmWalad: false, isDivorced: false,
    marriageContractDate: null, marriageContractHijriDate: null, marriageContractPlace: null,
    marriageContractDescription: null, marriageContractNotes: null,
    marriageDate: null, marriageHijriDate: null, marriagePlace: null, marriageDescription: null, marriageNotes: null,
    divorceDate: null, divorceHijriDate: null, divorcePlace: null, divorceDescription: null, divorceNotes: null,
  };
}

function buildSourceTree(): DbTree {
  const enc = (v: string) => encryptFieldNullable(v, KEY_A);
  return {
    id: SOURCE_TREE,
    workspaceId: SOURCE_WS,
    individuals: [
      {
        ...individualBase(SOURCE_TREE), id: ROOT, sex: 'M', isDeceased: true,
        givenName: enc('عبدالله'), surname: enc('الجذر'),
        birthDate: enc('1900-01-01'), kunya: enc('أبو عبدالله'), notes: enc('سيرة الجد'),
      },
      {
        ...individualBase(SOURCE_TREE), id: PRIVATE_ID, sex: 'F', isPrivate: true, isDeceased: true,
        givenName: enc('سرّاء'), surname: enc('المخفية'), kunya: enc('أم الأسرار'),
        notes: enc('ملاحظة خاصة جدا'), birthDate: enc('1991-04-04'),
        birthPlace: enc('مكان الميلاد السري'), birthHijriDate: enc('1411-09-19'),
        deathDate: enc('2020-01-01'), deathNotes: enc('ملاحظة الوفاة السرية'),
      },
      {
        ...individualBase(SOURCE_TREE), id: LIVING_ID, sex: 'M',
        givenName: enc('ليث'), birthDate: enc('1995-02-02'), notes: enc('سيرة ليث'),
      },
    ],
    families: [
      {
        ...familyBase(SOURCE_TREE), id: 'fam-root', husbandId: ROOT, wifeId: null,
        children: [
          { familyId: 'fam-root', individualId: PRIVATE_ID },
          { familyId: 'fam-root', individualId: LIVING_ID },
        ],
      },
    ],
  } as unknown as DbTree;
}

function buildTargetTree(): DbTree {
  return {
    id: TARGET_TREE,
    workspaceId: TARGET_WS,
    individuals: [
      {
        ...individualBase(TARGET_TREE), id: ANCHOR, sex: 'M',
        givenName: encryptFieldNullable('المرساة', KEY_B),
      },
    ],
    families: [],
  } as unknown as DbTree;
}

// ---------------------------------------------------------------------------
// Mocks — only I/O. Mapper, redactors, prepare and persist are REAL.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const { captured, db } = vi.hoisted(() => {
const captured: { individuals: Record<string, unknown>[] } = { individuals: [] };
const db = {
  familyTree: {
    create: vi.fn(async () => ({ id: 'tree-new' })),
    count: vi.fn(async () => 0),
    findFirst: vi.fn(async () => ({ id: SOURCE_TREE })),
  },
  workspace: { findUnique: vi.fn() },
  individual: {
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      captured.individuals.push(...data);
      return { count: data.length };
    }),
  },
  family: {
    createMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  },
  familyChild: { create: vi.fn(async () => ({})) },
  ancestryJump: { createMany: vi.fn(async () => ({ count: 0 })) },
  copyProvenance: { create: vi.fn(async () => ({})) },
  branchPointer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(async () => ({})),
    count: vi.fn(async () => 1),
  },
  branchShareToken: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  collectionItem: { updateMany: vi.fn(async () => ({ count: 1 })) },
  workspaceMembership: { findMany: vi.fn(async () => []) },
  notification: { createMany: vi.fn(async () => ({})) },
  treeEditLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
};
return { captured, db };
});

vi.mock('@/lib/db', () => ({ prisma: db }));

vi.mock('@/lib/tree/queries', () => ({
  getTreeByIdWithIncludes: vi.fn(async () => buildSourceTree()),
  getTreeByWorkspaceId: vi.fn(async () => buildSourceTree()),
  getOrCreateTree: vi.fn(async () => buildTargetTree()),
  getOrCreateTargetTree: vi.fn(async () => buildSourceTree()),
  touchTreeTimestamp: vi.fn(async () => undefined),
  TREE_INCLUDES: {},
}));

vi.mock('@/lib/tree/encryption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/encryption')>()),
  getWorkspaceKey: vi.fn(async (ws: string) => (ws === SOURCE_WS ? KEY_A : KEY_B)),
}));

vi.mock('@/lib/api/workspace-auth', () => ({
  requireWorkspaceAdmin: vi.fn(async () => ({ user: { id: 'admin-1' } })),
  isErrorResponse: (r: unknown) => r instanceof NextResponse,
}));

vi.mock('@/lib/tree/source-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/source-copy')>()),
  copySources: vi.fn(async () => ({ skippedSourceFiles: 0 })),
}));

// A swallowed error would silently skip the copy and make "no secrets" pass
// vacuously — surface it instead.
vi.mock('@/lib/api/swallowed-error-log', () => ({
  logSwallowedAuditError: vi.fn((_ctx: unknown, _meta: unknown, err: unknown) => {
    throw err;
  }),
}));

import { copyBorrowedBranchIntoNewExtraTree } from '@/lib/collections/copy-borrowed';
import { WHOLE_TREE_ROOT, type ResolvedLinkSource } from '@/lib/collections/resolve-link';
import { freezeDependentPointers, freezeCollectionLinks } from '@/lib/tree/going-private';
import { POST as copyPointer } from '@/app/api/workspaces/[id]/branch-pointers/[pointerId]/copy/route';
import { DELETE as revokeToken } from '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every encrypted field of a captured row, decrypted with the TARGET key. */
function decryptedValues(row: Row): string[] {
  const out: string[] = [];
  for (const value of Object.values(row)) {
    if (value instanceof Uint8Array) {
      const plain = decryptFieldNullable(Buffer.from(value), KEY_B);
      if (plain) out.push(plain);
    }
  }
  return out;
}

function allCopiedPlaintext(): string[] {
  return captured.individuals.flatMap(decryptedValues);
}

function expectNoPrivateSecrets() {
  // Guard against a vacuous pass: the copy really ran.
  expect(captured.individuals.length).toBeGreaterThan(0);
  const plain = allCopiedPlaintext();
  for (const secret of PRIVATE_SECRETS) {
    expect(plain.some((p) => p.includes(secret)), `leaked: ${secret}`).toBe(false);
  }
}

function rowByGivenName(name: string): Row | undefined {
  return captured.individuals.find(
    (r) => decryptFieldNullable(r.givenName as Buffer | null, KEY_B) === name,
  );
}

function field(row: Row | undefined, key: string): string | null {
  return decryptFieldNullable((row?.[key] ?? null) as Buffer | null, KEY_B);
}

function expectPublicRootIntact() {
  const root = rowByGivenName('عبدالله');
  expect(root).toBeDefined();
  expect(field(root, 'surname')).toBe('الجذر');
  expect(field(root, 'birthDate')).toBe('1900-01-01');
  expect(field(root, 'notes')).toBe('سيرة الجد');
}

const branchToken: ResolvedLinkSource = {
  type: 'private-token', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE,
  rootIndividualId: ROOT, depthLimit: null, includeGrafts: false,
  isPublic: false, shareTokenId: 'tok-1', allowReuse: true,
};
const publicSlug: ResolvedLinkSource = {
  ...branchToken, type: 'public-slug', rootIndividualId: WHOLE_TREE_ROOT,
  isPublic: true, shareTokenId: null,
};

const ANCHORED_POINTER = {
  id: 'ptr-1',
  sourceWorkspaceId: SOURCE_WS,
  targetWorkspaceId: TARGET_WS,
  rootIndividualId: ROOT,
  selectedIndividualId: ROOT,
  anchorIndividualId: ANCHOR,
  relationship: 'child',
  depthLimit: null,
  includeGrafts: false,
  status: 'active',
  isCollectionLink: false,
  shareTokenId: 'tok-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  captured.individuals = [];
  db.workspace.findUnique.mockResolvedValue({
    enableKunya: true, hideBirthDateForFemale: false, hideBirthDateForMale: false,
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Collections add-by-link «copied»
// ---------------------------------------------------------------------------

describe('collection copy of a PUBLIC tree (public slug) — public redaction', () => {
  test('carries none of a private person\'s name, kunya, notes or dates', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: publicSlug, nameAr: 'نسخة' });
    expectNoPrivateSecrets();
  });

  test('keeps the private person as a blanked placeholder so structure stays whole', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: publicSlug, nameAr: 'نسخة' });
    expect(captured.individuals).toHaveLength(3);
    expect(captured.individuals.filter((r) => r.isPrivate === true)).toHaveLength(1);
  });

  test('hides a living person\'s exact birth date, as the public page does', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: publicSlug, nameAr: 'نسخة' });
    const living = rowByGivenName('ليث');
    expect(living).toBeDefined();
    expect(field(living, 'birthDate')).toBeNull();
    expect(field(living, 'notes')).toBe('سيرة ليث');
  });

  test('applies the source family\'s kunya setting (off → no kunya copied)', async () => {
    db.workspace.findUnique.mockResolvedValue({
      enableKunya: false, hideBirthDateForFemale: false, hideBirthDateForMale: false,
    });
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: publicSlug, nameAr: 'نسخة' });
    expect(allCopiedPlaintext()).not.toContain('أبو عبدالله');
  });

  test('copies a public deceased person intact', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: publicSlug, nameAr: 'نسخة' });
    expectPublicRootIntact();
    expect(field(rowByGivenName('عبدالله'), 'kunya')).toBe('أبو عبدالله');
  });
});

describe('collection copy of a PRIVATE shared branch (share code) — member redaction', () => {
  test('carries none of a private person\'s name, kunya, notes or dates', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: branchToken, nameAr: 'فرع' });
    expectNoPrivateSecrets();
  });

  test('copies a public person intact', async () => {
    await copyBorrowedBranchIntoNewExtraTree({ addingWorkspaceId: TARGET_WS, source: branchToken, nameAr: 'فرع' });
    expectPublicRootIntact();
  });
});

describe('going-private freeze of a collection link — public redaction', () => {
  function collectionPointer() {
    return {
      id: 'cptr-1',
      sourceWorkspaceId: SOURCE_WS,
      targetWorkspaceId: TARGET_WS,
      rootIndividualId: ROOT,
      depthLimit: null,
      includeGrafts: false,
      rootIndividual: { tree: { id: SOURCE_TREE, visibility: 'private', allowReuse: true } },
      collectionItems: [{ id: 'item-1', titleAr: 'فرع' }],
    };
  }

  test('the frozen copy carries none of a private person\'s details', async () => {
    db.branchPointer.findMany.mockResolvedValue([collectionPointer()]);
    const res = await freezeCollectionLinks(SOURCE_WS);
    expect(res.frozen).toBe(1);
    expectNoPrivateSecrets();
  });

  test('the frozen copy keeps a public person intact', async () => {
    db.branchPointer.findMany.mockResolvedValue([collectionPointer()]);
    await freezeCollectionLinks(SOURCE_WS);
    expectPublicRootIntact();
  });
});

// ---------------------------------------------------------------------------
// Anchored branch pointers (the member tree merge showed member redaction)
// ---------------------------------------------------------------------------

describe('going-private freeze of a branch pointer — member redaction', () => {
  test('the frozen copy carries none of a private person\'s details', async () => {
    db.branchPointer.findMany.mockResolvedValue([ANCHORED_POINTER]);
    const res = await freezeDependentPointers(SOURCE_WS);
    expect(res.frozen).toBe(1);
    expectNoPrivateSecrets();
  });

  test('the frozen copy keeps a public person intact', async () => {
    db.branchPointer.findMany.mockResolvedValue([ANCHORED_POINTER]);
    await freezeDependentPointers(SOURCE_WS);
    expectPublicRootIntact();
  });
});

describe('manual branch-pointer copy (POST …/copy) — member redaction', () => {
  function copy() {
    return copyPointer(
      new NextRequest(`http://localhost/api/workspaces/${TARGET_WS}/branch-pointers/ptr-1/copy`, { method: 'POST' }),
      { params: Promise.resolve({ id: TARGET_WS, pointerId: 'ptr-1' }) },
    );
  }

  test('the copy carries none of a private person\'s details', async () => {
    db.branchPointer.findUnique.mockResolvedValue(ANCHORED_POINTER);
    const res = await copy();
    expect(res.status).toBe(200);
    expectNoPrivateSecrets();
  });

  test('the copy keeps a public person intact', async () => {
    db.branchPointer.findUnique.mockResolvedValue(ANCHORED_POINTER);
    await copy();
    expectPublicRootIntact();
  });
});

describe('share-token revoke auto deep-copy (DELETE share-tokens/[tokenId]) — member redaction', () => {
  function revoke() {
    return revokeToken(
      new NextRequest(`http://localhost/api/workspaces/${SOURCE_WS}/share-tokens/tok-1`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: SOURCE_WS, tokenId: 'tok-1' }) },
    );
  }

  beforeEach(() => {
    db.branchShareToken.findUnique.mockResolvedValue({
      id: 'tok-1', sourceWorkspaceId: SOURCE_WS, isRevoked: false,
    });
    db.branchPointer.findMany.mockResolvedValue([ANCHORED_POINTER]);
  });

  test('the copy carries none of a private person\'s details', async () => {
    const res = await revoke();
    expect(res.status).toBe(200);
    expect((await res.json()).copiedPointers).toBe(1);
    expectNoPrivateSecrets();
  });

  test('the copy keeps a public person intact', async () => {
    await revoke();
    expectPublicRootIntact();
  });
});
