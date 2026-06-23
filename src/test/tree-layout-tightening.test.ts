import { describe, test, expect } from 'vitest';
import {
  getLayoutedElements,
  computeFocusX,
  NODE_WIDTH,
  HORIZONTAL_GAP,
  SPOUSE_WIDTH,
  SPOUSE_GAP,
} from '@/components/tree/FamilyTree/layout';
import type { Node, Edge } from '@xyflow/react';

/** Edge from a parent's specific spouse-handle (which wife a child hangs from). */
function makeWifeEdge(source: string, target: string, spouseIdx: number): Edge {
  return { id: `${source}-${target}`, source, target, type: 'smoothstep', sourceHandle: `spouse-${spouseIdx}` };
}

/** Per-wife card offsets the layout attaches to a multi-wife node. */
function spouseOffsets(nodes: Node[], id: string): number[] | undefined {
  return (nodes.find((n) => n.id === id)!.data as { spouseOffsets?: number[] }).spouseOffsets;
}

/** Absolute centre X of wife #idx's card on a (possibly spread) multi-wife node. */
function wifeCardCenter(nodes: Node[], husbandId: string, idx: number): number {
  return pos(nodes, husbandId).x + (spouseOffsets(nodes, husbandId)![idx]) + NODE_WIDTH / 2;
}

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

// ---------------------------------------------------------------------------
// Polygamy: each wife (mother) sits centred over her OWN children, the husband
// sits beside his first wife, and childless wives tuck in tight. These guard
// the behaviours we previously only verified by eye.
// ---------------------------------------------------------------------------

describe('tree layout — multi-wife (each mother over her children)', () => {
  // Husband H with two wives. Wife-0 has children a0,b0; wife-1 has child a1.
  function buildTwoWifeTree() {
    const nodes = [
      makeNode('H', 2),
      makeNode('a0'), makeNode('b0'), // wife-0's children
      makeNode('a1'),                 // wife-1's child
    ];
    const edges = [
      makeWifeEdge('H', 'a0', 0), makeWifeEdge('H', 'b0', 0),
      makeWifeEdge('H', 'a1', 1),
    ];
    return getLayoutedElements(nodes, edges).nodes;
  }

  test('the layout attaches per-wife card offsets', () => {
    const out = buildTwoWifeTree();
    expect(spouseOffsets(out, 'H')).toHaveLength(2);
  });

  test('each wife card is centred over the centre of HER children', () => {
    const out = buildTwoWifeTree();
    const wife0Kids = (cardCenter(out, 'a0') + cardCenter(out, 'b0')) / 2;
    expect(wifeCardCenter(out, 'H', 0)).toBeCloseTo(wife0Kids, 5);
    expect(wifeCardCenter(out, 'H', 1)).toBeCloseTo(cardCenter(out, 'a1'), 5);
  });

  test('the husband sits one card+gap to the left of his FIRST wife', () => {
    const out = buildTwoWifeTree();
    expect(cardCenter(out, 'H')).toBeCloseTo(
      wifeCardCenter(out, 'H', 0) - (NODE_WIDTH + SPOUSE_GAP), 5,
    );
  });

  test('wife cards never overlap (each at least a card-width apart)', () => {
    const out = buildTwoWifeTree();
    const offs = spouseOffsets(out, 'H')!;
    expect(offs[1] - offs[0]).toBeGreaterThanOrEqual(NODE_WIDTH);
  });

  test('a childless wife tucks in tight right after the wife who has children', () => {
    // Wife-0 has two children; wife-1 has none.
    const nodes = [makeNode('H', 2), makeNode('a0'), makeNode('b0')];
    const edges = [makeWifeEdge('H', 'a0', 0), makeWifeEdge('H', 'b0', 0)];
    const out = getLayoutedElements(nodes, edges).nodes;
    const offs = spouseOffsets(out, 'H')!;
    expect(offs).toHaveLength(2);
    // childless wife-1 packs exactly one card+gap after wife-0 (no huge gap, no overlap)
    expect(offs[1] - offs[0]).toBeCloseTo(NODE_WIDTH + SPOUSE_GAP, 5);
  });

  test('a wide first-wife branch does not strand the husband far from her', () => {
    // Wife-0's child has its own 3 kids (a wide sub-branch); husband must still
    // sit right beside wife-0, not at the far-left edge of that branch.
    const nodes = [
      makeNode('H', 2),
      makeNode('a0'), makeNode('g1'), makeNode('g2'), makeNode('g3'),
      makeNode('a1'),
    ];
    const edges = [
      makeWifeEdge('H', 'a0', 0), makeWifeEdge('H', 'a1', 1),
      makeEdge('a0', 'g1'), makeEdge('a0', 'g2'), makeEdge('a0', 'g3'),
    ];
    const out = getLayoutedElements(nodes, edges).nodes;
    expect(cardCenter(out, 'H')).toBeCloseTo(
      wifeCardCenter(out, 'H', 0) - (NODE_WIDTH + SPOUSE_GAP), 5,
    );
  });

  test('SPOUSE_WIDTH matches a rendered card + gap (card-to-sibling spacing stays correct)', () => {
    // The "too close" bug: the layout reserved less per wife than the DOM renders.
    expect(SPOUSE_WIDTH).toBe(NODE_WIDTH + SPOUSE_GAP);
  });
});

// ---------------------------------------------------------------------------
// Click-to-centre: focusing a person centres the viewport on THAT person's
// card. With wives spread over their children, a far-out wife (e.g. مروة) must
// centre on her own card, not on the husband node far to the left.
// ---------------------------------------------------------------------------

describe('tree layout — computeFocusX (centre on the clicked person)', () => {
  const husband = {
    spouses: [{ spouse: { id: 'w0' } }, { spouse: { id: 'w1' } }],
    spouseOffsets: [194, 18175], // w1 spread far to the right, like مروة
  };

  test('a spread-out wife focuses on HER card, not the husband / node centre', () => {
    expect(computeFocusX(husband, 'H', 'w1')).toBe(18175 + NODE_WIDTH / 2);
    expect(computeFocusX(husband, 'H', 'w1')).not.toBe(NODE_WIDTH / 2);
    expect(computeFocusX(husband, 'H', 'w1')).not.toBe((NODE_WIDTH + 2 * SPOUSE_WIDTH) / 2);
  });

  test('the first wife focuses on her card', () => {
    expect(computeFocusX(husband, 'H', 'w0')).toBe(194 + NODE_WIDTH / 2);
  });

  test('the main person focuses on his own card', () => {
    expect(computeFocusX(husband, 'H', 'H')).toBe(NODE_WIDTH / 2);
  });

  test('falls back to the tight spouse position when offsets are absent', () => {
    const tight = { spouses: [{ spouse: { id: 'w0' } }, { spouse: { id: 'w1' } }] };
    expect(computeFocusX(tight, 'H', 'w1')).toBe(NODE_WIDTH + SPOUSE_GAP + SPOUSE_WIDTH + NODE_WIDTH / 2);
  });

  test('with no target person, returns the whole-node centre (unchanged for root scrolls)', () => {
    expect(computeFocusX(husband, 'H', undefined)).toBe((NODE_WIDTH + 2 * SPOUSE_WIDTH) / 2);
  });
});
