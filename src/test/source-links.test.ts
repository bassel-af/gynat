/**
 * Sources («المصادر») — `source-links.ts`: link-target validation, the
 * last-link outcome, loading linked people, and the household of a person.
 */
import { describe, test, expect, vi } from 'vitest';
import { encryptField } from '@/lib/crypto/workspace-encryption';
import {
  validateLinkTargets,
  lastLinkOutcome,
  loadLinkedPeople,
  householdIds,
} from '@/lib/tree/source-links';
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';

const KEY = Buffer.alloc(32, 4);
const TREE = 'bbbbbbbb-1111-4111-9111-111111111111';
const OTHER_TREE = 'bbbbbbbb-2222-4222-9222-222222222222';
const A = 'cccccccc-0000-4000-8000-000000000001';
const B = 'cccccccc-0000-4000-8000-000000000002';
const PRIV = 'cccccccc-0000-4000-8000-000000000003';
const FOREIGN = 'cccccccc-0000-4000-8000-000000000004';
const ABSENT = 'cccccccc-0000-4000-8000-0000000000ff';

const ROWS = [
  { id: A, treeId: TREE, isPrivate: false },
  { id: B, treeId: TREE, isPrivate: false },
  { id: PRIV, treeId: TREE, isPrivate: true },
  { id: FOREIGN, treeId: OTHER_TREE, isPrivate: false },
];

function fakeDb() {
  return {
    individual: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; treeId: string } }) =>
        ROWS.filter((r) => where.id.in.includes(r.id) && r.treeId === where.treeId).map((r) => ({
          id: r.id,
          isPrivate: r.isPrivate,
        })),
      ),
    },
  };
}

describe('validateLinkTargets', () => {
  test('accepts people of this tree and dedupes them', async () => {
    const res = await validateLinkTargets(fakeDb(), TREE, [A, B, A], { kind: 'member' });
    expect(res).toEqual({ ok: true, people: [{ id: A, isPrivate: false }, { id: B, isPrivate: false }] });
  });

  test('another tree, nonexistent and malformed ids all fail the same way', async () => {
    for (const bad of [FOREIGN, ABSENT, 'not-a-uuid']) {
      expect(await validateLinkTargets(fakeDb(), TREE, [A, bad], { kind: 'admin' })).toEqual({ ok: false });
    }
  });

  test('a malformed id never reaches the database', async () => {
    const db = fakeDb();
    await validateLinkTargets(db, TREE, ['x'], { kind: 'admin' });
    expect(db.individual.findMany).not.toHaveBeenCalled();
  });

  test('a private person: refused for a non-admin (same answer), allowed for an admin', async () => {
    expect(await validateLinkTargets(fakeDb(), TREE, [PRIV], { kind: 'member' })).toEqual({ ok: false });
    expect(await validateLinkTargets(fakeDb(), TREE, [PRIV], { kind: 'admin' })).toEqual({
      ok: true,
      people: [{ id: PRIV, isPrivate: true }],
    });
  });

  test('no ids is ok and queries nothing', async () => {
    const db = fakeDb();
    expect(await validateLinkTargets(db, TREE, [], { kind: 'member' })).toEqual({ ok: true, people: [] });
    expect(db.individual.findMany).not.toHaveBeenCalled();
  });
});

describe('lastLinkOutcome', () => {
  test('links remain → none', () => {
    expect(lastLinkOutcome({ isTreeWide: false, linksBefore: 2, linksAfter: 1 })).toBe('none');
  });

  test('already an orphan → none (no question for a source that had nobody)', () => {
    expect(lastLinkOutcome({ isTreeWide: false, linksBefore: 0, linksAfter: 0 })).toBe('none');
  });

  test('tree-wide source never asks', () => {
    expect(lastLinkOutcome({ isTreeWide: true, linksBefore: 0, linksAfter: 0 })).toBe('none');
  });

  test('last link removed without a choice → ask', () => {
    expect(lastLinkOutcome({ isTreeWide: false, linksBefore: 1, linksAfter: 0 })).toBe('ask');
  });

  test('last link removed with a choice → that choice', () => {
    expect(lastLinkOutcome({ isTreeWide: false, linksBefore: 3, linksAfter: 0, onLastLink: 'delete' })).toBe('delete');
    expect(lastLinkOutcome({ isTreeWide: false, linksBefore: 1, linksAfter: 0, onLastLink: 'keep' })).toBe('keep');
  });
});

