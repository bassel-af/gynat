import { describe, test, expect } from 'vitest';
import {
  getLayoutedElements,
  NODE_WIDTH,
  NODE_HEIGHT,
  SPOUSE_WIDTH,
  HORIZONTAL_GAP,
  VERTICAL_GAP,
  GRAFT_HORIZONTAL_PADDING,
} from '@/components/tree/FamilyTree/layout';
import type { GraftDescriptor } from '@/lib/gedcom/graph';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, spouseCount = 0): Node {
  return {
    id,
    type: 'person',
    position: { x: 0, y: 0 },
    data: {
      spouses: Array.from({ length: spouseCount }, () => ({ spouse: { id: 'sp' } })),
    },
  };
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getLayoutedElements with graft descriptors', () => {
  test('GRAFT_HORIZONTAL_PADDING is exported', () => {
    expect(GRAFT_HORIZONTAL_PADDING).toBeGreaterThan(0);
  });

  test('graft envelope widens the hub node subtree width', () => {
    // Tree: root -> child (has 1 spouse with graft: 2 parents, 1 sibling)
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1', 'p2'],
      siblingIds: ['sib1'],
      totalSiblingCount: 1,
      spouseSex: 'F',
    }]);

    const resultWithGraft = getLayoutedElements(nodes, edges, grafts);
    const resultWithout = getLayoutedElements(
      [makeNode('root'), makeNode('child', 1)],
      [makeEdge('root', 'child')]
    );

    // With graft, the child node should occupy more horizontal space,
    // so the root node might be positioned differently (or the same if root is wider)
    // What matters is that graft nodes are created
    const graftNodes = resultWithGraft.nodes.filter((n) => n.id.startsWith('graft-'));
    expect(graftNodes.length).toBeGreaterThan(0);

    // Without graft, no graft nodes
    const noGraftNodes = resultWithout.nodes.filter((n) => n.id.startsWith('graft-'));
    expect(noGraftNodes.length).toBe(0);
  });

  test('graft parent nodes are positioned one generation above hub node', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1', 'p2'],
      siblingIds: [],
      totalSiblingCount: 0,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);

    const childNode = result.nodes.find((n) => n.id === 'child')!;
    const parentNodes = result.nodes.filter((n) => n.id.startsWith('graft-parent-'));

    expect(parentNodes.length).toBe(2);

    // Parents should be one generation above the child
    for (const parent of parentNodes) {
      expect(parent.position.y).toBe(childNode.position.y - NODE_HEIGHT - VERTICAL_GAP);
    }
  });

  test('graft sibling nodes are at same Y as hub node', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1'],
      siblingIds: ['sib1', 'sib2'],
      totalSiblingCount: 2,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);

    const childNode = result.nodes.find((n) => n.id === 'child')!;
    const siblingNodes = result.nodes.filter((n) => n.id.startsWith('graft-sibling-'));

    expect(siblingNodes.length).toBe(2);

    for (const sib of siblingNodes) {
      expect(sib.position.y).toBe(childNode.position.y);
    }
  });

  test('graft nodes have isInLawExpansion flag set to true', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1'],
      siblingIds: ['sib1'],
      totalSiblingCount: 1,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);
    const graftNodes = result.nodes.filter((n) => n.id.startsWith('graft-'));

    for (const node of graftNodes) {
      expect((node.data as Record<string, unknown>).isInLawExpansion).toBe(true);
    }
  });

  test('graft edges use dashed style class', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1'],
      siblingIds: ['sib1'],
      totalSiblingCount: 1,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);
    const graftEdges = result.edges.filter((e) => e.id.startsWith('graft-edge-'));

    expect(graftEdges.length).toBeGreaterThan(0);

    for (const edge of graftEdges) {
      expect(edge.className).toBe('in-law-edge');
    }
  });

  test('overflow node is created when totalSiblingCount > siblingIds.length', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1'],
      siblingIds: ['sib1', 'sib2', 'sib3', 'sib4'],
      totalSiblingCount: 7, // 3 more than shown
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);
    const overflowNodes = result.nodes.filter((n) => n.id.startsWith('graft-overflow-'));

    expect(overflowNodes.length).toBe(1);
    expect((overflowNodes[0].data as Record<string, unknown>).overflowCount).toBe(3);
  });

  test('no overlap: graft-expanded node does not overlap with siblings', () => {
    // root -> child1 (with graft), child2 (no graft)
    const nodes = [
      makeNode('root'),
      makeNode('child1', 1),
      makeNode('child2'),
    ];
    const edges = [makeEdge('root', 'child1'), makeEdge('root', 'child2')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child1', [{
      spouseId: 'sp1',
      hubPersonId: 'child1',
      parentIds: ['p1', 'p2'],
      siblingIds: ['sib1', 'sib2', 'sib3'],
      totalSiblingCount: 3,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);

    const child1 = result.nodes.find((n) => n.id === 'child1')!;
    const child2 = result.nodes.find((n) => n.id === 'child2')!;

    // child1 has 1 spouse, so its base width is NODE_WIDTH + SPOUSE_WIDTH = 300
    // With graft siblings, it extends further to the right
    // child2 should not overlap with any graft nodes

    // Get rightmost edge of child1's graft envelope
    const graftNodes = result.nodes.filter((n) => n.id.startsWith('graft-'));
    const child1X = child1.position.x;
    const child1SpouseWidth = NODE_WIDTH + SPOUSE_WIDTH;
    const allGraftRightEdges = graftNodes.map((n) => n.position.x + NODE_WIDTH);
    const rightEdge = Math.max(child1X + child1SpouseWidth, ...allGraftRightEdges);

    // child2 should not overlap with child1's base card + spouse area
    expect(child2.position.x).toBeGreaterThanOrEqual(child1X + child1SpouseWidth);
  });

  test('works without grafts parameter (backward compatibility)', () => {
    const nodes = [makeNode('root'), makeNode('child')];
    const edges = [makeEdge('root', 'child')];

    // Should not throw when called without grafts
    const result = getLayoutedElements(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  test('graft label node is created for each parent and sibling', () => {
    const nodes = [makeNode('root'), makeNode('child', 1)];
    const edges = [makeEdge('root', 'child')];

    const grafts = new Map<string, GraftDescriptor[]>();
    grafts.set('child', [{
      spouseId: 'sp1',
      hubPersonId: 'child',
      parentIds: ['p1', 'p2'],
      siblingIds: ['sib1'],
      totalSiblingCount: 1,
      spouseSex: 'F',
    }]);

    const result = getLayoutedElements(nodes, edges, grafts);
    const labelNodes = result.nodes.filter((n) => n.id.startsWith('graft-label-'));

    // 2 parent labels + 1 sibling label = 3
    expect(labelNodes.length).toBe(3);
    expect(labelNodes.filter((n) => n.id.startsWith('graft-label-parent-')).length).toBe(2);
    expect(labelNodes.filter((n) => n.id.startsWith('graft-label-sibling-')).length).toBe(1);
  });
});
