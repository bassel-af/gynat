import { describe, test, expect } from 'vitest';
import {
  getLayoutedElements,
  NODE_WIDTH,
  HORIZONTAL_GAP,
} from '@/components/tree/FamilyTree/layout';
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
      spouses: Array.from({ length: spouseCount }, (_, i) => ({ spouse: { id: `${id}-sp${i}` } })),
    },
  };
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target, type: 'smoothstep' };
}

function pos(nodes: Node[], id: string) {
  return nodes.find((n) => n.id === id)!.position;
}

/** person-card center X of a node (cards are NODE_WIDTH wide, left-anchored). */
function cardCenter(nodes: Node[], id: string) {
  return pos(nodes, id).x + NODE_WIDTH / 2;
}

// ---------------------------------------------------------------------------
// Contour-based tightening: a shallow sibling tucks beside a wide-subtree
// sibling instead of being banished to the far edge of its bounding box.
// ---------------------------------------------------------------------------

describe('tree layout — contour packing tightens unequal siblings', () => {
  test('a leaf sibling sits one card+gap from a wide sibling, regardless of how wide that sibling is', () => {
    // root -> { L (leaf), W (3 leaf children) }
    const nodes = [
      makeNode('root'),
      makeNode('L'),
      makeNode('W'),
      makeNode('W1'), makeNode('W2'), makeNode('W3'),
    ];
    const edges = [
      makeEdge('root', 'L'), makeEdge('root', 'W'),
      makeEdge('W', 'W1'), makeEdge('W', 'W2'), makeEdge('W', 'W3'),
    ];

    const { nodes: out } = getLayoutedElements(nodes, edges);

    // L and W are on the same row (same generation).
    expect(pos(out, 'L').y).toBe(pos(out, 'W').y);

    // The two sibling cards are exactly one card-width + gap apart — L tucks
    // right against W's node, NOT half of W's subtree away.
    const gap = Math.abs(cardCenter(out, 'L') - cardCenter(out, 'W'));
    expect(gap).toBeCloseTo(NODE_WIDTH + HORIZONTAL_GAP, 5);
  });

  test('the leaf↔wide-sibling distance does NOT grow as the wide sibling gets wider', () => {
    function distanceForChildCount(n: number) {
      const nodes: Node[] = [makeNode('root'), makeNode('L'), makeNode('W')];
      const edges: Edge[] = [makeEdge('root', 'L'), makeEdge('root', 'W')];
      for (let i = 0; i < n; i++) {
        nodes.push(makeNode(`W${i}`));
        edges.push(makeEdge('W', `W${i}`));
      }
      const { nodes: out } = getLayoutedElements(nodes, edges);
      return Math.abs(cardCenter(out, 'L') - cardCenter(out, 'W'));
    }

    const d3 = distanceForChildCount(3);
    const d7 = distanceForChildCount(7);
    // Wider subtree must NOT push the leaf farther away — constant tuck distance.
    expect(d7).toBeCloseTo(d3, 5);
    expect(d3).toBeCloseTo(NODE_WIDTH + HORIZONTAL_GAP, 5);
  });

  test('siblings never overlap at any shared row (contour separation ≥ gap)', () => {
    // A lopsided tree: one deep+wide branch next to several leaves.
    const nodes = [
      makeNode('root'),
      makeNode('A'), makeNode('B'), makeNode('C'),
      makeNode('B1'), makeNode('B2'),
      makeNode('B1a'), makeNode('B1b'), makeNode('B1c'),
    ];
    const edges = [
      makeEdge('root', 'A'), makeEdge('root', 'B'), makeEdge('root', 'C'),
      makeEdge('B', 'B1'), makeEdge('B', 'B2'),
      makeEdge('B1', 'B1a'), makeEdge('B1', 'B1b'), makeEdge('B1', 'B1c'),
    ];

    const { nodes: out } = getLayoutedElements(nodes, edges);

    // Group nodes by row (y) and assert no horizontal overlap within a row.
    const byRow = new Map<number, Node[]>();
    for (const n of out) {
      const row = byRow.get(n.position.y) ?? [];
      row.push(n);
      byRow.set(n.position.y, row);
    }
    for (const row of byRow.values()) {
      const spans = row
        .map((n) => ({ left: n.position.x, right: n.position.x + NODE_WIDTH }))
        .sort((a, b) => a.left - b.left);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].left).toBeGreaterThanOrEqual(spans[i - 1].right);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Invariants preserved: parent centering.
// ---------------------------------------------------------------------------

describe('tree layout — parent centering invariants', () => {
  test('a single child sits directly under its parent', () => {
    const nodes = [makeNode('p'), makeNode('c')];
    const edges = [makeEdge('p', 'c')];
    const { nodes: out } = getLayoutedElements(nodes, edges);
    expect(cardCenter(out, 'p')).toBeCloseTo(cardCenter(out, 'c'), 5);
  });

  test('a parent is centered between its two leaf children', () => {
    const nodes = [makeNode('p'), makeNode('a'), makeNode('b')];
    const edges = [makeEdge('p', 'a'), makeEdge('p', 'b')];
    const { nodes: out } = getLayoutedElements(nodes, edges);
    const mid = (cardCenter(out, 'a') + cardCenter(out, 'b')) / 2;
    expect(cardCenter(out, 'p')).toBeCloseTo(mid, 5);
  });
});
