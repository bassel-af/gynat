import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TreeProvider } from '@/context/TreeContext';
import { PersonCard } from '@/components/tree/PersonCard/PersonCard';
import { PersonNode } from '@/components/tree/FamilyTree/FamilyTree';
import type { PersonNodeData } from '@/components/tree/FamilyTree/buildTreeData';
import type { Individual } from '@/lib/gedcom/types';

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

function makeNodeData(person: Individual): PersonNodeData {
  return {
    person,
    spouses: [],
    isRoot: false,
    searchQuery: '',
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

/**
 * The tree canvas renders `PersonNode` (FamilyTree.tsx), NOT the standalone
 * `PersonCard`. These cover the shipping path first, then the shared component.
 */
describe('tree canvas card — kunya', () => {
  test('renders the kunya under the name when the person has one', () => {
    const person = makeIndividual({
      id: 'I1',
      givenName: 'محمد',
      name: 'محمد',
      surname: 'السعيد',
      kunya: 'أبو أحمد',
    });

    const { container } = wrap(<PersonNode data={makeNodeData(person)} />);

    const kunya = container.querySelector('.person-kunya');
    expect(kunya).not.toBeNull();
    expect(kunya?.textContent).toBe('أبو أحمد');

    // It must sit between the name and the dates, not anywhere else.
    const name = container.querySelector('.person-name');
    expect(name?.nextElementSibling).toBe(kunya);
  });

  test('renders no kunya element when the kunya is an empty string', () => {
    const person = makeIndividual({
      id: 'I2',
      givenName: 'عبد الرحمن',
      name: 'عبد الرحمن',
      kunya: '',
    });

    const { container } = wrap(<PersonNode data={makeNodeData(person)} />);

    expect(container.querySelector('.person-name')).not.toBeNull();
    expect(container.querySelector('.person-kunya')).toBeNull();
  });

  test('renders the kunya on a deceased person card too', () => {
    const person = makeIndividual({
      id: 'I3',
      givenName: 'سعيد',
      name: 'سعيد',
      kunya: 'أبو محمّد',
      isDeceased: true,
      birth: '1870',
      death: '1945',
    });

    const { container } = wrap(<PersonNode data={makeNodeData(person)} />);

    expect(container.querySelector('.person.deceased')).not.toBeNull();
    expect(container.querySelector('.person-kunya')?.textContent).toBe('أبو محمّد');
  });
});

describe('shared PersonCard — kunya', () => {
  test('renders the kunya when the person has one', () => {
    const person = makeIndividual({
      id: 'I4',
      givenName: 'محمد',
      name: 'محمد',
      kunya: 'أبو أحمد',
    });

    wrap(<PersonCard person={person} />);

    expect(screen.getByText('أبو أحمد')).toBeInTheDocument();
  });

  test('renders no kunya line when the kunya is an empty string', () => {
    const person = makeIndividual({
      id: 'I5',
      givenName: 'محمد',
      name: 'محمد',
      kunya: '',
    });

    const { container } = wrap(<PersonCard person={person} />);

    expect(screen.getByText('محمد')).toBeInTheDocument();
    const card = container.firstElementChild as HTMLElement;
    expect(card.children).toHaveLength(1);
  });
});
