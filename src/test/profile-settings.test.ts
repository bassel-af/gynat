import { describe, test, expect, beforeEach } from 'vitest';

const STORAGE_KEY = 'solalah:tree-display-settings';

// ============================================================================
// Default colors
// ============================================================================
describe('getTreeColorSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns default colors when nothing is saved', async () => {
    const { getTreeColorSettings, DEFAULT_MALE_COLOR, DEFAULT_FEMALE_COLOR } =
      await import('@/lib/profile/tree-settings');
    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe(DEFAULT_MALE_COLOR);
    expect(settings.femaleNodeColor).toBe(DEFAULT_FEMALE_COLOR);
  });

  test('default colors are valid hex strings', async () => {
    const { DEFAULT_MALE_COLOR, DEFAULT_FEMALE_COLOR } =
      await import('@/lib/profile/tree-settings');
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    expect(DEFAULT_MALE_COLOR).toMatch(hexRegex);
    expect(DEFAULT_FEMALE_COLOR).toMatch(hexRegex);
  });
});

// ============================================================================
// Persisting colors
// ============================================================================
describe('saveTreeColorSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('saves colors to localStorage and retrieves them', async () => {
    const { saveTreeColorSettings, getTreeColorSettings } =
      await import('@/lib/profile/tree-settings');

    saveTreeColorSettings({
      maleNodeColor: '#112233',
      femaleNodeColor: '#aabbcc',
    });

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe('#112233');
    expect(settings.femaleNodeColor).toBe('#aabbcc');
  });

  test('overwrites previous colors', async () => {
    const { saveTreeColorSettings, getTreeColorSettings } =
      await import('@/lib/profile/tree-settings');

    saveTreeColorSettings({
      maleNodeColor: '#111111',
      femaleNodeColor: '#222222',
    });
    saveTreeColorSettings({
      maleNodeColor: '#333333',
      femaleNodeColor: '#444444',
    });

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe('#333333');
    expect(settings.femaleNodeColor).toBe('#444444');
  });
});

// ============================================================================
// Invalid color fallback
// ============================================================================
describe('getTreeColorSettings with invalid data', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('falls back to defaults when localStorage contains invalid JSON', async () => {
    const { getTreeColorSettings, DEFAULT_MALE_COLOR, DEFAULT_FEMALE_COLOR } =
      await import('@/lib/profile/tree-settings');

    localStorage.setItem(STORAGE_KEY, 'not valid json {{{');

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe(DEFAULT_MALE_COLOR);
    expect(settings.femaleNodeColor).toBe(DEFAULT_FEMALE_COLOR);
  });

  test('falls back to defaults when stored colors are not valid hex', async () => {
    const { getTreeColorSettings, DEFAULT_MALE_COLOR, DEFAULT_FEMALE_COLOR } =
      await import('@/lib/profile/tree-settings');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ maleNodeColor: 'red', femaleNodeColor: 'blue' }),
    );

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe(DEFAULT_MALE_COLOR);
    expect(settings.femaleNodeColor).toBe(DEFAULT_FEMALE_COLOR);
  });

  test('falls back to default for individual invalid color', async () => {
    const { getTreeColorSettings, DEFAULT_MALE_COLOR } =
      await import('@/lib/profile/tree-settings');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ maleNodeColor: 'invalid', femaleNodeColor: '#aabbcc' }),
    );

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe(DEFAULT_MALE_COLOR);
    expect(settings.femaleNodeColor).toBe('#aabbcc');
  });
});

// ============================================================================
// Reset to defaults
// ============================================================================
describe('resetTreeColorSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('resets colors back to defaults', async () => {
    const {
      saveTreeColorSettings,
      resetTreeColorSettings,
      getTreeColorSettings,
      DEFAULT_MALE_COLOR,
      DEFAULT_FEMALE_COLOR,
    } = await import('@/lib/profile/tree-settings');

    saveTreeColorSettings({
      maleNodeColor: '#000000',
      femaleNodeColor: '#ffffff',
    });

    resetTreeColorSettings();

    const settings = getTreeColorSettings();
    expect(settings.maleNodeColor).toBe(DEFAULT_MALE_COLOR);
    expect(settings.femaleNodeColor).toBe(DEFAULT_FEMALE_COLOR);
  });

  test('clears the localStorage key after reset', async () => {
    const { saveTreeColorSettings, resetTreeColorSettings } =
      await import('@/lib/profile/tree-settings');

    saveTreeColorSettings({
      maleNodeColor: '#000000',
      femaleNodeColor: '#ffffff',
    });

    resetTreeColorSettings();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
