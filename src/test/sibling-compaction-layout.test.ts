import { describe, test, expect } from 'vitest';
import {
  getLayoutedElements,
  NODE_WIDTH,
  SPOUSE_WIDTH,
  HORIZONTAL_GAP,
  BRANCH_GAP,
} from '@/components/tree/FamilyTree/layout';
import type { Node, Edge } from '@xyflow/react';

function makeNode(id: string, spouseCount = 0): Node {
  return {
    id,
    type: 'person',
    position: { x: 0, y: 0 },
    data: {
      spouses: Array.from({ length: spouseCount }, (_, i) => ({
        spouse: { id: `${id}-sp-${i}` },
      })),
    },
  };
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `${source}-${target}-${sourceHandle ?? 'default'}`,
    source,
    target,
    sourceHandle,
    type: 'smoothstep',
  };
}

function nodeWidth(n: Node): number {
  const spouses = (n.data as { spouses?: unknown[] }).spouses ?? [];
  return NODE_WIDTH + spouses.length * SPOUSE_WIDTH;
}

function assertNoOverlap(result: { nodes: Node[] }) {
  const personNodes = result.nodes.filter((n) => n.type === 'person');
  const byY = new Map<number, Node[]>();
  for (const n of personNodes) {
    const arr = byY.get(n.position.y) ?? [];
    arr.push(n);
    byY.set(n.position.y, arr);
  }
  for (const [y, arr] of byY) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const aLeft = a.position.x;
        const aRight = a.position.x + nodeWidth(a);
        const bLeft = b.position.x;
        const bRight = b.position.x + nodeWidth(b);
        const overlap = aLeft < bRight && bLeft < aRight;
        if (overlap) {
          throw new Error(
            `Nodes ${a.id} and ${b.id} overlap at Y=${y} (a=[${aLeft},${aRight}] b=[${bLeft},${bRight}])`
          );
        }
      }
    }
  }
}