describe('loadLinkedPeople', () => {
  test('groups decrypted names per source, in link order', async () => {
    const db = {
      sourceLink: {
        findMany: vi.fn(async () => [
          { sourceId: 'S1', individualId: A, individual: { isPrivate: false, givenName: encryptField('محمد', KEY), surname: encryptField('السعيد', KEY), fullName: null } },
          { sourceId: 'S1', individualId: PRIV, individual: { isPrivate: true, givenName: encryptField('سرّي', KEY), surname: null, fullName: null } },
          { sourceId: 'S2', individualId: B, individual: { isPrivate: false, givenName: null, surname: null, fullName: encryptField('علي بن محمد', KEY) } },
        ]),
      },
    };
    const map = await loadLinkedPeople(db, KEY, ['S1', 'S2', 'S3']);
    expect(map.get('S1')).toEqual([
      { id: A, name: 'محمد السعيد', isPrivate: false },
      { id: PRIV, name: 'سرّي', isPrivate: true },
    ]);
    expect(map.get('S2')).toEqual([{ id: B, name: 'علي بن محمد', isPrivate: false }]);
    expect(map.get('S3')).toEqual([]);
  });

  test('no source ids queries nothing', async () => {
    const db = { sourceLink: { findMany: vi.fn() } };
    expect((await loadLinkedPeople(db, KEY, [])).size).toBe(0);
    expect(db.sourceLink.findMany).not.toHaveBeenCalled();
  });
});

describe('householdIds', () => {
  const EV: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  function data(): GedcomData {
    const individuals: Record<string, Individual> = {};
    const families: Record<string, Family> = {};
    const ind = (id: string) => {
      individuals[id] = { id, familiesAsSpouse: [], familyAsChild: null } as unknown as Individual;
    };
    ['F', 'M', 'SELF', 'SIB', 'HALF', 'STEP', 'W1', 'W2', 'K1', 'K2', 'GK', 'UNCLE'].forEach(ind);
    const fam = (id: string, h: string | null, w: string | null, kids: string[]) => {
      families[id] = { id, husband: h, wife: w, children: kids, marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false } as unknown as Family;
      if (h) individuals[h].familiesAsSpouse.push(id);
      if (w) individuals[w].familiesAsSpouse.push(id);
      kids.forEach((k) => (individuals[k].familyAsChild = id));
    };
    fam('P', 'F', 'M', ['SELF', 'SIB']);
    fam('P2', 'F', 'STEP', ['HALF']);
    fam('S1', 'SELF', 'W1', ['K1']);
    fam('S2', 'SELF', 'W2', ['K2']);
    fam('K', 'K1', null, ['GK']);
    return { individuals, families };
  }

  test('parents, spouses, siblings (half too) and children — never self or further kin', () => {
    expect([...householdIds(data(), 'SELF')].sort()).toEqual(['F', 'HALF', 'K1', 'K2', 'M', 'SIB', 'W1', 'W2'].sort());
  });

  test('unknown person → empty', () => {
    expect(householdIds(data(), 'NOPE').size).toBe(0);
  });
});

// ===========================================================================
// R2 — sharing helpers
// ===========================================================================

import {
  loadHouseholdIds,
  planLinkChange,
  planViewerDelete,
  visibleNamedPeople,
  pickFamilyHints,
} from '@/lib/tree/source-links';

describe('loadHouseholdIds (DB)', () => {
  // SELF child of (F, M); F also married STEP with child HALF; SELF married W with child K.
  const FAMILIES = [
    { id: 'fam-p', treeId: TREE, husbandId: 'F', wifeId: 'M', children: ['SELF', 'SIB'] },
    { id: 'fam-p2', treeId: TREE, husbandId: 'F', wifeId: 'STEP', children: ['HALF'] },
    { id: 'fam-s', treeId: TREE, husbandId: 'SELF', wifeId: 'W', children: ['K'] },
    { id: 'fam-k', treeId: TREE, husbandId: 'K', wifeId: null, children: ['GK'] },
    { id: 'fam-x', treeId: OTHER_TREE, husbandId: 'SELF', wifeId: 'X', children: ['XK'] },
  ];
  function db() {
    return {
      familyChild: {
        findMany: vi.fn(async ({ where }: { where: { individualId: string; family: { treeId: string } } }) =>
          FAMILIES.filter((f) => f.treeId === where.family.treeId && f.children.includes(where.individualId)).map((f) => ({
            family: { husbandId: f.husbandId, wifeId: f.wifeId },
          })),
        ),
      },
      family: {
        findMany: vi.fn(async ({ where }: { where: { treeId: string; OR: { husbandId?: { in: string[] }; wifeId?: { in: string[] } }[] } }) => {
          const ids = new Set(where.OR.flatMap((c) => c.husbandId?.in ?? c.wifeId?.in ?? []));
          return FAMILIES.filter(
            (f) => f.treeId === where.treeId && ((f.husbandId && ids.has(f.husbandId)) || (f.wifeId && ids.has(f.wifeId))),
          ).map((f) => ({ husbandId: f.husbandId, wifeId: f.wifeId, children: f.children.map((c) => ({ individualId: c })) }));
        }),
      },
    };
  }

  test('parents, spouses, siblings (half too) and children of this tree only', async () => {
    expect([...(await loadHouseholdIds(db(), TREE, 'SELF'))].sort()).toEqual(['F', 'HALF', 'K', 'M', 'SIB', 'W'].sort());
  });

  test('a person with no family → empty', async () => {
    expect((await loadHouseholdIds(db(), TREE, 'LONE')).size).toBe(0);
  });
});

