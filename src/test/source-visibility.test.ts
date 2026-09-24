/**
 * Sources («المصادر») — the ONE visibility gate (`src/lib/tree/source-visibility.ts`).
 *
 * | Viewer  | Sees                                                            |
 * |---------|-----------------------------------------------------------------|
 * | admin   | every entry, incl. on private people                            |
 * | member  | level members/public, never on a private person                 |
 * | public  | level public, only on a person the public tree already shows    |
 *
 * Borrowed (`pointed`) people: nobody, in v1 (served from the owning
 * workspace only). Unknown visibility / viewer kind: nobody (fail-closed).
 */
import { describe, test, expect } from 'vitest';
import {
  canViewSourceEntry,
  filterEntriesForViewer,
  inheritedTreeEntry,
  type SourceViewer,
  type SourcePersonContext,
} from '@/lib/tree/source-visibility';

type Level = 'admins' | 'members' | 'public';
const LEVELS: Level[] = ['admins', 'members', 'public'];

const admin: SourceViewer = { kind: 'admin' };
const member: SourceViewer = { kind: 'member' };
const visitor: SourceViewer = { kind: 'public' };

const plain: SourcePersonContext = { isPrivate: false, publicShown: true };
const privatePerson: SourcePersonContext = { isPrivate: true, publicShown: false };
const notShownPublicly: SourcePersonContext = { isPrivate: false, publicShown: false };
const pointed: SourcePersonContext = { isPrivate: false, pointed: true, publicShown: true };

function entry(visibility: Level) {
  return { visibility };
}

// ---------------------------------------------------------------------------
// Person entries — full truth table
// ---------------------------------------------------------------------------

