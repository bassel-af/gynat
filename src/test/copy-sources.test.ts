// @vitest-environment node
/**
 * Sources («المصادر») step 8 — `copySources`, the ONE helper every copy path
 * uses to carry sources into the copied tree.
 *
 * Runs against a small in-memory transaction fake with REAL AES-GCM keys, so
 * the re-encryption assertions decrypt the actual written bytes.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  encryptField,
  encryptBytes,
  decryptField,
  decryptBytes,
  generateWorkspaceKey,
} from '@/lib/crypto/workspace-encryption';
import { copySources, type CopySourcesInput } from '@/lib/tree/source-copy';

const SOURCE_KEY = generateWorkspaceKey();
const TARGET_KEY = generateWorkspaceKey();

const FROM_TREE = 'from-tree';
const TO_TREE = 'to-tree';
const TARGET_WS = 'target-ws';
const SOURCE_USER = 'source-user';

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

type Visibility = 'admins' | 'members' | 'public';

interface EntryRow {
  id: string;
  treeId: string;
  isTreeWide: boolean;
  visibility: Visibility;
  text: Buffer | null;
  createdById: string | null;
  createdAt: Date;
}
interface LinkRow {
  sourceId: string;
  individualId: string;
  treeId: string;
  createdById: string | null;
  createdAt: Date;
}
interface FileRow {
  id: string;
  entryId: string | null;
  treeId: string;
  mimeType: string;
  sizeBytes: number;
  fileName: Buffer;
  createdById: string | null;
  createdAt: Date;
}

let entries: EntryRow[];
let links: LinkRow[];
let files: FileRow[];
let fileData: Map<string, Buffer>;
let privateIds: Set<string>;
/** Linked people NOT marked deceased (presumed living unless born 130+ years ago). */
let livingIds: Set<string>;
/** Plaintext birth dates, stored encrypted under the SOURCE key. */
let birthDates: Map<string, string>;
let quotaBytes: bigint;
let usedBytes: number;
let lockedWorkspaces: string[];
let fileSeq: number;

