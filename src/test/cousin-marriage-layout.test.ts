import { describe, test, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';

import { buildTreeData, computeOccurrenceLinkEdge, type HighlightState, type PersonNodeData, type SpouseWithColor, type ChildrenElsewhere } from '@/components/tree/FamilyTree/buildTreeData';
import { buildCousinMarriageFixture, buildEarlyMarriageFixture } from './fixtures/cousin-marriage';

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

describe('computeOccurrenceLinkEdge', () => {
  test('returns null when no person is hovered', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdge(nodes, null)).toBeNull();
  });

  test('returns null when hovered person has no spouse-card occurrence (non-cousin)', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdge(nodes, 'X')).toBeNull();
    expect(computeOccurrenceLinkEdge(nodes, 'C1')).toBeNull();
  });

  test('returns null when hovered person id is not in the tree', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);
    expect(computeOccurrenceLinkEdge(nodes, 'NOT_A_PERSON')).toBeNull();
  });

  test('builds a link edge from the cousin main node to the spouse-card on the other cousin', () => {
    const data = buildCousinMarriageFixture();
    const { nodes } = buildTreeData(data, 'G', 50, '', noHighlight, null, noopCallbacks);

    const linkA = computeOccurrenceLinkEdge(nodes, 'A');
    expect(linkA).not.toBeNull();
    expect(linkA!.source).toBe('A');
    expect(linkA!.target).toBe('B');
    expect(linkA!.sourceHandle).toBe('default');
    expect(linkA!.targetHandle).toBe('spouse-target-0');
    expect(linkA!.className).toBe('occurrence-link');
    expect(linkA!.type).toBe('straight');

    const linkB = computeOccurrenceLinkEdge(nodes, 'B');
    expect(linkB).not.toBeNull();
    expect(linkB!.source).toBe('B');
    expect(linkB!.target).toBe('A');
  });
});
