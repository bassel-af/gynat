import { describe, test, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Collections public-serve — the PURE bounded walk + withholding rules.
//
// This is the public-exposure boundary of the whole feature. The rules pinned
// here MUST never silently widen exposure:
//   - per-item effective visibility recomputed LIVE, deny-by-default
//   - drop any item that is not public_link / public_listed
//   - cross-workspace borrowed items additionally require live source allowReuse
//   - a public parent NEVER widens a non-public child (recursion at any depth)
//   - bounded by MAX_NESTING_DEPTH + MAX_ITEMS + a visited-set (cycle-safe)
// ---------------------------------------------------------------------------

import {
  collectPublicTreeRefs,
  type CollectionWalkNode,
  type CollectionWalkDeps,
} from '@/lib/collections/public-serve';

// A tiny in-memory collection graph the walk traverses. Each node is a
// collection with its items; tree/pointer facts are looked up by id.
interface Graph {
  collections: Record<string, CollectionWalkNode>;
}

function depsFor(graph: Graph): CollectionWalkDeps {
  return {
    getCollectionNode: (id) => graph.collections[id] ?? null,
  };
}

describe('collectPublicTreeRefs — withholding rules', () => {
  test('includes a public own-tree item', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't1' },
              titleAr: 'شجرة',
              effectiveVisibility: 'public_link',
              allowReuse: true,
              isCrossWorkspace: false,
            },
          ],
        },
      },
    };
    const refs = collectPublicTreeRefs('root', depsFor(graph));
    expect(refs.map((r) => r.treeId)).toEqual(['t1']);
  });

  test('withholds a private tree item (deny-by-default)', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't1' },
              titleAr: 'خاص',
              effectiveVisibility: 'private',
              allowReuse: true,
              isCrossWorkspace: false,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph))).toEqual([]);
  });

  test('withholds a cross-workspace borrowed item when source allowReuse is false', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't1' },
              titleAr: 'مستعار',
              effectiveVisibility: 'public_link',
              allowReuse: false, // source turned reuse off → withhold
              isCrossWorkspace: true,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph))).toEqual([]);
  });

  test('includes a cross-workspace borrowed item when source allowReuse is true', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't1' },
              titleAr: 'مستعار',
              effectiveVisibility: 'public_link',
              allowReuse: true,
              isCrossWorkspace: true,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph)).map((r) => r.treeId)).toEqual(['t1']);
  });

  test('own-tree item ignores allowReuse (only cross-workspace is gated)', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't1' },
              titleAr: 'شجرتي',
              effectiveVisibility: 'public_link',
              allowReuse: false, // irrelevant for own tree
              isCrossWorkspace: false,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph)).map((r) => r.treeId)).toEqual(['t1']);
  });
});

describe('collectPublicTreeRefs — recursion', () => {
  test('recurses into a public child collection', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'collection',
              childCollectionId: 'child',
              effectiveVisibility: 'public_listed',
              titleAr: 'فرع',
            },
          ],
        },
        child: {
          id: 'child',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't2' },
              titleAr: 'شجرة',
              effectiveVisibility: 'public_link',
              allowReuse: true,
              isCrossWorkspace: false,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph)).map((r) => r.treeId)).toEqual(['t2']);
  });

  test('a public parent NEVER widens a private child collection', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'collection',
              childCollectionId: 'child',
              effectiveVisibility: 'private', // child collection is private
              titleAr: 'فرع خاص',
            },
          ],
        },
        child: {
          id: 'child',
          visibility: 'private',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 't3' },
              titleAr: 'شجرة',
              effectiveVisibility: 'public_link', // even a public tree inside stays hidden
              allowReuse: true,
              isCrossWorkspace: false,
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph))).toEqual([]);
  });

  test('a dangling child collection (null node) is withheld, fail-closed', () => {
    const graph: Graph = {
      collections: {
        root: {
          id: 'root',
          visibility: 'public_listed',
          items: [
            {
              kind: 'collection',
              childCollectionId: 'missing',
              effectiveVisibility: 'public_listed',
              titleAr: 'فرع مفقود',
            },
          ],
        },
      },
    };
    expect(collectPublicTreeRefs('root', depsFor(graph))).toEqual([]);
  });

  test('a cycle does not spin forever and collects each tree once', () => {
    const graph: Graph = {
      collections: {
        a: {
          id: 'a',
          visibility: 'public_listed',
          items: [
            {
              kind: 'tree',
              treeRef: { treeId: 'ta' },
              titleAr: 'A',
              effectiveVisibility: 'public_link',
              allowReuse: true,
              isCrossWorkspace: false,
            },
            { kind: 'collection', childCollectionId: 'b', effectiveVisibility: 'public_listed', titleAr: 'B' },
          ],
        },
        b: {
          id: 'b',
          visibility: 'public_listed',
          items: [
            { kind: 'collection', childCollectionId: 'a', effectiveVisibility: 'public_listed', titleAr: 'A-again' },
          ],
        },
      },
    };
    const refs = collectPublicTreeRefs('a', depsFor(graph));
    expect(refs.map((r) => r.treeId)).toEqual(['ta']);
  });
});
