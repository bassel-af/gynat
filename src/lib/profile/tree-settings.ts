/**
 * Tree canvas color settings — client-only localStorage helpers.
 *
 * Stores user-customizable colors for male/female person-card nodes.
 * No backend persistence; settings are per-browser.
 */

const STORAGE_KEY = 'solalah:tree-display-settings';

export const DEFAULT_MALE_COLOR = '#4a90d9';
export const DEFAULT_FEMALE_COLOR = '#e91e8c';

export interface TreeColorSettings {
  maleNodeColor: string;
  femaleNodeColor: string;
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

export function getTreeColorSettings(): TreeColorSettings {
  if (typeof window === 'undefined') {
    return { maleNodeColor: DEFAULT_MALE_COLOR, femaleNodeColor: DEFAULT_FEMALE_COLOR };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { maleNodeColor: DEFAULT_MALE_COLOR, femaleNodeColor: DEFAULT_FEMALE_COLOR };

    const parsed = JSON.parse(raw) as Partial<TreeColorSettings>;
    return {
      maleNodeColor:
        typeof parsed.maleNodeColor === 'string' && isValidHexColor(parsed.maleNodeColor)
          ? parsed.maleNodeColor
          : DEFAULT_MALE_COLOR,
      femaleNodeColor:
        typeof parsed.femaleNodeColor === 'string' && isValidHexColor(parsed.femaleNodeColor)
          ? parsed.femaleNodeColor
          : DEFAULT_FEMALE_COLOR,
    };
  } catch {
    return { maleNodeColor: DEFAULT_MALE_COLOR, femaleNodeColor: DEFAULT_FEMALE_COLOR };
  }
}

export function saveTreeColorSettings(settings: TreeColorSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded or disabled — fail silently
  }
}

export function resetTreeColorSettings(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // fail silently
  }
}
