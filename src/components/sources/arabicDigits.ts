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