describe('planLinkChange', () => {
  const linked = [
    { id: A, isPrivate: false },
    { id: PRIV, isPrivate: true },
  ];

  test('adds only people not already linked, removes only linked people', () => {
    expect(planLinkChange({ linked, add: [A, B], remove: [ABSENT], viewer: { kind: 'admin' } })).toEqual({
      toAdd: [B],
      toRemove: [],
      linksBefore: 2,
      linksAfter: 3,
    });
  });

  test('an admin may remove a private person', () => {
    expect(planLinkChange({ linked, add: [], remove: [PRIV], viewer: { kind: 'admin' } })).toMatchObject({
      toRemove: [PRIV],
      linksAfter: 1,
    });
  });

  test('a non-admin removing a private person is silently ignored (no oracle, link kept)', () => {
    expect(planLinkChange({ linked, add: [], remove: [PRIV, A], viewer: { kind: 'member' } })).toMatchObject({
      toRemove: [A],
      linksAfter: 1,
    });
  });
});

describe('planViewerDelete', () => {
  test('admin deletes the whole source', () => {
    expect(planViewerDelete([{ id: A, isPrivate: false }, { id: PRIV, isPrivate: true }], { kind: 'admin' })).toEqual({ mode: 'all' });
  });

  test('a non-admin with no hidden person deletes the whole source', () => {
    expect(planViewerDelete([{ id: A, isPrivate: false }, { id: B, isPrivate: false }], { kind: 'member' })).toEqual({ mode: 'all' });
  });

  test('a non-admin with a hidden (private) person only unlinks the people they can see', () => {
    expect(planViewerDelete([{ id: A, isPrivate: false }, { id: PRIV, isPrivate: true }], { kind: 'member' })).toEqual({
      mode: 'unlink',
      ids: [A],
    });
  });
});

describe('visibleNamedPeople', () => {
  const people = [
    { id: A, name: 'أ', isPrivate: false },
    { id: PRIV, name: 'سرّي', isPrivate: true },
    { id: B, name: 'ب', isPrivate: false },
  ];

  test('member: only non-private people on a members-level source, names only', () => {
    expect(visibleNamedPeople({ visibility: 'members' }, people, { kind: 'member' })).toEqual([
      { id: A, name: 'أ' },
      { id: B, name: 'ب' },
    ]);
  });

  test('member: nobody on an admins-level source', () => {
    expect(visibleNamedPeople({ visibility: 'admins' }, people, { kind: 'member' })).toEqual([]);
  });

  test('admin: everyone', () => {
    expect(visibleNamedPeople({ visibility: 'admins' }, people, { kind: 'admin' })).toHaveLength(3);
  });

  test('excludes a given person (the one the panel is about)', () => {
    expect(visibleNamedPeople({ visibility: 'members' }, people, { kind: 'member' }, A)).toEqual([{ id: B, name: 'ب' }]);
  });
});

describe('pickFamilyHints', () => {
  test('drops sources already on the person and sources with no visible person, most-linked first, at most 2', () => {
    const picked = pickFamilyHints(
      [
        { id: 'S1', peopleCount: 2, linkedToPerson: false, createdAt: '2026-01-01' },
        { id: 'S2', peopleCount: 5, linkedToPerson: false, createdAt: '2026-01-02' },
        { id: 'S3', peopleCount: 9, linkedToPerson: true, createdAt: '2026-01-03' },
        { id: 'S4', peopleCount: 0, linkedToPerson: false, createdAt: '2026-01-04' },
        { id: 'S5', peopleCount: 2, linkedToPerson: false, createdAt: '2025-01-01' },
      ],
    );
    expect(picked.map((s) => s.id)).toEqual(['S2', 'S5']);
  });
});
