import { describe, test, expect } from 'vitest';
import {
  detectCollectionCycle,
  resolveEffectiveVisibility,
  filterTopLevelCollections,
  MAX_NESTING_DEPTH,
  MAX_ITEMS,
  type CollectionChildEdges,
  type EffectiveVisibilitySource,
} from '@/lib/collections/queries';

// detectCollectionCycle(collectionId, candidateChildId, getChildIds)
// returns true when adding candidateChildId under collectionId WOULD create a
// cycle (or breaches the depth/item caps), false when safe.

describe('detectCollectionCycle', () => {
  test('rejects adding a collection to itself', () => {
    const edges: CollectionChildEdges = () => [];
    expect(detectCollectionCycle('A', 'A', edges)).toBe(true);
  });

  test('allows a simple non-cyclic nesting', () => {
    // A has no children yet; nesting B under A is fine.
    const edges: CollectionChildEdges = () => [];
    expect(detectCollectionCycle('A', 'B', edges)).toBe(false);
  });

  test('rejects a direct cycle A->B then B->A', () => {
    // candidate child A already (transitively) contains the parent B.
    const map: Record<string, string[]> = { A: ['B'] };
    const edges: CollectionChildEdges = (id) => map[id] ?? [];
    // Adding A under B: descendants of A include B (the parent) -> cycle.
    expect(detectCollectionCycle('B', 'A', edges)).toBe(true);
  });

  test('rejects a deep cycle A->B->C then C->A', () => {
    const map: Record<string, string[]> = { A: ['B'], B: ['C'] };
    const edges: CollectionChildEdges = (id) => map[id] ?? [];
    // Adding A under C: descendants of A reach B,C -> C is the parent -> cycle.
    expect(detectCollectionCycle('C', 'A', edges)).toBe(true);
  });

  test('allows nesting a sibling subtree that does not reach the parent', () => {
    const map: Record<string, string[]> = { X: ['Y'], Z: [] };
    const edges: CollectionChildEdges = (id) => map[id] ?? [];
    // Adding X under Z: X's descendants are Y -> never reach Z. Safe.
    expect(detectCollectionCycle('Z', 'X', edges)).toBe(false);
  });

  test('rejects when the candidate subtree exceeds MAX_NESTING_DEPTH', () => {
    // Build a chain longer than the cap: c0 -> c1 -> ... -> cN
    const map: Record<string, string[]> = {};
    const depth = MAX_NESTING_DEPTH + 2;
    for (let i = 0; i < depth; i++) map[`c${i}`] = [`c${i + 1}`];
    const edges: CollectionChildEdges = (id) => map[id] ?? [];
    // Nesting c0 under a fresh parent P would push total depth past the cap.
    expect(detectCollectionCycle('P', 'c0', edges)).toBe(true);
  });

  test('rejects when the candidate subtree exceeds MAX_ITEMS', () => {
    // One collection with more than MAX_ITEMS distinct descendants.
    const children = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `n${i}`);
    const map: Record<string, string[]> = { big: children };
    const edges: CollectionChildEdges = (id) => map[id] ?? [];
    expect(detectCollectionCycle('P', 'big', edges)).toBe(true);
  });
});

describe('resolveEffectiveVisibility', () => {
  test('own-tree item resolves to the tree visibility', () => {
    const src: EffectiveVisibilitySource = { kind: 'tree', treeVisibility: 'public_link' };
    expect(resolveEffectiveVisibility(src)).toBe('public_link');
  });

  test('borrowed-branch item resolves to the source main-tree visibility', () => {
    const src: EffectiveVisibilitySource = { kind: 'branchPointer', sourceVisibility: 'public_listed' };
    expect(resolveEffectiveVisibility(src)).toBe('public_listed');
  });

  test('nested-collection item resolves to the child collection visibility', () => {
    const src: EffectiveVisibilitySource = { kind: 'collection', childVisibility: 'private' };
    expect(resolveEffectiveVisibility(src)).toBe('private');
  });

  test('a private source resolves to private (private wins, drives withholding)', () => {
    const src: EffectiveVisibilitySource = { kind: 'tree', treeVisibility: 'private' };
    expect(resolveEffectiveVisibility(src)).toBe('private');
  });

  test('a missing/unknown source defaults to private (deny-by-default)', () => {
    const src: EffectiveVisibilitySource = { kind: 'tree', treeVisibility: null };
    expect(resolveEffectiveVisibility(src)).toBe('private');
  });
});

describe('filterTopLevelCollections', () => {
  test('keeps only collections not referenced as a child of any item', () => {
    const collections = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    // B is nested under A (A has an item with childCollectionId = B).
    const referencedChildIds = new Set(['B']);
    const result = filterTopLevelCollections(collections, referencedChildIds);
    expect(result.map((c) => c.id)).toEqual(['A', 'C']);
  });

  test('returns all when none are nested', () => {
    const collections = [{ id: 'A' }, { id: 'B' }];
    const result = filterTopLevelCollections(collections, new Set());
    expect(result.map((c) => c.id)).toEqual(['A', 'B']);
  });
});
