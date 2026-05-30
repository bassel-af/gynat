import { describe, test, expect } from 'vitest';
import { resolveNavigationRoot, getCanvasVisibleIndividuals, findTopmostAncestor } from '@/lib/gedcom/graph';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI', name: overrides.id, givenName: overrides.id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...overrides,
  };
}
const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM', husband: null, wife: null, children: [],
    marriageContract: EMPTY_EVENT, marriage: EMPTY_EVENT, divorce: EMPTY_EVENT,
    isDivorced: false, ...overrides,
  };
}

/**
 * الدالاتي-like fixture.
 *
 *                         ROOT
 *                   ┌──────┴──────┐
 *                   A             B          (two branches)
 *              (×AW)│           (×… )│
 *                  AX             Y ─(×AYMAN, married-in علوان stub)
 *                                 │
 *   AW's birth family (FAM_W): WF ─┬─ AW, WB
 *                                  WB ─(×WBW)─ NEPHEW
 *
 *  ALWAN ─(FAM_AL)─ AYMAN     ← AYMAN's tiny paternal stub
 *
 * AYMAN married Y (a descendant of ROOT in branch B). His own paternal topmost
 * ancestor is ALWAN (a 2-person stub) — that's the "cut off" view. He should
 * instead embed in ROOT's tree, where he renders as Y's married-in spouse.
 *
 * NEPHEW is the child of AW's brother WB — a married-in spouse's nephew, past
 * graft depth, so ROOT can't draw him; he belongs in his own family (WF).
 */
function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    ROOT: makeIndividual({ id: 'ROOT', familiesAsSpouse: ['FAM_R'] }),
    A: makeIndividual({ id: 'A', familyAsChild: 'FAM_R', familiesAsSpouse: ['FAM_A'] }),
    B: makeIndividual({ id: 'B', familyAsChild: 'FAM_R', familiesAsSpouse: ['FAM_B'] }),
    AW: makeIndividual({ id: 'AW', sex: 'F', familyAsChild: 'FAM_W', familiesAsSpouse: ['FAM_A'] }),
    AX: makeIndividual({ id: 'AX', familyAsChild: 'FAM_A' }),
    Y: makeIndividual({ id: 'Y', sex: 'F', familyAsChild: 'FAM_B', familiesAsSpouse: ['FAM_Y'] }),
    AYMAN: makeIndividual({ id: 'AYMAN', familyAsChild: 'FAM_AL', familiesAsSpouse: ['FAM_Y'] }),
    ALWAN: makeIndividual({ id: 'ALWAN', familiesAsSpouse: ['FAM_AL'] }),
    WF: makeIndividual({ id: 'WF', familiesAsSpouse: ['FAM_W'] }),
    WB: makeIndividual({ id: 'WB', familyAsChild: 'FAM_W', familiesAsSpouse: ['FAM_WB'] }),
    WBW: makeIndividual({ id: 'WBW', sex: 'F', familiesAsSpouse: ['FAM_WB'] }),
    NEPHEW: makeIndividual({ id: 'NEPHEW', familyAsChild: 'FAM_WB' }),
  };
  const families: Record<string, Family> = {
    FAM_R: makeFamily({ id: 'FAM_R', husband: 'ROOT', children: ['A', 'B'] }),
    FAM_A: makeFamily({ id: 'FAM_A', husband: 'A', wife: 'AW', children: ['AX'] }),
    FAM_B: makeFamily({ id: 'FAM_B', husband: 'B', children: ['Y'] }),
    FAM_Y: makeFamily({ id: 'FAM_Y', husband: 'AYMAN', wife: 'Y' }),
    FAM_AL: makeFamily({ id: 'FAM_AL', husband: 'ALWAN', children: ['AYMAN'] }),
    FAM_W: makeFamily({ id: 'FAM_W', husband: 'WF', children: ['AW', 'WB'] }),
    FAM_WB: makeFamily({ id: 'FAM_WB', husband: 'WB', wife: 'WBW', children: ['NEPHEW'] }),
  };
  return { individuals, families };
}

describe('getCanvasVisibleIndividuals', () => {
  test('matches the canvas set: root + descendants + spouses + grafts', () => {
    const data = buildFixture();
    const vis = getCanvasVisibleIndividuals(data, 'ROOT');
    // core + descendants
    expect(vis.has('ROOT')).toBe(true);
    expect(vis.has('A')).toBe(true);
    expect(vis.has('B')).toBe(true);
    expect(vis.has('Y')).toBe(true);
    // married-in spouses
    expect(vis.has('AW')).toBe(true);
    expect(vis.has('AYMAN')).toBe(true);
    // grafts (parents/siblings of married-in spouses)
    expect(vis.has('WF')).toBe(true);   // AW's father
    expect(vis.has('WB')).toBe(true);   // AW's brother
    expect(vis.has('ALWAN')).toBe(true); // AYMAN's father
    // NOT drawn: a married-in spouse's nephew is past graft depth
    expect(vis.has('NEPHEW')).toBe(false);
  });
});

describe('resolveNavigationRoot', () => {
  test('embeds a married-in spouse in the family being viewed (not their own stub)', () => {
    const data = buildFixture();
    // Viewing branch A; click AYMAN (married into branch B, hidden from A).
    const target = resolveNavigationRoot(data, 'AYMAN', 'A');

    // He should land in the whole ROOT tree (embedded as Y's spouse), NOT on his
    // isolated paternal stub (ALWAN) which is the old "cut off" behaviour.
    expect(target).toBe('ROOT');
    expect(target).not.toBe(findTopmostAncestor(data, 'AYMAN')); // ALWAN
    // sanity: he is actually drawn under the chosen root
    expect(getCanvasVisibleIndividuals(data, target).has('AYMAN')).toBe(true);
  });

  test('prefers the most context (the family root), not a sub-branch', () => {
    const data = buildFixture();
    // From the whole tree, clicking AYMAN should still embed at ROOT, not at B/Y.
    expect(resolveNavigationRoot(data, 'AYMAN', 'ROOT')).toBe('ROOT');
  });

  test('falls back to the deep relative\'s own family when no nearer root can draw them', () => {
    const data = buildFixture();
    // NEPHEW (a married-in spouse\'s nephew) can\'t be drawn under ROOT, so he
    // embeds in his own family (WF) — shown with his father/sibling, not severed.
    const target = resolveNavigationRoot(data, 'NEPHEW', 'ROOT');
    expect(target).toBe('WF');
    expect(getCanvasVisibleIndividuals(data, target).has('NEPHEW')).toBe(true);
  });

  test('always returns a root under which the clicked person is visible', () => {
    const data = buildFixture();
    for (const start of ['A', 'B', 'ROOT', 'AX']) {
      for (const clicked of ['AYMAN', 'NEPHEW', 'WF', 'ALWAN', 'Y']) {
        const target = resolveNavigationRoot(data, clicked, start);
        expect(getCanvasVisibleIndividuals(data, target).has(clicked)).toBe(true);
      }
    }
  });

  test('handles a clicked person who is already a root ancestor', () => {
    const data = buildFixture();
    // ROOT itself has no parents; resolving toward it returns a root that draws it.
    const target = resolveNavigationRoot(data, 'WF', 'A');
    expect(getCanvasVisibleIndividuals(data, target).has('WF')).toBe(true);
  });
});
