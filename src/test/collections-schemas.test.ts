import { describe, test, expect } from 'vitest';
import {
  createCollectionSchema,
  updateCollectionSchema,
  createExtraTreeSchema,
  addItemSchema,
  updateItemSchema,
  resolveLinkSchema,
} from '@/lib/collections/schemas';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('createCollectionSchema', () => {
  test('accepts a valid title with optional description', () => {
    const r = createCollectionSchema.safeParse({ titleAr: 'مقرر الأنساب' });
    expect(r.success).toBe(true);
  });

  test('rejects empty title', () => {
    const r = createCollectionSchema.safeParse({ titleAr: '' });
    expect(r.success).toBe(false);
  });

  test('rejects whitespace-only title (trim refine)', () => {
    const r = createCollectionSchema.safeParse({ titleAr: '   ' });
    expect(r.success).toBe(false);
  });

  test('rejects title over 150 chars', () => {
    const r = createCollectionSchema.safeParse({ titleAr: 'ا'.repeat(151) });
    expect(r.success).toBe(false);
  });

  test('rejects description over 2000 chars', () => {
    const r = createCollectionSchema.safeParse({
      titleAr: 'عنوان',
      descriptionAr: 'ب'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  test('accepts null description', () => {
    const r = createCollectionSchema.safeParse({ titleAr: 'عنوان', descriptionAr: null });
    expect(r.success).toBe(true);
  });
});

describe('updateCollectionSchema', () => {
  test('accepts an empty object (all optional)', () => {
    const r = updateCollectionSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test('rejects whitespace-only title when provided', () => {
    const r = updateCollectionSchema.safeParse({ titleAr: '   ' });
    expect(r.success).toBe(false);
  });
});

describe('createExtraTreeSchema', () => {
  test('accepts a valid name', () => {
    const r = createExtraTreeSchema.safeParse({ nameAr: 'قبيلة بني تميم' });
    expect(r.success).toBe(true);
  });

  test('rejects empty name', () => {
    const r = createExtraTreeSchema.safeParse({ nameAr: '' });
    expect(r.success).toBe(false);
  });

  test('rejects name over 150 chars', () => {
    const r = createExtraTreeSchema.safeParse({ nameAr: 'ا'.repeat(151) });
    expect(r.success).toBe(false);
  });
});

describe('addItemSchema (discriminated union)', () => {
  test('accepts own-tree item with treeId + linkMode', () => {
    const r = addItemSchema.safeParse({
      kind: 'tree',
      treeId: UUID,
      linkMode: 'linked',
      titleAr: 'فرع',
    });
    expect(r.success).toBe(true);
  });

  test('accepts link item with linkInput + linkMode', () => {
    const r = addItemSchema.safeParse({
      kind: 'tree',
      linkInput: 'gynat.com/t/saeed-elder-9f2a',
      linkMode: 'copied',
      titleAr: 'فرع مستعار',
    });
    expect(r.success).toBe(true);
  });

  test('accepts nested-collection item with childCollectionId', () => {
    const r = addItemSchema.safeParse({
      kind: 'collection',
      childCollectionId: UUID,
      titleAr: 'مجموعة فرعية',
    });
    expect(r.success).toBe(true);
  });

  test('rejects own-tree item missing linkMode', () => {
    const r = addItemSchema.safeParse({ kind: 'tree', treeId: UUID, titleAr: 'فرع' });
    expect(r.success).toBe(false);
  });

  test('rejects tree item with neither treeId nor linkInput', () => {
    const r = addItemSchema.safeParse({ kind: 'tree', linkMode: 'linked', titleAr: 'فرع' });
    expect(r.success).toBe(false);
  });

  test('rejects nested-collection item with a non-uuid childCollectionId', () => {
    const r = addItemSchema.safeParse({
      kind: 'collection',
      childCollectionId: 'not-a-uuid',
      titleAr: 'مجموعة',
    });
    expect(r.success).toBe(false);
  });

  test('rejects unknown kind', () => {
    const r = addItemSchema.safeParse({ kind: 'mystery', titleAr: 'x' });
    expect(r.success).toBe(false);
  });

  test('rejects an empty titleAr on a tree item', () => {
    const r = addItemSchema.safeParse({
      kind: 'tree',
      treeId: UUID,
      linkMode: 'linked',
      titleAr: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('updateItemSchema', () => {
  test('accepts an empty object', () => {
    const r = updateItemSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test('rejects negative sortOrder', () => {
    const r = updateItemSchema.safeParse({ sortOrder: -1 });
    expect(r.success).toBe(false);
  });

  test('rejects non-integer sortOrder', () => {
    const r = updateItemSchema.safeParse({ sortOrder: 1.5 });
    expect(r.success).toBe(false);
  });

  test('accepts sortOrder of 0', () => {
    const r = updateItemSchema.safeParse({ sortOrder: 0 });
    expect(r.success).toBe(true);
  });
});

describe('resolveLinkSchema', () => {
  test('accepts a non-empty input', () => {
    const r = resolveLinkSchema.safeParse({ input: 'gynat.com/t/abc' });
    expect(r.success).toBe(true);
  });

  test('rejects empty input', () => {
    const r = resolveLinkSchema.safeParse({ input: '' });
    expect(r.success).toBe(false);
  });

  test('rejects input over 500 chars', () => {
    const r = resolveLinkSchema.safeParse({ input: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });
});
