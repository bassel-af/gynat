import { describe, it, expect } from 'vitest';
import {
  toUiVisibility,
  isWithheldWhenPublic,
  itemCount,
  collectionUsedSourceIds,
  type CollectionItem,
  type Collection,
} from '@/lib/collections/api';

// ---------------------------------------------------------------------------
// toUiVisibility — the single mapping between the DB TreeVisibility enum
// (private | public_link | public_listed) and the UI's three-level ladder
// (private | link | search). Defensive: it must also pass UI-enum values
// through unchanged so the UI doesn't double-map if the route already mapped.
// ---------------------------------------------------------------------------

describe('toUiVisibility', () => {
  it('maps the DB public_link enum to the UI "link" level', () => {
    expect(toUiVisibility('public_link')).toBe('link');
  });

  it('maps the DB public_listed enum to the UI "search" level', () => {
    expect(toUiVisibility('public_listed')).toBe('search');
  });

  it('passes the UI "link" value through unchanged (no double-map)', () => {
    expect(toUiVisibility('link')).toBe('link');
  });

  it('passes the UI "search" value through unchanged (no double-map)', () => {
    expect(toUiVisibility('search')).toBe('search');
  });

  it('falls back to private for an unknown/missing value (deny-by-default)', () => {
    expect(toUiVisibility(undefined)).toBe('private');
    expect(toUiVisibility('something-else')).toBe('private');
  });
});

// ---------------------------------------------------------------------------
// isWithheldWhenPublic — §3 safety: a private underlying tree is withheld
// from a public collection. Only applies to tree items.
// ---------------------------------------------------------------------------

describe('isWithheldWhenPublic', () => {
  const treeItem = (treeVisibility: CollectionItem['treeVisibility']): CollectionItem => ({
    id: 'i1',
    kind: 'tree',
    titleAr: 'فرع',
    linkMode: 'linked',
    treeVisibility,
  });

  it('withholds a tree item whose underlying tree is private', () => {
    expect(isWithheldWhenPublic(treeItem('private'))).toBe(true);
  });

  it('does not withhold a tree item whose underlying tree is public', () => {
    expect(isWithheldWhenPublic(treeItem('link'))).toBe(false);
  });

  it('never withholds a nested-collection item', () => {
    const nested: CollectionItem = {
      id: 'i2',
      kind: 'collection',
      titleAr: 'مجموعة',
      childCollectionId: 'c2',
    };
    expect(isWithheldWhenPublic(nested)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// itemCount — a list row reports itemCount directly; a detail object carries
// its items array. The helper reads whichever is present.
// ---------------------------------------------------------------------------

describe('itemCount', () => {
  it('reads the itemCount field when present (list row)', () => {
    const row = { id: 'c1', titleAr: 't', visibility: 'private', itemCount: 7 } as Collection;
    expect(itemCount(row)).toBe(7);
  });

  it('falls back to the items array length when no itemCount field', () => {
    const detail = {
      id: 'c1',
      titleAr: 't',
      visibility: 'private',
      items: [
        { id: 'i1', kind: 'tree', titleAr: 'a' },
        { id: 'i2', kind: 'tree', titleAr: 'b' },
      ],
    } as Collection;
    expect(itemCount(detail)).toBe(2);
  });

  it('returns 0 when neither itemCount nor items is present', () => {
    const row = { id: 'c1', titleAr: 't', visibility: 'private' } as Collection;
    expect(itemCount(row)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// collectionUsedSourceIds — the set of source ids already in a collection, used
// by the add-item picker to block adding the SAME tree/collection twice.
// Tree items contribute their treeId; nested items their childCollectionId.
// ---------------------------------------------------------------------------

describe('collectionUsedSourceIds', () => {
  it('collects treeIds from tree items', () => {
    const items: CollectionItem[] = [
      { id: 'i1', kind: 'tree', titleAr: 'a', treeId: 'tree-1' },
      { id: 'i2', kind: 'tree', titleAr: 'b', treeId: 'tree-2' },
    ];
    const used = collectionUsedSourceIds(items);
    expect(used.has('tree-1')).toBe(true);
    expect(used.has('tree-2')).toBe(true);
  });

  it('collects childCollectionIds from nested items', () => {
    const items: CollectionItem[] = [
      { id: 'i1', kind: 'collection', titleAr: 'a', childCollectionId: 'coll-1' },
    ];
    expect(collectionUsedSourceIds(items).has('coll-1')).toBe(true);
  });

  it('returns an empty set for items with no source id', () => {
    const items: CollectionItem[] = [{ id: 'i1', kind: 'tree', titleAr: 'a' }];
    expect(collectionUsedSourceIds(items).size).toBe(0);
  });
});
