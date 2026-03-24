export type CalendarPreference = 'hijri' | 'gregorian';

/** Pick the preferred date, falling back to the other if empty */
export function getPreferredDate(
  gregorian: string,
  hijri: string,
  preference: CalendarPreference,
): string {
  if (preference === 'hijri') return hijri || gregorian;
  return gregorian || hijri;
}

/** Get the secondary date (the non-preferred one), or empty if only one exists */
export function getSecondaryDate(
  gregorian: string,
  hijri: string,
  preference: CalendarPreference,
): string {
  if (preference === 'hijri') return hijri ? gregorian : '';
  return gregorian ? hijri : '';
}

/**
 * Get a calendar suffix for a date when only one calendar is available.
 * Returns 'هـ' if only hijri, 'م' if only gregorian, '' if both exist (toggle handles it).
 */
export function getDateSuffix(gregorian: string, hijri: string): string {
  if (gregorian && hijri) return '';
  if (hijri) return 'هـ';
  if (gregorian) return 'م';
  return '';
}
