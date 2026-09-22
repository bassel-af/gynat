import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import type { AncestryJump, Family, GedcomData, Individual } from '@/lib/gedcom/types';
import {
  buildTreeData,
  formatAncestryJumpLabel,
  resolveCanvasRoot,
  type PersonNodeData,
} from '@/components/tree/FamilyTree/buildTreeData';
import { NODE_HEIGHT, VERTICAL_GAP } from '@/components/tree/FamilyTree/layout';

// ---------------------------------------------------------------------------
// «قفزة نسب» on the canvas (spec §10).
//
// The whole canvas story is ONE extra edge per visible jump: `getLayoutedElements`
// derives its parent→children map from the `edges` array, so the jump ancestor
// lands one generation above the descendant with NO layout change at all.
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I@',
    type: 'INDI',
    name: 'Test',
    givenName: 'Test',
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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    id: '@F@',
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...empty },
    marriage: { ...empty },
    divorce: { ...empty },
    isDivorced: false,
    ...overrides,
  };
}

function makeJump(overrides: Partial<AncestryJump> = {}): AncestryJump {
  return {
    id: 'jump-1',
    type: '_ANC_JUMP',
    descendant: '@ADNAN@',
    ancestorFamily: '@F-ISHMAEL@',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  };
}

/**
 * إبراهيم → إسماعيل (× هاجر) → قيدار, and عدنان ⇢ (إسماعيل × هاجر) → معد.
 * عدنان's real distance from إسماعيل is unrecorded — that is the jump.
 */
function makeTree(jumpOverrides: Partial<AncestryJump> = {}): GedcomData {
  const jump = makeJump(jumpOverrides);

  const individuals: Record<string, Individual> = {
    '@IBRAHIM@': makeIndividual({
      id: '@IBRAHIM@', name: 'إبراهيم', givenName: 'إبراهيم', familiesAsSpouse: ['@F-IBRAHIM@'],
    }),
    '@ISHMAEL@': makeIndividual({
      id: '@ISHMAEL@', name: 'إسماعيل', givenName: 'إسماعيل',
      familyAsChild: '@F-IBRAHIM@', familiesAsSpouse: ['@F-ISHMAEL@'],
    }),
    '@HAJAR@': makeIndividual({
      id: '@HAJAR@', name: 'هاجر', givenName: 'هاجر', sex: 'F', familiesAsSpouse: ['@F-ISHMAEL@'],
    }),
    '@QAYDAR@': makeIndividual({
      id: '@QAYDAR@', name: 'قيدار', givenName: 'قيدار', familyAsChild: '@F-ISHMAEL@',
    }),
    '@ADNAN@': makeIndividual({
      id: '@ADNAN@', name: 'عدنان', givenName: 'عدنان',
      familiesAsSpouse: ['@F-ADNAN@'], ancestryJumpAsDescendant: jump.id,
    }),
    '@MAAD@': makeIndividual({
      id: '@MAAD@', name: 'معد', givenName: 'معد', familyAsChild: '@F-ADNAN@',
    }),
  };

  const families: Record<string, Family> = {
    '@F-IBRAHIM@': makeFamily({ id: '@F-IBRAHIM@', husband: '@IBRAHIM@', children: ['@ISHMAEL@'] }),
    '@F-ISHMAEL@': makeFamily({
      id: '@F-ISHMAEL@', husband: '@ISHMAEL@', wife: '@HAJAR@', children: ['@QAYDAR@'],
      ancestryJumpsAsAncestor: [jump.id],
    }),
    '@F-ADNAN@': makeFamily({ id: '@F-ADNAN@', husband: '@ADNAN@', children: ['@MAAD@'] }),
  };

  return { individuals, families, ancestryJumps: { [jump.id]: jump } };
}

const NO_HIGHLIGHT = { ancestors: new Set<string>(), descendants: new Set<string>(), highlightedId: null };