describe('contour-aware sibling compaction', () => {
  test('leaf sibling sits adjacent to wide sibling card on the right', () => {
    // G
    // ├── A (has children C, D; C has E)
    // └── B (leaf)
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
      makeNode('D'),
      makeNode('E'),
    ];
    const edges = [
      makeEdge('G', 'A'),
      makeEdge('G', 'B'),
      makeEdge('A', 'C'),
      makeEdge('A', 'D'),
      makeEdge('C', 'E'),
    ];
    const result = getLayoutedElements(nodes, edges);
    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;

    expect(B.position.y).toBe(A.position.y);
    const aRight = A.position.x + NODE_WIDTH;
    const distance = B.position.x - aRight;
    // B's left edge should be exactly BRANCH_GAP past A's card right edge
    // (one of the siblings has descendants → branch gap applies).
    expect(distance).toBeCloseTo(BRANCH_GAP, 0);
  });

  test('leaf sibling on the left sits adjacent to wide sibling card', () => {
    // G
    // ├── B (leaf)
    // └── A (has children C, D; C has E)
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
      makeNode('D'),
      makeNode('E'),
    ];
    const edges = [
      makeEdge('G', 'B'),
      makeEdge('G', 'A'),
      makeEdge('A', 'C'),
      makeEdge('A', 'D'),
      makeEdge('C', 'E'),
    ];
    const result = getLayoutedElements(nodes, edges);
    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;

    expect(B.position.y).toBe(A.position.y);
    const bRight = B.position.x + NODE_WIDTH;
    const distance = A.position.x - bRight;
    expect(distance).toBeCloseTo(BRANCH_GAP, 0);
  });

  test('no overlaps when leaf is sandwiched between two wide subtrees', () => {
    // G
    // ├── A (deep) ├── leaf1 ├── leaf2 ├── C (deep)
    // A has C1 (with C1a) + C2; C(third) has K1 (with K1a) + K2.
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('leaf1'),
      makeNode('leaf2'),
      makeNode('C'),
      makeNode('C1'),
      makeNode('C2'),
      makeNode('C1a'),
      makeNode('K1'),
      makeNode('K2'),
      makeNode('K1a'),
    ];
    const edges = [
      makeEdge('G', 'A'),
      makeEdge('G', 'leaf1'),
      makeEdge('G', 'leaf2'),
      makeEdge('G', 'C'),
      makeEdge('A', 'C1'),
      makeEdge('A', 'C2'),
      makeEdge('C1', 'C1a'),
      makeEdge('C', 'K1'),
      makeEdge('C', 'K2'),
      makeEdge('K1', 'K1a'),
    ];
    const result = getLayoutedElements(nodes, edges);
    assertNoOverlap(result);
  });

  test('all-leaf siblings keep HORIZONTAL_GAP spacing (unchanged baseline)', () => {
    const nodes = [
      makeNode('P'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
    ];
    const edges = [
      makeEdge('P', 'A'),
      makeEdge('P', 'B'),
      makeEdge('P', 'C'),
    ];
    const result = getLayoutedElements(nodes, edges);
    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;
    const C = result.nodes.find((n) => n.id === 'C')!;

    expect(B.position.x - (A.position.x + NODE_WIDTH)).toBeCloseTo(HORIZONTAL_GAP, 0);
    expect(C.position.x - (B.position.x + NODE_WIDTH)).toBeCloseTo(HORIZONTAL_GAP, 0);
  });

  test('parent is centered above its children block', () => {
    const nodes = [makeNode('P'), makeNode('A'), makeNode('B')];
    const edges = [makeEdge('P', 'A'), makeEdge('P', 'B')];
    const result = getLayoutedElements(nodes, edges);
    const P = result.nodes.find((n) => n.id === 'P')!;
    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;

    const childrenLeft = Math.min(A.position.x, B.position.x);
    const childrenRight = Math.max(
      A.position.x + NODE_WIDTH,
      B.position.x + NODE_WIDTH
    );
    const childrenMid = (childrenLeft + childrenRight) / 2;
    const parentMid = P.position.x + NODE_WIDTH / 2;
    expect(parentMid).toBeCloseTo(childrenMid, 0);
  });

  test('parent is centered above the union of two deep subtrees of equal width', () => {
    // P
    // ├── A → C → E
    // └── B → D → F
    const nodes = [
      makeNode('P'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
      makeNode('D'),
      makeNode('E'),
      makeNode('F'),
    ];
    const edges = [
      makeEdge('P', 'A'),
      makeEdge('P', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'D'),
      makeEdge('C', 'E'),
      makeEdge('D', 'F'),
    ];
    const result = getLayoutedElements(nodes, edges);
    const P = result.nodes.find((n) => n.id === 'P')!;
    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;

    // A and B are equal-depth subtrees → branch gap applies.
    expect(B.position.x - (A.position.x + NODE_WIDTH)).toBeCloseTo(BRANCH_GAP, 0);
    // P centered between A and B.
    const childrenMid = (A.position.x + B.position.x + NODE_WIDTH) / 2;
    const parentMid = P.position.x + NODE_WIDTH / 2;
    expect(parentMid).toBeCloseTo(childrenMid, 0);
  });

  test('descendants of deep subtree do not collide with leaf sibling row above', () => {
    // G
    // ├── A → C → E (deep)
    // └── B (leaf)
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
      makeNode('D'),
      makeNode('E'),
    ];
    const edges = [
      makeEdge('G', 'A'),
      makeEdge('G', 'B'),
      makeEdge('A', 'C'),
      makeEdge('A', 'D'),
      makeEdge('C', 'E'),
    ];
    const result = getLayoutedElements(nodes, edges);
    assertNoOverlap(result);
  });

  test('compaction does not violate gap at deeper levels', () => {
    // G
    // ├── A (depth 3: A→C→E, A→D)
    // └── X (depth 3: X→Y→Z, X→W)
    // Both A and X are deep — algorithm must keep a full HORIZONTAL_GAP at every level.
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('X'),
      makeNode('C'),
      makeNode('D'),
      makeNode('E'),
      makeNode('Y'),
      makeNode('W'),
      makeNode('Z'),
    ];
    const edges = [
      makeEdge('G', 'A'),
      makeEdge('G', 'X'),
      makeEdge('A', 'C'),
      makeEdge('A', 'D'),
      makeEdge('C', 'E'),
      makeEdge('X', 'Y'),
      makeEdge('X', 'W'),
      makeEdge('Y', 'Z'),
    ];
    const result = getLayoutedElements(nodes, edges);
    assertNoOverlap(result);

    // The gap between D (rightmost level-1 child of A) and Y (leftmost level-1 child of X)
    // is constrained by BRANCH_GAP at the top of the two subtrees, but at level-1
    // the actual horizontal distance can be that or larger (because A and X were
    // pushed apart at level 0 too).
    const D = result.nodes.find((n) => n.id === 'D')!;
    const Y = result.nodes.find((n) => n.id === 'Y')!;
    expect(Y.position.x - (D.position.x + NODE_WIDTH)).toBeGreaterThanOrEqual(
      HORIZONTAL_GAP - 0.5
    );
  });

  test("user scenario: prolific child does not push childless siblings far away", () => {
    // G has 4 children: A is prolific (4 kids, one of whom has 2 grandkids),
    // B, C, D are all childless. Before the fix, B/C/D would be pushed past
    // A's entire wide subtree. After the fix, they sit close to A's card.
    const nodes = [
      makeNode('G'),
      makeNode('A'),
      makeNode('B'),
      makeNode('C'),
      makeNode('D'),
      // A's children
      makeNode('A1'),
      makeNode('A2'),
      makeNode('A3'),
      makeNode('A4'),
      // A1's grandchildren
      makeNode('A1a'),
      makeNode('A1b'),
    ];
    const edges = [
      makeEdge('G', 'A'),
      makeEdge('G', 'B'),
      makeEdge('G', 'C'),
      makeEdge('G', 'D'),
      makeEdge('A', 'A1'),
      makeEdge('A', 'A2'),
      makeEdge('A', 'A3'),
      makeEdge('A', 'A4'),
      makeEdge('A1', 'A1a'),
      makeEdge('A1', 'A1b'),
    ];
    const result = getLayoutedElements(nodes, edges);
    assertNoOverlap(result);

    const A = result.nodes.find((n) => n.id === 'A')!;
    const B = result.nodes.find((n) => n.id === 'B')!;

    // B should be exactly BRANCH_GAP past A's card right edge (A is a branch).
    const aRight = A.position.x + NODE_WIDTH;
    expect(B.position.x - aRight).toBeCloseTo(BRANCH_GAP, 0);

    // The four childless leaves are all at the same Y as A.
    for (const id of ['B', 'C', 'D']) {
      const n = result.nodes.find((nd) => nd.id === id)!;
      expect(n.position.y).toBe(A.position.y);
    }
  });
});
