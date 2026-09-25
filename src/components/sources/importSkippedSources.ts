import { toArabicDigits } from './arabicDigits';

/**
 * The notice after a GEDCOM import that left sources behind (the importer
 * does not carry sources); null when nothing was left out.
 */
export function importSkippedSourcesNotice(skippedSources: number): string | null {
  if (skippedSources <= 0) return null;
  return `لم تُستورد المصادر المرفقة بالملف (${toArabicDigits(skippedSources)})، ويمكنك إضافتها يدويًا من صفحة كل شخص.`;
}