const CALLBACKS = {
  onPersonClick: vi.fn(),
  onOpenSidebar: vi.fn(),
  onRerootToAncestor: vi.fn(),
};

function build(data: GedcomData, rootId: string): { nodes: Node[]; edges: Edge[] } {
  return buildTreeData(data, rootId, 10, '', NO_HIGHLIGHT, null, CALLBACKS);
}

const jumpEdges = (edges: Edge[]) => edges.filter((e) => e.className === 'ancestry-jump');
const nodeById = (nodes: Node[], id: string) => nodes.find((n) => n.id === id);

// ---------------------------------------------------------------------------

describe('canvas — the jump edge', () => {
  it('emits exactly one edge per jump, from the ancestor to the descendant', () => {
    const { nodes, edges } = build(makeTree(), '@ISHMAEL@');

    const jumps = jumpEdges(edges);
    expect(jumps).toHaveLength(1);
    expect(jumps[0].id).toBe('jump-jump-1');
    expect(jumps[0].source).toBe('@ISHMAEL@');
    expect(jumps[0].target).toBe('@ADNAN@');
    expect(nodeById(nodes, '@ADNAN@')).toBeTruthy();
  });

  it('draws it dashed, unselectable, and as a plain built-in bezier (no custom edge type)', () => {
    const [edge] = jumpEdges(build(makeTree(), '@ISHMAEL@').edges);

    expect(edge.type).toBe('bezier');
    expect((edge.style as Record<string, unknown>).strokeDasharray).toBeTruthy();
    expect(edge.selectable).toBe(false);
    expect(edge.focusable).toBe(false);
  });

  it('reuses the sibling parent-edge colour, so tree colour settings apply for free', () => {
    const { edges } = build(makeTree(), '@ISHMAEL@');
    const ordinary = edges.find((e) => e.id === '@ISHMAEL@-@QAYDAR@');
    const [jump] = jumpEdges(edges);

    expect((jump.style as Record<string, string>).stroke)
      .toBe((ordinary!.style as Record<string, string>).stroke);
  });

  it('emits nothing when the ancestor family is not on screen', () => {
    // Rooted on قيدار: إسماعيل's family — the jump's ancestor couple — is above
    // this canvas, so there is no jump to draw here.
    const { nodes, edges } = build(makeTree(), '@QAYDAR@');
    expect(jumpEdges(edges)).toHaveLength(0);
    expect(nodeById(nodes, '@ADNAN@')).toBeUndefined();
  });
});

describe('canvas — the edge label', () => {
  it('states both bounds when both are known', () => {
    expect(formatAncestryJumpLabel({ generationsMin: 4, generationsMax: 40 }))
      .toBe('قفزة نسب · بين 4 و40 جيلاً');
  });

  it('states a lower bound alone', () => {
    expect(formatAncestryJumpLabel({ generationsMin: 4, generationsMax: null }))
      .toBe('قفزة نسب · 4 أجيال فأكثر');
  });

  it('states an upper bound alone', () => {
    expect(formatAncestryJumpLabel({ generationsMin: null, generationsMax: 40 }))
      .toBe('قفزة نسب · حتى 40 جيلاً');
  });

  it('is the bare feature name when no range was stated — it never claims the names are unknown', () => {
    expect(formatAncestryJumpLabel({ generationsMin: null, generationsMax: null }))
      .toBe('قفزة نسب');
  });

  it('carries the range onto the built edge', () => {
    const [withRange] = jumpEdges(build(makeTree({ generationsMin: 4, generationsMax: 40 }), '@ISHMAEL@').edges);
    const [without] = jumpEdges(build(makeTree(), '@ISHMAEL@').edges);

    expect(withRange.label).toBe('قفزة نسب · بين 4 و40 جيلاً');
    expect(without.label).toBe('قفزة نسب');
  });
});

