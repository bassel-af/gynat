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
