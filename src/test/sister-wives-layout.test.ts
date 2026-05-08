import { describe, test, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';

import { buildTreeData, type HighlightState, type PersonNodeData } from '@/components/tree/FamilyTree/buildTreeData';
import {
  buildSisterWivesFixture,
  buildThreeSisterWivesFixture,
  buildMixedClusterFixture,
  buildSisterWivesTiebreakFixture,
} from './fixtures/cousin-marriage';

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

function nodeData(n: Node): PersonNodeData {
  return n.data as PersonNodeData;
}

function countHSpouseCards(nodes: Node[], spouseId: string): number {
  let count = 0;
  for (const node of nodes) {
    const d = nodeData(node);
    if (!d.spouses) continue;
    for (const sp of d.spouses) {
      if (sp.spouse.id === spouseId) count += 1;
    }
  }
  return count;
}

function countMainNodes(nodes: Node[], id: string): number {
  return nodes.filter((n) => n.id === id).length;
}

/**
 * Sibling order for parent F = the order of children at the same Y level
 * descending from F, sorted by X position (or by emission order in edges).
 *
 * For A.2, F's children include the surrogate H instead of S1/S2 — so the
 * "edge target" view from F shows F → B0, F → H (twice, once per sister
 * spouse-target handle), F → B1.
 *
 * To get the visual order, we deduplicate edge targets and read them in
 * emission order.
 */
function siblingOrderForParent(edges: Edge[], parentId: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const e of edges) {
    if (e.source !== parentId) continue;
    if (seen.has(e.target)) continue;
    seen.add(e.target);
    order.push(e.target);
  }
  return order;
}

describe('buildTreeData — sister-wives clustering (A.2: H promoted to main node)', () => {
  test('H is a main node when he marries two sisters', () => {
    const data = buildSisterWivesFixture();
    const { nodes } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    expect(nodes.find((n) => n.id === 'H')).toBeDefined();
  });

  test('S1 and S2 are NOT main nodes (demoted to spouse-cards on H)', () => {
    const data = buildSisterWivesFixture();
    const { nodes } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    expect(nodes.find((n) => n.id === 'S1')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'S2')).toBeUndefined();
  });

  test('H.spouses[] contains both sisters in eldest-first order', () => {
    const data = buildSisterWivesFixture();
    const { nodes } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const h = nodes.find((n) => n.id === 'H')!;
    const ids = nodeData(h).spouses.map((s) => s.spouse.id);
    expect(ids).toEqual(['S1', 'S2']);
  });

  test('exactly two parent-edges F → H, with spouse-target handles 0 and 1', () => {
    const data = buildSisterWivesFixture();
    const { edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const fToH = edges.filter((e) => e.source === 'F' && e.target === 'H');
    expect(fToH.length).toBe(2);
    const handles = fToH.map((e) => e.targetHandle).sort();
    expect(handles).toEqual(['spouse-target-0', 'spouse-target-1']);
  });

  test('no F → S1 or F → S2 edges', () => {
    const data = buildSisterWivesFixture();
    const { edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const toS1 = edges.find((e) => e.source === 'F' && e.target === 'S1');
    const toS2 = edges.find((e) => e.source === 'F' && e.target === 'S2');
    expect(toS1).toBeUndefined();
    expect(toS2).toBeUndefined();
  });

  test("S1's child SC1 routes via H's spouse-0 handle; S2's child SC2 via spouse-1", () => {
    const data = buildSisterWivesFixture();
    const { edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const hToSC1 = edges.find((e) => e.source === 'H' && e.target === 'SC1');
    const hToSC2 = edges.find((e) => e.source === 'H' && e.target === 'SC2');
    expect(hToSC1).toBeDefined();
    expect(hToSC2).toBeDefined();
    expect(hToSC1!.sourceHandle).toBe('spouse-0');
    expect(hToSC2!.sourceHandle).toBe('spouse-1');
  });

  test('no sister-wife-link edges anywhere in the output', () => {
    const data = buildSisterWivesFixture();
    const { edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const lateral = edges.filter((e) => e.className === 'sister-wife-link');
    expect(lateral.length).toBe(0);
  });

  test('three-sister case: H is main node with 3 spouses, exactly 3 parent-edges F → H with spouse-target-0/1/2', () => {
    const data = buildThreeSisterWivesFixture();
    const { nodes, edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);

    const h = nodes.find((n) => n.id === 'H')!;
    expect(h).toBeDefined();
    expect(nodeData(h).spouses.map((s) => s.spouse.id)).toEqual(['S1', 'S2', 'S3']);

    const fToH = edges.filter((e) => e.source === 'F' && e.target === 'H');
    expect(fToH.length).toBe(3);
    const handles = fToH.map((e) => e.targetHandle).sort();
    expect(handles).toEqual(['spouse-target-0', 'spouse-target-1', 'spouse-target-2']);
  });

  test('mixed cluster: H is a single main node AND ALSO appears as a spouse-card on W3 (unrelated wife under different parent)', () => {
    const data = buildMixedClusterFixture();
    const { nodes } = buildTreeData(data, 'GP', 50, '', noHighlight, null, noopCallbacks);

    expect(countMainNodes(nodes, 'H')).toBe(1);
    expect(countHSpouseCards(nodes, 'H')).toBe(1);

    const w3 = nodes.find((n) => n.id === 'W3')!;
    expect(w3).toBeDefined();
    expect(nodeData(w3).spouses.some((s) => s.spouse.id === 'H')).toBe(true);

    // H's main-node should be linkedTo W3 (or vice versa); the existing
    // second-pass marks both sides. We only assert the existence of the
    // linkage in either direction.
    const h = nodes.find((n) => n.id === 'H')!;
    const hLinked = nodeData(h).linkedTo === 'W3';
    const w3SpouseLinked = nodeData(w3).spouses.find((s) => s.spouse.id === 'H')?.linkedTo === 'H';
    expect(hLinked || w3SpouseLinked).toBe(true);
  });

  test('anchor tiebreak: with missing birth dates, eldest = first by F.children order (S1)', () => {
    const data = buildSisterWivesTiebreakFixture();
    const { nodes } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const h = nodes.find((n) => n.id === 'H')!;
    expect(h).toBeDefined();
    const ids = nodeData(h).spouses.map((s) => s.spouse.id);
    expect(ids).toEqual(['S1', 'S2']);
  });

  test("non-cluster siblings preserve birth-year order around H's surrogate slot: B0 → H → B1 in F's edge order", () => {
    const data = buildSisterWivesFixture();
    const { edges } = buildTreeData(data, 'F', 50, '', noHighlight, null, noopCallbacks);
    const order = siblingOrderForParent(edges, 'F');
    expect(order).toEqual(['B0', 'H', 'B1']);
  });
});
