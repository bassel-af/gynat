import { describe, test, expect } from 'vitest';
import { searchPlacesSchema, createPlaceSchema } from '@/lib/places/schemas';

describe('searchPlacesSchema', () => {
  test('accepts a valid query string', () => {
    const result = searchPlacesSchema.safeParse({ q: 'مكة' });
    expect(result.success).toBe(true);
  });

  test('defaults q to empty string when missing', () => {
    const result = searchPlacesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('');
    }
  });

  test('rejects query longer than 200 characters', () => {
    const result = searchPlacesSchema.safeParse({ q: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  test('trims whitespace from query', () => {
    const result = searchPlacesSchema.safeParse({ q: '  مكة  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('مكة');
    }
  });
});

describe('createPlaceSchema', () => {
  test('accepts valid place with nameAr only', () => {
    const result = createPlaceSchema.safeParse({ nameAr: 'مكة المكرمة' });
    expect(result.success).toBe(true);
  });

  test('accepts valid place with all fields', () => {
    const result = createPlaceSchema.safeParse({
      nameAr: 'مكة المكرمة',
      nameEn: 'Makkah',
      parentId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  test('rejects empty nameAr', () => {
    const result = createPlaceSchema.safeParse({ nameAr: '' });
    expect(result.success).toBe(false);
  });

  test('rejects nameAr longer than 200 characters', () => {
    const result = createPlaceSchema.safeParse({ nameAr: 'أ'.repeat(201) });
    expect(result.success).toBe(false);
  });

  test('rejects nameEn longer than 200 characters', () => {
    const result = createPlaceSchema.safeParse({
      nameAr: 'مكة',
      nameEn: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid parentId UUID', () => {
    const result = createPlaceSchema.safeParse({
      nameAr: 'مكة',
      parentId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  test('trims nameAr', () => {
    const result = createPlaceSchema.safeParse({ nameAr: '  مكة  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nameAr).toBe('مكة');
    }
  });
});
