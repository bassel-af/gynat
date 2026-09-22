/**
 * Shared-spouse cluster surrogate — re-root badge on the MAIN node.
 *
 * When two siblings marry the same outsider W, `detectSisterWifeClusters`
 * promotes W to her own main node under the siblings' parent. W is still a
 * married-in person: if she has external family, her main card must carry the
 * same «عرض عائلة …» re-root affordance she would get as a spouse card
 * (docs/in-law-visibility.md, Solution 1). Real case: أسماء بنت عميس married
 * to the brothers جعفر and علي.
 *
 *   R ── P ──┬── A ══ W ══ B ──┐
 *            └── B ────────────┘   (A, B brothers; W married to both)
 *   F (no parents, no wife) ── W   (W's father, outside the root tree)
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TreeProvider } from '@/context/TreeContext';
import { PersonNode } from '@/components/tree/FamilyTree/FamilyTree';
import {
  buildTreeData,
  type HighlightState,
  type PersonNodeData,
} from '@/components/tree/FamilyTree/buildTreeData';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function ind(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
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
    ...overrides,
  };
}

function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    ...overrides,
  };
}

function buildFixture({ withFather = true }: { withFather?: boolean } = {}): GedcomData {
  const individuals: Record<string, Individual> = {
    R: ind({ id: 'R', givenName: 'الجد', name: 'الجد', familiesAsSpouse: ['F_R'] }),
    P: ind({ id: 'P', givenName: 'الأب', name: 'الأب', familyAsChild: 'F_R', familiesAsSpouse: ['F_P'] }),
    A: ind({ id: 'A', givenName: 'جعفر', name: 'جعفر', birth: '1900', familyAsChild: 'F_P', familiesAsSpouse: ['F_AW'] }),
    B: ind({ id: 'B', givenName: 'علي', name: 'علي', birth: '1905', familyAsChild: 'F_P', familiesAsSpouse: ['F_BW'] }),
    W: ind({
      id: 'W',
      givenName: 'أسماء',
      name: 'أسماء',
      sex: 'F',
      familyAsChild: withFather ? 'F_FW' : null,
      familiesAsSpouse: ['F_AW', 'F_BW'],
    }),
  };
  const families: Record<string, Family> = {
    F_R: fam({ id: 'F_R', husband: 'R', children: ['P'] }),
    F_P: fam({ id: 'F_P', husband: 'P', children: ['A', 'B'] }),
    F_AW: fam({ id: 'F_AW', husband: 'A', wife: 'W' }),
    F_BW: fam({ id: 'F_BW', husband: 'B', wife: 'W' }),
  };
  if (withFather) {
    individuals.F = ind({ id: 'F', givenName: 'عميس', name: 'عميس', familiesAsSpouse: ['F_FW'] });
    families.F_FW = fam({ id: 'F_FW', husband: 'F', children: ['W'] });
  }
  return { individuals, families };
}

const noHighlight: HighlightState = { ancestors: new Set(), descendants: new Set(), highlightedId: null };

function build(data: GedcomData, useGrafts = false, onRerootToAncestor = vi.fn()) {
  return buildTreeData(
    data,
    'R',
    50,
    '',
    noHighlight,
    null,
    { onPersonClick: vi.fn(), onOpenSidebar: vi.fn(), onRerootToAncestor },
    useGrafts,
  );
}

function nodeData(data: GedcomData, id: string, useGrafts = false, onReroot = vi.fn()): PersonNodeData {
  const { nodes } = build(data, useGrafts, onReroot);
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no main node for ${id}`);
  return node.data as PersonNodeData;
}

function renderNode(data: PersonNodeData) {
  const wrap = (ui: ReactNode) =>
    render(
      <TreeProvider>
        <ReactFlowProvider>{ui}</ReactFlowProvider>
      </TreeProvider>,
    );
  return wrap(<PersonNode data={data} />);
}

describe('shared-spouse surrogate main node — re-root to her own family', () => {
  test('surrogate node data exposes her topmost ancestor', () => {
    const d = nodeData(buildFixture(), 'W');
    expect(d.topAncestorId).toBe('F');
  });

  test('surrogate main card renders a «عرض عائلة» badge that re-roots to her father', () => {
    const onReroot = vi.fn();
    renderNode(nodeData(buildFixture(), 'W', false, onReroot));
    fireEvent.click(screen.getByRole('button', { name: 'عرض عائلة أسماء' }));
    expect(onReroot).toHaveBeenCalledWith('F', 'W');
  });

  test('surrogate with no external family gets no badge', () => {
    const d = nodeData(buildFixture({ withFather: false }), 'W');
    expect(d.topAncestorId ?? null).toBeNull();
    renderNode(d);
    expect(screen.queryByRole('button', { name: 'عرض عائلة أسماء' })).toBeNull();
  });

  test('ordinary root-descendant main node gets no main-card badge', () => {
    const d = nodeData(buildFixture(), 'P');
    expect(d.topAncestorId ?? null).toBeNull();
    renderNode(d);
    expect(screen.queryByRole('button', { name: 'عرض عائلة الأب' })).toBeNull();
  });

  test('with grafts on, the surrogate main card shows no badge', () => {
    renderNode(nodeData(buildFixture(), 'W', true));
    expect(screen.queryByRole('button', { name: 'عرض عائلة أسماء' })).toBeNull();
  });
});
