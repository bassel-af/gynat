import type { JumpRange } from '@/lib/tree/person-projection';

/** The feature's name, verbatim, everywhere it is shown. */
export const JUMP_LABEL = 'قفزة نسب';

/**
 * Arabic number-noun agreement for «جيل»: 3–10 take the broken plural
 * «أجيال»; everything else (1, 2, 11+) takes the accusative singular «جيلاً».
 */
function generationWord(n: number): string {
  return n >= 3 && n <= 10 ? 'أجيال' : 'جيلاً';
}

/**
 * The human sentence for a «قفزة نسب» generation range, or `null` when neither
 * bound was stated — the honest default, and the reason the label itself never
 * claims the intermediate names are unknown.
 *
 * Plain Western digits, matching the rest of the app.
 */
export function jumpRangeText(range: JumpRange): string | null {
  const { generationsMin: min, generationsMax: max } = range;
  if (min != null && max != null) return `بين ${min} و${max} ${generationWord(max)}`;
  if (min != null) return `لا يقل عن ${min} ${generationWord(min)}`;
  if (max != null) return `لا يزيد على ${max} ${generationWord(max)}`;
  return null;
}
