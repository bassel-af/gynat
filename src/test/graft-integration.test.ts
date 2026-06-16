import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { computeGraftDescriptors } from '@/lib/gedcom/graph';
import { getLayoutedElements } from '@/components/tree/FamilyTree/layout';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

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

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
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

// Build a tree where Son has a married-in wife with parents and a sibling
function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({
      id: '@ROOT@',
      name: 'Root',
      familiesAsSpouse: ['@F1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@F1@',
    }),
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@FWIFE@',
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild',
      familyAsChild: '@F2@',
    }),
    '@WIFE_DAD@': makeIndividual({
      id: '@WIFE_DAD@',
      name: 'WifeDad',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_SIS@': makeIndividual({
      id: '@WIFE_SIS@',
      name: 'WifeSis',
      sex: 'F',
      familyAsChild: '@FWIFE@',
    }),
  };

  const families: Record<string, Family> = {
    '@F1@': makeFamily({
      id: '@F1@',
      husband: '@ROOT@',
      children: ['@SON@'],
    }),
    '@F2@': makeFamily({
      id: '@F2@',
      husband: '@SON@',
      wife: '@WIFE@',
      children: ['@GRANDCHILD@'],
    }),
    '@FWIFE@': makeFamily({
      id: '@FWIFE@',
      husband: '@WIFE_DAD@',
      children: ['@WIFE@', '@WIFE_SIS@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests: End-to-end graft pipeline
// ---------------------------------------------------------------------------

describe('graft integration: computeGraftDescriptors -> getLayoutedElements', () => {
  test('pipeline produces graft nodes when connected through', () => {
    const data = buildFixture();
    const grafts = computeGraftDescriptors(data, '@ROOT@');

    // Build tree nodes like buildTreeData would
    // Simulating the essential structure: root -> son (with wife spouse)
    const nodes: Node[] = [
      {
        id: '@ROOT@',
        type: 'person',
        position: { x: 0, y: 0 },
        data: { spouses: [] },
      },
      {
        id: '@SON@',
        type: 'person',
        position: { x: 0, y: 0 },
        data: { spouses: [{ spouse: data.individuals['@WIFE@'] }] },
      },
      {
        id: '@GRANDCHILD@',
        type: 'person',
        position: { x: 0, y: 0 },
        data: { spouses: [] },
      },
    ];

    const edges: Edge[] = [
      { id: '@ROOT@-@SON@', source: '@ROOT@', target: '@SON@', type: 'smoothstep' },
      { id: '@SON@-@GRANDCHILD@', source: '@SON@', target: '@GRANDCHILD@', type: 'smoothstep' },
    ];

    const result = getLayoutedElements(nodes, edges, grafts);

    // Should have graft parent node for WIFE_DAD
    const parentNodes = result.nodes.filter((n) => n.id.startsWith('graft-parent-'));
    expect(parentNodes.length).toBeGreaterThan(0);
    expect(parentNodes.some((n) => n.id === 'graft-parent-@WIFE_DAD@')).toBe(true);

    // Should have graft sibling node for WIFE_SIS
    const siblingNodes = result.nodes.filter((n) => n.id.startsWith('graft-sibling-'));
    expect(siblingNodes.some((n) => n.id === 'graft-sibling-@WIFE_SIS@')).toBe(true);

    // Should have graft edges
    const graftEdges = result.edges.filter((e) => e.className === 'in-law-edge');
    expect(graftEdges.length).toBeGreaterThan(0);

    // Should have a label node
    const labelNodes = result.nodes.filter((n) => n.id.startsWith('graft-label-'));
    expect(labelNodes.length).toBeGreaterThanOrEqual(1);
  });

  test('no graft nodes in single mode (grafts not passed)', () => {
    const data = buildFixture();

    const nodes: Node[] = [
      {
        id: '@ROOT@',
        type: 'person',
        position: { x: 0, y: 0 },
        data: { spouses: [] },
      },
      {
        id: '@SON@',
        type: 'person',
        position: { x: 0, y: 0 },
        data: { spouses: [{ spouse: data.individuals['@WIFE@'] }] },
      },
    ];

    const edges: Edge[] = [
      { id: '@ROOT@-@SON@', source: '@ROOT@', target: '@SON@', type: 'smoothstep' },
    ];

    // Single mode: no grafts passed
    const result = getLayoutedElements(nodes, edges);

    const graftNodes = result.nodes.filter((n) => n.id.startsWith('graft-'));
    expect(graftNodes.length).toBe(0);
  });
});
