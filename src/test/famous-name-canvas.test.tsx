import { describe, test, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { PersonCard } from '@/components/tree/PersonCard/PersonCard';
import { PersonNode } from '@/components/tree/FamilyTree/FamilyTree';
import {
  buildTreeData,
  type HighlightState,
  type PersonNodeData,
} from '@/components/tree/FamilyTree/buildTreeData';
import type { Individual } from '@/lib/gedcom/types';
import { buildCousinMarriageFixture } from './fixtures/cousin-marriage';

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

function makeNodeData(person: Individual, searchQuery = ''): PersonNodeData {
  return {
    person,
    spouses: [],
    isRoot: false,
    searchQuery,
    isHighlightedPerson: false,
    isAncestor: false,
    isDescendant: false,
    hasHighlight: false,
    selectedPersonId: null,
    onPersonClick: vi.fn(),
    onOpenSidebar: vi.fn(),
    onRerootToAncestor: vi.fn(),
  };
}

function wrap(ui: ReactNode) {
  return render(
    <TreeProvider>
      <ReactFlowProvider>{ui}</ReactFlowProvider>
    </TreeProvider>,
  );
}

// عبدالمطلب: known by his famous name; his real name is شيبة.
const abdulMuttalib = makeIndividual({
  id: 'AM',
  name: 'شيبة',
  givenName: 'شيبة',
  famousName: 'عبدالمطلب',
});

// أبو طالب: famous name == kunya, real name عبدمناف.
const abuTalib = makeIndividual({
  id: 'AT',
  name: 'عبدمناف',
  givenName: 'عبدمناف',
  famousName: 'أبو طالب',
  kunya: 'أبو طالب',
});

describe('tree canvas card (PersonNode) — famous name', () => {
  test('the famous name leads the card', () => {
    const { container } = wrap(<PersonNode data={makeNodeData(abdulMuttalib)} />);
    expect(container.querySelector('.person-name')?.textContent).toBe('عبدالمطلب');
  });

  test('the grey line under the lead name reads «واسمه شيبة»', () => {
    const { container } = wrap(<PersonNode data={makeNodeData(abdulMuttalib)} />);
    expect(container.querySelector('.person-alt-name')?.textContent).toBe('واسمه شيبة');
  });

  test('no gold kunya line when the kunya is the famous name (أبو طالب)', () => {
    const { container } = wrap(<PersonNode data={makeNodeData(abuTalib)} />);
    expect(container.querySelector('.person-kunya')).toBeNull();
  });

  test('a person without a famous name has no grey line', () => {
    const person = makeIndividual({ id: 'P', name: 'محمد', givenName: 'محمد', kunya: 'أبو أحمد' });
    const { container } = wrap(<PersonNode data={makeNodeData(person)} />);
    expect(container.querySelector('.person-alt-name')).toBeNull();
  });

  test('searching the real name matches a card led by the famous name', () => {
    const { container } = wrap(<PersonNode data={makeNodeData(abdulMuttalib, 'شيبة')} />);
    expect(container.querySelector('.person.search-match')).not.toBeNull();
  });

  test('searching the famous name matches a card led by the real name', () => {
    // «ابن الزبير» is a patronymic, so the real name خبيب leads by default.
    const khubaib = makeIndividual({ id: 'KH', name: 'خبيب', givenName: 'خبيب', famousName: 'ابن الزبير' });
    const { container } = wrap(<PersonNode data={makeNodeData(khubaib, 'الزبير')} />);
    expect(container.querySelector('.person.search-match')).not.toBeNull();
  });
});

describe('shared PersonCard — famous name', () => {
  test('shows «واسمه شيبة» for عبدالمطلب', () => {
    const { getByText } = wrap(<PersonCard person={abdulMuttalib} />);
    expect(getByText('واسمه شيبة')).toBeInTheDocument();
  });

  test('shows no gold kunya line for أبو طالب', () => {
    const { container } = wrap(<PersonCard person={abuTalib} />);
    const card = container.firstElementChild as HTMLElement;
    // lead «أبو طالب» + grey «واسمه عبدمناف» — the kunya would be a third line.
    expect(Array.from(card.children).map((c) => c.textContent)).toEqual(['أبو طالب', 'واسمه عبدمناف']);
  });

  test('searching the real name still matches a card led by the famous name', () => {
    function SetQuery({ query }: { query: string }) {
      const { setSearchQuery } = useTree();
      useEffect(() => setSearchQuery(query), [query, setSearchQuery]);
      return null;
    }
    const { container } = render(
      <TreeProvider>
        <SetQuery query="شيبة" />
        <PersonCard person={abdulMuttalib} />
      </TreeProvider>,
    );
    expect((container.firstElementChild as HTMLElement).className).toMatch(/searchMatch/);
  });

  test('a person without a famous name renders exactly as before (name only)', () => {
    const person = makeIndividual({ id: 'P', name: 'محمد', givenName: 'محمد' });
    const { container } = wrap(<PersonCard person={person} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.children).toHaveLength(1);
    expect(card.textContent).toBe('محمد');
  });
});

describe('buildTreeData — spouse name on the «children elsewhere» marker', () => {
  test('uses the spouse\'s lead (famous) name', () => {
    const data = buildCousinMarriageFixture();
    data.individuals.A = { ...data.individuals.A, famousName: 'عبدالمطلب' };
    const noHighlight: HighlightState = { ancestors: new Set(), descendants: new Set(), highlightedId: null };
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, {
      onPersonClick: () => {},
      onOpenSidebar: () => {},
      onRerootToAncestor: () => {},
    });
    const b = nodes.find((n) => n.id === 'B')!.data as PersonNodeData;
    expect(b.childrenElsewhere?.[0].spouseName.startsWith('عبدالمطلب')).toBe(true);
  });
});