describe('canViewSourceEntry — person entries', () => {
  const table: Array<[string, SourceViewer, SourcePersonContext, Record<Level, boolean>]> = [
    ['admin / plain person', admin, plain, { admins: true, members: true, public: true }],
    ['admin / private person', admin, privatePerson, { admins: true, members: true, public: true }],
    ['admin / not publicly shown', admin, notShownPublicly, { admins: true, members: true, public: true }],
    ['admin / pointed person', admin, pointed, { admins: false, members: false, public: false }],
    ['member / plain person', member, plain, { admins: false, members: true, public: true }],
    ['member / private person', member, privatePerson, { admins: false, members: false, public: false }],
    ['member / not publicly shown', member, notShownPublicly, { admins: false, members: true, public: true }],
    ['member / pointed person', member, pointed, { admins: false, members: false, public: false }],
    ['public / plain person', visitor, plain, { admins: false, members: false, public: true }],
    ['public / private person', visitor, privatePerson, { admins: false, members: false, public: false }],
    ['public / not publicly shown', visitor, notShownPublicly, { admins: false, members: false, public: false }],
    ['public / pointed person', visitor, pointed, { admins: false, members: false, public: false }],
  ];

  for (const [label, viewer, person, expected] of table) {
    for (const level of LEVELS) {
      test(`${label} / ${level} → ${expected[level]}`, () => {
        expect(canViewSourceEntry(entry(level), person, viewer)).toBe(expected[level]);
      });
    }
  }

  test('public viewer: publicShown missing is treated as not shown', () => {
    expect(canViewSourceEntry(entry('public'), { isPrivate: false }, visitor)).toBe(false);
  });

  test('member viewer: a private person hides even with publicShown set', () => {
    expect(canViewSourceEntry(entry('members'), { isPrivate: true, publicShown: true }, member)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tree-wide entry (person = null)
// ---------------------------------------------------------------------------

describe('canViewSourceEntry — tree-wide entry', () => {
  const table: Array<[SourceViewer, Record<Level, boolean>]> = [
    [admin, { admins: true, members: true, public: true }],
    [member, { admins: false, members: true, public: true }],
    [visitor, { admins: false, members: false, public: true }],
  ];
  for (const [viewer, expected] of table) {
    for (const level of LEVELS) {
      test(`${viewer.kind} / ${level} → ${expected[level]}`, () => {
        expect(canViewSourceEntry(entry(level), null, viewer)).toBe(expected[level]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Fail-closed on malformed input
// ---------------------------------------------------------------------------

describe('canViewSourceEntry — fail-closed', () => {
  const badLevels = ['', 'ADMINS', 'everyone', undefined, null, 3] as unknown as Level[];
  for (const viewer of [admin, member, visitor]) {
    for (const bad of badLevels) {
      test(`${viewer.kind} / unknown visibility ${String(bad)} → false`, () => {
        expect(canViewSourceEntry({ visibility: bad }, plain, viewer)).toBe(false);
        expect(canViewSourceEntry({ visibility: bad }, null, viewer)).toBe(false);
      });
    }
  }

  const badViewers = [{ kind: 'owner' }, { kind: '' }, {}, null, undefined] as unknown as SourceViewer[];
  for (const bad of badViewers) {
    test(`unknown viewer ${JSON.stringify(bad)} → false`, () => {
      expect(canViewSourceEntry(entry('public'), plain, bad)).toBe(false);
      expect(canViewSourceEntry(entry('public'), null, bad)).toBe(false);
    });
  }

  test('a non-boolean isPrivate is treated as private', () => {
    const weird = { isPrivate: 'no' } as unknown as SourcePersonContext;
    expect(canViewSourceEntry(entry('public'), weird, member)).toBe(false);
  });

  test('a truthy non-boolean pointed is treated as pointed', () => {
    const weird = { isPrivate: false, pointed: 'yes', publicShown: true } as unknown as SourcePersonContext;
    expect(canViewSourceEntry(entry('public'), weird, admin)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterEntriesForViewer
// ---------------------------------------------------------------------------

describe('filterEntriesForViewer', () => {
  const entries = LEVELS.map((visibility, i) => ({ id: `E${i}`, visibility }));

  test('admin keeps every entry, in order', () => {
    expect(filterEntriesForViewer(entries, plain, admin).map((e) => e.id)).toEqual(['E0', 'E1', 'E2']);
  });

  test('member keeps members + public entries', () => {
    expect(filterEntriesForViewer(entries, plain, member).map((e) => e.id)).toEqual(['E1', 'E2']);
  });

  test('public keeps only public entries on a shown person', () => {
    expect(filterEntriesForViewer(entries, plain, visitor).map((e) => e.id)).toEqual(['E2']);
  });

  test('member sees nothing on a private person', () => {
    expect(filterEntriesForViewer(entries, privatePerson, member)).toEqual([]);
  });

  test('empty input → empty output', () => {
    expect(filterEntriesForViewer([], plain, admin)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// inheritedTreeEntry — «من مصدر الشجرة»
// ---------------------------------------------------------------------------

describe('inheritedTreeEntry', () => {
  const treeEntry = { id: 'TREE', visibility: 'members' as Level };

  test('shows when the person has no own entries and the tree entry passes', () => {
    expect(inheritedTreeEntry([], treeEntry, plain, member)).toBe(treeEntry);
  });

  test('hidden when the person has an own entry visible to this viewer', () => {
    expect(inheritedTreeEntry([{ id: 'E', visibility: 'members' }], treeEntry, plain, member)).toBeNull();
  });

  test('shows when the person\'s own entries are all hidden from this viewer', () => {
    expect(inheritedTreeEntry([{ id: 'E', visibility: 'admins' }], treeEntry, plain, member)).toBe(treeEntry);
  });

  test('hidden when the tree entry itself fails the gate', () => {
    expect(inheritedTreeEntry([], { id: 'TREE', visibility: 'admins' }, plain, member)).toBeNull();
  });

  test('null tree entry → null', () => {
    expect(inheritedTreeEntry([], null, plain, admin)).toBeNull();
  });

  test('never inherited onto a private person for a member', () => {
    expect(inheritedTreeEntry([], treeEntry, privatePerson, member)).toBeNull();
  });

  test('admin sees the inherited entry on a private person', () => {
    expect(inheritedTreeEntry([], treeEntry, privatePerson, admin)).toBe(treeEntry);
  });

  test('never inherited onto a person the public tree does not show', () => {
    const publicTree = { id: 'TREE', visibility: 'public' as Level };
    expect(inheritedTreeEntry([], publicTree, notShownPublicly, visitor)).toBeNull();
    expect(inheritedTreeEntry([], publicTree, plain, visitor)).toBe(publicTree);
  });

  test('never inherited onto a borrowed (pointed) person', () => {
    expect(inheritedTreeEntry([], treeEntry, pointed, admin)).toBeNull();
  });
});