describe('canvas — layout falls out of the extra edge', () => {
  it('places the jump ancestor exactly one generation above the descendant', () => {
    const { nodes } = build(makeTree(), '@ISHMAEL@');

    const ancestor = nodeById(nodes, '@ISHMAEL@')!;
    const descendant = nodeById(nodes, '@ADNAN@')!;
    expect(descendant.position.y - ancestor.position.y).toBe(NODE_HEIGHT + VERTICAL_GAP);
  });

  it("renders the ancestor's own children as siblings of the jump descendant", () => {
    const { nodes } = build(makeTree(), '@ISHMAEL@');

    const uncle = nodeById(nodes, '@QAYDAR@')!;
    const descendant = nodeById(nodes, '@ADNAN@')!;
    expect(uncle.position.y).toBe(descendant.position.y);
    expect(uncle.position.x).not.toBe(descendant.position.x);
  });

  it("keeps drawing the descendant's own subtree below him", () => {
    const { nodes } = build(makeTree(), '@ISHMAEL@');

    const descendant = nodeById(nodes, '@ADNAN@')!;
    const son = nodeById(nodes, '@MAAD@')!;
    expect(son.position.y - descendant.position.y).toBe(NODE_HEIGHT + VERTICAL_GAP);
  });

  it('needs no jump-specific code in layout.ts', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/tree/FamilyTree/layout.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/ancestryJump|قفزة/);
  });
});

describe('canvas — root resolution', () => {
  it('climbs the jump so opening the tree on the descendant shows the ancestor above him', () => {
    const data = makeTree();
    expect(resolveCanvasRoot(data, '@ADNAN@')).toBe('@IBRAHIM@');

    const { nodes } = build(data, '@ADNAN@');
    expect((nodeById(nodes, '@IBRAHIM@')!.data as PersonNodeData).isRoot).toBe(true);
    expect(nodeById(nodes, '@ADNAN@')).toBeTruthy();
  });

  it('leaves a requested root alone when no jump is crossed', () => {
    const data = makeTree();
    // إسماعيل has a recorded father, but nothing about that is a JUMP — the
    // canvas must still root exactly where it was asked to.
    expect(resolveCanvasRoot(data, '@ISHMAEL@')).toBe('@ISHMAEL@');
    expect(resolveCanvasRoot(data, '@QAYDAR@')).toBe('@QAYDAR@');
  });

  it('is a no-op on a tree with no jumps at all', () => {
    const data = makeTree();
    delete data.ancestryJumps;
    delete data.individuals['@ADNAN@'].ancestryJumpAsDescendant;

    expect(resolveCanvasRoot(data, '@ADNAN@')).toBe('@ADNAN@');
    expect(jumpEdges(build(data, '@ISHMAEL@').edges)).toHaveLength(0);
    expect(nodeById(build(data, '@ISHMAEL@').nodes, '@ADNAN@')).toBeUndefined();
  });
});

describe('canvas — the sidebar sees what the canvas draws', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <TreeProvider>{children}</TreeProvider>;

  it('lists the people hanging under a jump, so search can still find them', async () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    await act(async () => { result.current.setData(makeTree()); });

    // The apex ancestor wins the default root; everyone the canvas draws under
    // the jump must be in the visible set the search list and stats read.
    expect(result.current.selectedRootId).toBe('@IBRAHIM@');
    expect(result.current.visiblePersonIds.has('@ADNAN@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@MAAD@')).toBe(true);
    expect(result.current.panelScopeIds.has('@ADNAN@')).toBe(true);
  });
});

describe('canvas — private people', () => {
  it('draws no jump edge to a private descendant', () => {
    const data = makeTree();
    data.individuals['@ADNAN@'].isPrivate = true;

    const { nodes, edges } = build(data, '@ISHMAEL@');
    expect(jumpEdges(edges)).toHaveLength(0);
    expect(nodeById(nodes, '@ADNAN@')).toBeUndefined();
  });
});