function makeTx() {
  return {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      lockedWorkspaces.push(String(values[0]));
      return [];
    },
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === TARGET_WS ? { storageQuotaBytes: quotaBytes } : null,
    },
    sourceFile: {
      aggregate: async () => ({ _sum: { sizeBytes: usedBytes } }),
      create: async ({ data }: { data: Omit<FileRow, 'id'> & { data: { create: { data: Buffer } } } }) => {
        const id = `new-file-${++fileSeq}`;
        const { data: nested, ...row } = data;
        files.push({ ...row, id } as FileRow);
        fileData.set(id, Buffer.from(nested.create.data));
        return { id };
      },
    },
    sourceFileData: {
      findUnique: async ({ where }: { where: { fileId: string } }) => {
        const data = fileData.get(where.fileId);
        return data ? { data } : null;
      },
    },
    sourceEntry: {
      findMany: async ({ where }: { where: { treeId: string; visibility?: Visibility; isTreeWide?: boolean } }) =>
        entries
          .filter(
            (e) =>
              e.treeId === where.treeId &&
              (where.visibility === undefined || e.visibility === where.visibility) &&
              (where.isTreeWide === undefined || e.isTreeWide === where.isTreeWide),
          )
          .map((e) => ({
            ...e,
            links: links
              .filter((l) => l.sourceId === e.id)
              .map((l) => ({
                ...l,
                individual: {
                  isPrivate: privateIds.has(l.individualId),
                  isDeceased: !livingIds.has(l.individualId),
                  birthDate: birthDates.has(l.individualId)
                    ? encryptField(birthDates.get(l.individualId)!, SOURCE_KEY)
                    : null,
                },
              })),
            files: files.filter((f) => f.entryId === e.id),
          })),
      create: async ({ data }: { data: EntryRow }) => {
        entries.push({ ...data });
        return { id: data.id };
      },
    },
    sourceLink: {
      createMany: async ({ data }: { data: LinkRow[] }) => {
        links.push(...data);
        return { count: data.length };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture builders (source tree under SOURCE_KEY)
// ---------------------------------------------------------------------------

function addSource(
  id: string,
  opts: { visibility?: Visibility; text?: string | null; people?: string[]; treeWide?: boolean; key?: Buffer },
) {
  const key = opts.key ?? SOURCE_KEY;
  entries.push({
    id,
    treeId: FROM_TREE,
    isTreeWide: opts.treeWide ?? false,
    visibility: opts.visibility ?? 'public',
    text: opts.text === null ? null : encryptField(opts.text ?? `text of ${id}`, key),
    createdById: SOURCE_USER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  for (const p of opts.people ?? []) {
    links.push({ sourceId: id, individualId: p, treeId: FROM_TREE, createdById: SOURCE_USER, createdAt: new Date() });
  }
}

function addFile(entryId: string | null, id: string, sizeBytes: number, key: Buffer = SOURCE_KEY) {
  files.push({
    id,
    entryId,
    treeId: FROM_TREE,
    mimeType: 'image/png',
    sizeBytes,
    fileName: encryptField(`${id}.png`, key),
    createdById: SOURCE_USER,
    createdAt: new Date('2026-01-02T00:00:00Z'),
  });
  fileData.set(id, encryptBytes(Buffer.from(`bytes of ${id}`), key));
}

// Landed people: p1..p3 of the copied branch → n1..n3. `outside` never landed.
const ID_MAP = new Map([
  ['p1', 'n1'],
  ['p2', 'n2'],
  ['p3', 'n3'],
  ['priv', 'n-priv'],
  ['alive', 'n-alive'],
  ['old', 'n-old'],
]);

function crossInput(overrides: Partial<CopySourcesInput> = {}): CopySourcesInput {
  return {
    fromTreeId: FROM_TREE,
    toTreeId: TO_TREE,
    targetWorkspaceId: TARGET_WS,
    idMap: ID_MAP,
    mode: { kind: 'cross', sourceKey: SOURCE_KEY, targetKey: TARGET_KEY },
    includeTreeWide: false,
    ...overrides,
  };
}

function sameInput(overrides: Partial<CopySourcesInput> = {}): CopySourcesInput {
  return crossInput({ mode: { kind: 'same' }, includeTreeWide: true, ...overrides });
}

const copied = () => entries.filter((e) => e.treeId === TO_TREE);
const copiedLinks = () => links.filter((l) => l.treeId === TO_TREE);
const copiedFiles = () => files.filter((f) => f.treeId === TO_TREE);
const textOf = (e: EntryRow, key: Buffer) => (e.text ? decryptField(e.text, key) : null);

beforeEach(() => {
  entries = [];
  links = [];
  files = [];
  fileData = new Map();
  privateIds = new Set(['priv']);
  livingIds = new Set(['alive', 'old']);
  birthDates = new Map([
    ['alive', '1 JAN 1990'],
    ['old', '12 JAN 1850'],
  ]);
  quotaBytes = BigInt(1_000_000);
  usedBytes = 0;
  lockedWorkspaces = [];
  fileSeq = 0;
});

// ---------------------------------------------------------------------------
// Level filter
// ---------------------------------------------------------------------------

describe('copySources — level filter', () => {
  test('a cross-family copy carries only public-level sources', async () => {
    addSource('s-admins', { visibility: 'admins', people: ['p1'] });
    addSource('s-members', { visibility: 'members', people: ['p1'] });
    addSource('s-public', { visibility: 'public', people: ['p1'] });

    await copySources(makeTx() as never, crossInput());

    expect(copied().map((e) => textOf(e, TARGET_KEY))).toEqual(['text of s-public']);
  });

  test('a same-workspace copy carries every level', async () => {
    addSource('s-admins', { visibility: 'admins', people: ['p1'] });
    addSource('s-members', { visibility: 'members', people: ['p1'] });
    addSource('s-public', { visibility: 'public', people: ['p1'] });

    await copySources(makeTx() as never, sameInput());

    expect(copied().map((e) => e.visibility).sort()).toEqual(['admins', 'members', 'public']);
  });

  test('a same-workspace copy keeps a source linked to nobody', async () => {
    addSource('s-orphan', { visibility: 'admins', people: [] });

    await copySources(makeTx() as never, sameInput());

    expect(copied()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

describe('copySources — links', () => {
  test('a shared source keeps only the links of people who landed, re-pointed to their new ids', async () => {
    addSource('s-book', { people: ['p1', 'p2', 'p3', 'outside'] });

    await copySources(makeTx() as never, crossInput());

    const [book] = copied();
    expect(copiedLinks().filter((l) => l.sourceId === book.id).map((l) => l.individualId).sort()).toEqual([
      'n1',
      'n2',
      'n3',
    ]);
  });

  test('the copied source gets a fresh id', async () => {
    addSource('s-book', { people: ['p1'] });

    await copySources(makeTx() as never, crossInput());

    expect(copied()[0].id).not.toBe('s-book');
  });

  test('a cross-family copy drops the link to a private person', async () => {
    addSource('s-book', { people: ['p1', 'priv'] });

    await copySources(makeTx() as never, crossInput());

    expect(copiedLinks().map((l) => l.individualId)).toEqual(['n1']);
  });

  test('a cross-family copy skips a source whose only landed person is private', async () => {
    addSource('s-private-only', { people: ['priv'] });

    await copySources(makeTx() as never, crossInput());

    expect(copied()).toHaveLength(0);
  });

  test('a cross-family copy skips a source with no landed person', async () => {
    addSource('s-outside', { people: ['outside'] });

    await copySources(makeTx() as never, crossInput());

    expect(copied()).toHaveLength(0);
  });

  test('a cross-family copy skips a source whose only landed person is presumed living', async () => {
    addSource('s-living', { people: ['alive'] });

    await copySources(makeTx() as never, crossInput());

    expect(copied()).toHaveLength(0);
  });

  test('a cross-family copy carries the source of a deceased person the public tree shows', async () => {
    addSource('s-deceased', { people: ['p1'] });

    await copySources(makeTx() as never, crossInput());

    expect(copiedLinks().map((l) => l.individualId)).toEqual(['n1']);
  });

  test('a cross-family copy treats someone born 130+ years ago as shown (birth date read with the source key)', async () => {
    addSource('s-old', { people: ['old'] });

    await copySources(makeTx() as never, crossInput());

    expect(copiedLinks().map((l) => l.individualId)).toEqual(['n-old']);
  });

  test('a cross-family copy of a mixed source keeps only the links of shown people', async () => {
    addSource('s-mixed', { people: ['p1', 'alive', 'priv', 'old'] });

    await copySources(makeTx() as never, crossInput());

    expect(copiedLinks().map((l) => l.individualId).sort()).toEqual(['n-old', 'n1']);
  });

  test('a same-workspace copy keeps the link to a living person', async () => {
    addSource('s-book', { visibility: 'members', people: ['alive'] });

    await copySources(makeTx() as never, sameInput());

    expect(copiedLinks().map((l) => l.individualId)).toEqual(['n-alive']);
  });

  test('a same-workspace copy keeps the link to a private person', async () => {
    addSource('s-book', { visibility: 'admins', people: ['priv'] });

    await copySources(makeTx() as never, sameInput());

    expect(copiedLinks().map((l) => l.individualId)).toEqual(['n-priv']);
  });

  test('a cross-family copy carries no user id of the source family', async () => {
    addSource('s-book', { people: ['p1'] });
    addFile('s-book', 'f1', 10);

    await copySources(makeTx() as never, crossInput());

    expect([...copied(), ...copiedLinks(), ...copiedFiles()].map((r) => r.createdById)).toEqual([null, null, null]);
  });
});

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

describe('copySources — encryption', () => {
  beforeEach(() => {
    addSource('s-book', { text: 'دفتر العائلة', people: ['p1'] });
    addFile('s-book', 'f1', 10);
  });

  test('cross-family text is re-encrypted under the target key', async () => {
    await copySources(makeTx() as never, crossInput());

    const [book] = copied();
    expect(textOf(book, TARGET_KEY)).toBe('دفتر العائلة');
    expect(() => textOf(book, SOURCE_KEY)).toThrow();
  });

  test('cross-family file names are re-encrypted under the target key', async () => {
    await copySources(makeTx() as never, crossInput());

    const [file] = copiedFiles();
    expect(decryptField(file.fileName, TARGET_KEY)).toBe('f1.png');
    expect(() => decryptField(file.fileName, SOURCE_KEY)).toThrow();
  });

  test('cross-family file bytes are re-encrypted under the target key', async () => {
    await copySources(makeTx() as never, crossInput());

    const bytes = fileData.get(copiedFiles()[0].id)!;
    expect(decryptBytes(bytes, TARGET_KEY).toString()).toBe('bytes of f1');
    expect(() => decryptBytes(bytes, SOURCE_KEY)).toThrow();
  });

  test('a same-workspace copy stays readable with the one workspace key', async () => {
    await copySources(makeTx() as never, sameInput());

    const [book] = copied();
    const [file] = copiedFiles();
    expect(textOf(book, SOURCE_KEY)).toBe('دفتر العائلة');
    expect(decryptField(file.fileName, SOURCE_KEY)).toBe('f1.png');
    expect(decryptBytes(fileData.get(file.id)!, SOURCE_KEY).toString()).toBe('bytes of f1');
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

describe('copySources — files', () => {
  test('a staged (unattached) file is never copied', async () => {
    addSource('s-book', { people: ['p1'] });
    addFile(null, 'staged', 10);

    await copySources(makeTx() as never, sameInput());

    expect(copiedFiles()).toHaveLength(0);
  });

  test('copied files attach to the copied source', async () => {
    addSource('s-book', { people: ['p1'] });
    addFile('s-book', 'f1', 10);
    addFile('s-book', 'f2', 10);

    await copySources(makeTx() as never, crossInput());

    expect(copiedFiles().map((f) => f.entryId)).toEqual([copied()[0].id, copied()[0].id]);
  });
});

// ---------------------------------------------------------------------------
// Tree-wide source
// ---------------------------------------------------------------------------

describe('copySources — tree-wide source', () => {
  test('a branch copy never carries the tree-wide source', async () => {
    addSource('s-tree', { treeWide: true, visibility: 'public' });

    await copySources(makeTx() as never, crossInput({ includeTreeWide: false }));

    expect(copied()).toHaveLength(0);
  });

  test('a whole-tree cross-family copy carries a public tree-wide source as tree-wide', async () => {
    addSource('s-tree', { treeWide: true, visibility: 'public' });

    await copySources(makeTx() as never, crossInput({ includeTreeWide: true }));

    expect(copied().map((e) => e.isTreeWide)).toEqual([true]);
  });

  test('a whole-tree cross-family copy drops an admins-level tree-wide source', async () => {
    addSource('s-tree', { treeWide: true, visibility: 'admins' });

    await copySources(makeTx() as never, crossInput({ includeTreeWide: true }));

    expect(copied()).toHaveLength(0);
  });

  test('a same-workspace whole-tree copy carries the tree-wide source at any level', async () => {
    addSource('s-tree', { treeWide: true, visibility: 'admins' });

    await copySources(makeTx() as never, sameInput());

    expect(copied().map((e) => e.isTreeWide)).toEqual([true]);
  });
});

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

describe('copySources — target quota', () => {
  test('checks the quota of the TARGET workspace under a row lock', async () => {
    addSource('s-book', { people: ['p1'] });
    addFile('s-book', 'f1', 10);

    await copySources(makeTx() as never, crossInput());

    expect(lockedWorkspaces).toEqual([TARGET_WS]);
  });

  test('over quota, the source keeps its text and links but not its files', async () => {
    quotaBytes = BigInt(100);
    usedBytes = 95;
    addSource('s-book', { people: ['p1', 'p2'] });
    addFile('s-book', 'f1', 10);

    await copySources(makeTx() as never, crossInput());

    expect(copied().map((e) => textOf(e, TARGET_KEY))).toEqual(['text of s-book']);
    expect(copiedLinks()).toHaveLength(2);
    expect(copiedFiles()).toHaveLength(0);
  });

  test('over quota, no file bytes are written for a skipped file', async () => {
    quotaBytes = BigInt(100);
    usedBytes = 95;
    addSource('s-book', { people: ['p1'] });
    addFile('s-book', 'f1', 10);
    const before = fileData.size;

    await copySources(makeTx() as never, crossInput());

    expect(fileData.size).toBe(before);
  });

  test('reports how many files were skipped for the quota', async () => {
    quotaBytes = BigInt(100);
    usedBytes = 80;
    addSource('s-a', { people: ['p1'] });
    addFile('s-a', 'fits', 15);
    addFile('s-a', 'too-big', 10);
    addSource('s-b', { people: ['p2'] });
    addFile('s-b', 'also-too-big', 30);

    const result = await copySources(makeTx() as never, crossInput());

    expect(result).toEqual({ skippedSourceFiles: 2 });
    expect(copiedFiles().map((f) => decryptField(f.fileName, TARGET_KEY))).toEqual(['fits.png']);
  });

  test('a files-only source whose files are all skipped is not copied', async () => {
    quotaBytes = BigInt(100);
    usedBytes = 100;
    addSource('s-scan', { text: null, people: ['p1'] });
    addFile('s-scan', 'scan', 10);

    const result = await copySources(makeTx() as never, crossInput());

    expect(copied()).toHaveLength(0);
    expect(copiedLinks()).toHaveLength(0);
    expect(result.skippedSourceFiles).toBe(1);
  });

  test('a files-only source that keeps some of its files is copied', async () => {
    quotaBytes = BigInt(100);
    usedBytes = 90;
    addSource('s-scan', { text: null, people: ['p1'] });
    addFile('s-scan', 'small', 5);
    addFile('s-scan', 'large', 50);

    await copySources(makeTx() as never, crossInput());

    expect(copied()).toHaveLength(1);
    expect(copiedFiles()).toHaveLength(1);
  });

  test('no source to copy takes no lock', async () => {
    addSource('s-admins', { visibility: 'admins', people: ['p1'] });

    const result = await copySources(makeTx() as never, crossInput());

    expect(lockedWorkspaces).toEqual([]);
    expect(result).toEqual({ skippedSourceFiles: 0 });
  });
});
