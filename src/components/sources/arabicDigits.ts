const DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** 12 → «١٢» (footnote numbers, counters). */
export function toArabicDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}
