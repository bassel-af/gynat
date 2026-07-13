import { describe, test, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';

import { buildTreeData, computeOccurrenceLinkEdges, type HighlightState, type PersonNodeData, type SpouseWithColor, type ChildrenElsewhere } from '@/components/tree/FamilyTree/buildTreeData';
import { buildCousinMarriageFixture, buildDoubleCousinMarriageFixture, buildEarlyMarriageFixture } from './fixtures/cousin-marriage';

const noHighlight: HighlightState = {
  ancestors: new Set(),
  descendants: new Set(),
  highlightedId: null,
};

const noopCallbacks = {
  onPersonClick: () => {},
  onOpenSidebar: () => {},
  onRerootToAncestor: () => {},
};

function getPersonNode(nodes: Node[], id: string): Node | undefined {
  return nodes.find((n) => n.id === id);
}

function nodeData(n: Node): PersonNodeData {
  return n.data as PersonNodeData;
}

function incomingEdges(edges: Edge[], target: string): Edge[] {
  return edges.filter((e) => e.target === target);
}

describe('buildTreeData — cousin marriage', () => {
  test('produces exactly one node per unique person id (no duplicates)', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const personIds = nodes.map((n) => n.id);
    const unique = new Set(personIds);
    expect(personIds.length).toBe(unique.size);
  });

  test('shared child C1 has exactly one incoming parent edge', () => {
    const data = buildCousinMarriageFixture();
    const { edges } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    expect(incomingEdges(edges, 'C1').length).toBe(1);
  });

  test('shared child C2 has exactly one incoming parent edge', () => {
    const data = buildCousinMarriageFixture();
    const { edges } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    expect(incomingEdges(edges, 'C2').length).toBe(1);
  });

  test('canonical parent is whichever cousin BFS dequeues first (A)', () => {
    const data = buildCousinMarriageFixture();
    const { edges } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    // A is enqueued before B (X is processed before Y due to F_G child order),
    // so A is the canonical parent for the shared children.
    const c1IncomingSource = incomingEdges(edges, 'C1')[0]?.source;
    const c2IncomingSource = incomingEdges(edges, 'C2')[0]?.source;
    expect(c1IncomingSource).toBe('A');
    expect(c2IncomingSource).toBe('A');
  });

  test('canonical parent A has no childrenElsewhere marker (children placed under A)', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const aNode = getPersonNode(nodes, 'A');
    expect(aNode).toBeDefined();
    expect(nodeData(aNode!).childrenElsewhere ?? []).toEqual([]);
  });

  test('non-canonical parent B carries a childrenElsewhere marker pointing to A', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const bNode = getPersonNode(nodes, 'B');
    expect(bNode).toBeDefined();
    const elsewhere = nodeData(bNode!).childrenElsewhere ?? [];
    expect(elsewhere.length).toBe(1);
    const entry: ChildrenElsewhere = elsewhere[0];
    expect(entry.spouseId).toBe('A');
    expect(entry.canonicalNodeId).toBe('A');
    expect(entry.count).toBe(2);
    expect(entry.spouseName.length).toBeGreaterThan(0);
  });

  test('both cousin main-cards carry linkedTo pointing at the other cousin\'s node', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const aNode = getPersonNode(nodes, 'A');
    const bNode = getPersonNode(nodes, 'B');
    expect(aNode).toBeDefined();
    expect(bNode).toBeDefined();

    expect(nodeData(aNode!).linkedTo).toBe('B');
    expect(nodeData(bNode!).linkedTo).toBe('A');
  });

  test('cousin spouse-cards carry linkedTo pointing at the same person\'s main-node', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const aNode = getPersonNode(nodes, 'A');
    const bNode = getPersonNode(nodes, 'B');

    const aSpouseB: SpouseWithColor | undefined = nodeData(aNode!).spouses.find((s) => s.spouse.id === 'B');
    const bSpouseA: SpouseWithColor | undefined = nodeData(bNode!).spouses.find((s) => s.spouse.id === 'A');

    expect(aSpouseB!.linkedTo).toBe('B');
    expect(bSpouseA!.linkedTo).toBe('A');
  });

  test('grandchild GC has exactly one incoming edge (no propagation to non-canonical parent)', () => {
    const data = buildCousinMarriageFixture();
    const { edges } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    expect(incomingEdges(edges, 'GC').length).toBe(1);
    expect(incomingEdges(edges, 'GC')[0].source).toBe('C1');
  });

  test('non-cousin nodes do NOT carry linkedTo', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    for (const id of ['G', 'X', 'Y', 'C1', 'C2', 'GC']) {
      const n = getPersonNode(nodes, id);
      if (!n) continue;
      expect(nodeData(n).linkedTo).toBeUndefined();
    }
  });
});

describe('buildTreeData — early marriage explosion (stress)', () => {
  test('descendants render exactly once when two root children marry each other', () => {
    const data = buildEarlyMarriageFixture();
    const { nodes, edges } = buildTreeData(data, 'R', 50, '', noHighlight, null, noopCallbacks);

    // Each descendant appears as a node exactly once
    for (const id of ['D1', 'D2', 'GD1', 'GD2', 'GGD']) {
      const occurrences = nodes.filter((n) => n.id === id);
      expect(occurrences.length).toBe(1);
    }

    // Each descendant has exactly one incoming parent edge
    for (const id of ['D1', 'D2', 'GD1', 'GD2', 'GGD']) {
      expect(incomingEdges(edges, id).length).toBe(1);
    }
  });

  test('non-canonical parent (P2) carries childrenElsewhere; canonical parent (P1) does not', () => {
    const data = buildEarlyMarriageFixture();
    const { nodes } = buildTreeData(data, 'R', 50, '', noHighlight, null, noopCallbacks);

    const p1 = getPersonNode(nodes, 'P1');
    const p2 = getPersonNode(nodes, 'P2');
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(nodeData(p1!).childrenElsewhere ?? []).toEqual([]);

    const elsewhere = nodeData(p2!).childrenElsewhere ?? [];
    expect(elsewhere.length).toBe(1);
    expect(elsewhere[0].spouseId).toBe('P1');
    expect(elsewhere[0].canonicalNodeId).toBe('P1');
    expect(elsewhere[0].count).toBe(2);
  });
});

