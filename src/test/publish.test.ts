import { describe, test, expect } from 'vitest';
import {
  mapUiLevelToVisibility,
  mapVisibilityToUiLevel,
  validateConfirmationPhrase,
} from '@/lib/tree/publish';

// ---------------------------------------------------------------------------
// UI level <-> DB enum mapping
// ---------------------------------------------------------------------------

describe('mapUiLevelToVisibility', () => {
  test('private -> private', () => {
    expect(mapUiLevelToVisibility('private')).toBe('private');
  });
  test('link -> public_link', () => {
    expect(mapUiLevelToVisibility('link')).toBe('public_link');
  });
  test('search -> public_listed', () => {
    expect(mapUiLevelToVisibility('search')).toBe('public_listed');
  });
});

describe('mapVisibilityToUiLevel', () => {
  test('private -> private', () => {
    expect(mapVisibilityToUiLevel('private')).toBe('private');
  });
  test('public_link -> link', () => {
    expect(mapVisibilityToUiLevel('public_link')).toBe('link');
  });
  test('public_listed -> search', () => {
    expect(mapVisibilityToUiLevel('public_listed')).toBe('search');
  });
});

describe('mapUiLevelToVisibility / mapVisibilityToUiLevel round-trip', () => {
  test('round-trips every level', () => {
    for (const level of ['private', 'link', 'search'] as const) {
      expect(mapVisibilityToUiLevel(mapUiLevelToVisibility(level))).toBe(level);
    }
  });
});

// ---------------------------------------------------------------------------
// Typed confirmation phrase (PRD §1.3, §7.2) — diacritic-insensitive
// ---------------------------------------------------------------------------

describe('validateConfirmationPhrase', () => {
  test('exact match passes', () => {
    expect(validateConfirmationPhrase('آل السعيد', 'آل السعيد')).toBe(true);
  });

  test('match ignores Arabic diacritics', () => {
    // typed without tashkeel, expected with tashkeel
    expect(validateConfirmationPhrase('ال السعيد', 'الْ السَّعيد')).toBe(true);
  });

  test('leading/trailing whitespace is ignored', () => {
    expect(validateConfirmationPhrase('  آل السعيد  ', 'آل السعيد')).toBe(true);
  });

  test('wrong phrase fails', () => {
    expect(validateConfirmationPhrase('شيء آخر', 'آل السعيد')).toBe(false);
  });

  test('empty typed phrase fails', () => {
    expect(validateConfirmationPhrase('', 'آل السعيد')).toBe(false);
    expect(validateConfirmationPhrase('   ', 'آل السعيد')).toBe(false);
  });

  test('empty expected phrase always fails (cannot confirm against nothing)', () => {
    expect(validateConfirmationPhrase('anything', '')).toBe(false);
  });
});
