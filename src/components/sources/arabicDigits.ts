const DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** 12 → «١٢» (footnote numbers, counters). */
export function toArabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}

/**
 * «N مصدر» with Arabic number-noun agreement: 1 → «مصدر واحد», 2 → «مصدران»,
 * 3–10 → «مصادر», 11–99 → «مصدرًا», and a round hundred → «مصدر».
 */
export function sourceCountLabel(n: number): string {
  if (n === 1) return 'مصدر واحد';
  if (n === 2) return 'مصدران';
  const rem = n % 100;
  const noun = rem >= 3 && rem <= 10 ? 'مصادر' : rem >= 11 ? 'مصدرًا' : 'مصدر';
  return `${toArabicDigits(n)} ${noun}`;
}

/** 3–10 → plural, 11–99 → accusative singular, a round hundred → singular. */
function countNoun(n: number, plural: string, accusative: string, singular: string): string {
  const rem = n % 100;
  return rem >= 3 && rem <= 10 ? plural : rem >= 11 ? accusative : singular;
}

/**
 * «N شخص» after a preposition («حفظ عند …», «هذا المصدر لـ …»): 1 → «شخص
 * واحد», 2 → «شخصين», 3–10 → «أشخاص», 11–99 → «شخصًا».
 */
export function peopleCountLabel(n: number): string {
  if (n === 1) return 'شخص واحد';
  if (n === 2) return 'شخصين';
  return `${toArabicDigits(n)} ${countNoun(n, 'أشخاص', 'شخصًا', 'شخص')}`;
}

/** The people picker's footer: «شخص واحد محدد» … «١١ شخصًا محددًا». */
export function selectedPeopleLabel(n: number): string {
  if (n === 1) return 'شخص واحد محدد';
  if (n === 2) return 'شخصان محددان';
  return `${toArabicDigits(n)} ${countNoun(n, 'أشخاص محددين', 'شخصًا محددًا', 'شخص محدد')}`;
}

/** The tail of a collapsed names list: «وشخص آخر» / «وشخصان آخران» / «و٦ آخرون». */
export function othersMoreLabel(n: number): string {
  if (n === 1) return 'وشخص آخر';
  if (n === 2) return 'وشخصان آخران';
  return `و${toArabicDigits(n)} آخرون`;
}

/**
 * A short people list: up to three names in full («محمد، فاطمة وأحمد»),
 * else two names and the rest («محمد، فاطمة و٨ آخرون»). `total` may exceed
 * the names sent (capped server lists).
 */
export function namesSummary(names: readonly string[], total: number): string {
  if (names.length === 0) return total > 0 ? peopleCountLabel(total) : '';
  if (total <= 3 && names.length >= total) {
    const list = names.slice(0, total);
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join('، ')} و${list[list.length - 1]}`;
  }
  const shown = names.slice(0, 2);
  return `${shown.join('، ')} ${othersMoreLabel(total - shown.length)}`;
}

/** «N ملف»: 1 → «ملف واحد», 2 → «ملفان», 3–10 → «ملفات», 11–99 → «ملفًا». */
export function fileCountLabel(n: number): string {
  if (n === 1) return 'ملف واحد';
  if (n === 2) return 'ملفان';
  return `${toArabicDigits(n)} ${countNoun(n, 'ملفات', 'ملفًا', 'ملف')}`;
}