describe('computeOccurrenceLinkEdges', () => {
  test('returns no edges when no occurrence is hovered', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdges(nodes, null)).toEqual([]);
  });

  test('returns no edges when hovered person has no spouse-card occurrence (non-cousin)', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdges(nodes, { personId: 'X', hostNodeId: 'X' })).toEqual([]);
    expect(computeOccurrenceLinkEdges(nodes, { personId: 'C1', hostNodeId: 'C1' })).toEqual([]);
  });

  test('returns no edges when hovered person id is not in the tree', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdges(nodes, { personId: 'NOT_A_PERSON', hostNodeId: 'NOT_A_PERSON' })).toEqual([]);
  });

  test('hovering the MAIN card links from it to the spouse-card on the other cousin', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const linksA = computeOccurrenceLinkEdges(nodes, { personId: 'A', hostNodeId: 'A' });
    expect(linksA.length).toBe(1);
    const linkA = linksA[0];
    expect(linkA.source).toBe('A');
    expect(linkA.target).toBe('B');
    expect(linkA.sourceHandle).toBe('default');
    expect(linkA.targetHandle).toBe('spouse-target-0');
    expect(linkA.className).toBe('occurrence-link');
    expect(linkA.type).toBe('straight');

    const linksB = computeOccurrenceLinkEdges(nodes, { personId: 'B', hostNodeId: 'B' });
    expect(linksB.length).toBe(1);
    expect(linksB[0].source).toBe('B');
    expect(linksB[0].target).toBe('A');
  });

  test('hovering the SPOUSE-CARD links from ITS host node back to the main card', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    // Hover B's spouse-card, which lives on A's node.
    const links = computeOccurrenceLinkEdges(nodes, { personId: 'B', hostNodeId: 'A' });
    expect(links.length).toBe(1);
    expect(links[0].source).toBe('A');
    expect(links[0].sourceHandle).toBe('occurrence-src-0');
    expect(links[0].target).toBe('B');
  });
});

describe('buildTreeData — double cousin marriage (two wives, different uncles)', () => {
  test('husband main node carries linkedToNodes listing BOTH wives\' nodes', () => {
    const data = buildDoubleCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const hNode = getPersonNode(nodes, 'H');
    expect(hNode).toBeDefined();
    expect(nodeData(hNode!).linkedToNodes).toEqual(['W1', 'W2']);
    expect(nodeData(hNode!).linkedTo).toBe('W1');
  });

  test('husband spouse-card on EACH wife node carries linkedTo to his main node', () => {
    const data = buildDoubleCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    for (const wifeId of ['W1', 'W2']) {
      const wifeNode = getPersonNode(nodes, wifeId);
      const hCard = nodeData(wifeNode!).spouses.find((s) => s.spouse.id === 'H');
      expect(hCard?.linkedTo).toBe('H');
    }
  });

  test('hovering the husband\'s MAIN card fans one edge FROM IT to each spouse-card occurrence', () => {
    const data = buildDoubleCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const links = computeOccurrenceLinkEdges(nodes, { personId: 'H', hostNodeId: 'H' });
    expect(links.length).toBe(2);
    const targets = links.map((e) => e.target).sort();
    expect(targets).toEqual(['W1', 'W2']);
    for (const link of links) {
      expect(link.source).toBe('H');
      expect(link.sourceHandle).toBe('default');
      expect(link.targetHandle).toBe('spouse-target-0');
      expect(link.className).toBe('occurrence-link');
    }
    // Edge ids must be unique so React Flow renders both lines
    expect(new Set(links.map((e) => e.id)).size).toBe(2);
  });

  test('hovering the husband\'s SPOUSE-CARD on one wife fans edges FROM THAT CARD to his main card AND the other wife\'s card', () => {
    const data = buildDoubleCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    // Hover H's spouse-card hosted on W2's node.
    const links = computeOccurrenceLinkEdges(nodes, { personId: 'H', hostNodeId: 'W2' });
    expect(links.length).toBe(2);
    // EVERY line originates from the hovered card's host node (W2)
    for (const link of links) {
      expect(link.source).toBe('W2');
      expect(link.sourceHandle).toBe('occurrence-src-0');
    }
    const targets = links.map((e) => e.target).sort();
    expect(targets).toEqual(['H', 'W1']);
    const toOtherWife = links.find((e) => e.target === 'W1')!;
    expect(toOtherWife.targetHandle).toBe('spouse-target-0');
    expect(new Set(links.map((e) => e.id)).size).toBe(2);
  });

  test('hovering a wife\'s spouse-card on H\'s node links from H\'s node back to her main card', () => {
    const data = buildDoubleCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    // W2 is spouse index 1 on H's node — the line must leave from HER card's handle.
    const links = computeOccurrenceLinkEdges(nodes, { personId: 'W2', hostNodeId: 'H' });
    expect(links.length).toBe(1);
    expect(links[0].source).toBe('H');
    expect(links[0].sourceHandle).toBe('occurrence-src-1');
    expect(links[0].target).toBe('W2');
  });
});
