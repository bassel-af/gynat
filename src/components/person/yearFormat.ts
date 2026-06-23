import type { CalendarPreference } from '@/lib/calendar-helpers';
import { getPreferredDate, getSecondaryDate, getDateSuffix } from '@/lib/calendar-helpers';
import type { MarriageEvent, PersonChip, PersonSubject } from '@/lib/tree/person-projection';

/**
 * Year/date formatting for the Person Page.
 *
 * The backend projection carries RAW dates in BOTH calendars on every chip and
 * on the subject; nothing is pre-formatted there. So EVERY date on the page —
 * chips, lineage nodes, the mother ribbon, the subject record, marriage meta —
 * is formatted here, client-side, honoring the user's hijri/gregorian
 * preference. The whole page stays consistent when the toggle flips.
 */

interface DatePair {
  greg: string;
  hijri: string;
}

/** Pick the preferred year, append a bare هـ/م marker only when one calendar exists. */
function oneYear({ greg, hijri }: DatePair, preference: CalendarPreference): string {
  const year = getPreferredDate(greg, hijri, preference);
  if (!year) return '';
  return `${year}${getDateSuffix(greg, hijri)}`;
}

/**
 * A chip's compact lifespan, honoring the calendar preference:
 *   - both ends → «<birth> – <death>»
 *   - one end → that year (with a هـ/م marker if only one calendar is known)
 *   - nothing → undefined (the caller omits the years node)
 * The death end is only used when the person is deceased.
 */
export function chipYears(chip: PersonChip, preference: CalendarPreference): string | undefined {
  if (chip.private) return undefined;

  const birth = oneYear({ greg: chip.birth, hijri: chip.birthHijriDate }, preference);
  const death = chip.isDeceased
    ? oneYear({ greg: chip.death, hijri: chip.deathHijriDate }, preference)
    : '';

  if (birth && death) return `${birth} – ${death}`;
  return birth || death || undefined;
}

/** The subject's birth line: «<preferred> ≡ <secondary>» (or one with a marker). */
export function subjectBirth(subject: PersonSubject, preference: CalendarPreference): string {
  return bothCalendars({ greg: subject.birth, hijri: subject.birthHijriDate }, preference);
}

/** The subject's death line (only meaningful when not living). */
export function subjectDeath(subject: PersonSubject, preference: CalendarPreference): string {
  return bothCalendars({ greg: subject.death, hijri: subject.deathHijriDate }, preference);
}

/** The compact lifespan shown in the hero meta. */
export function subjectLifespan(
  subject: PersonSubject,
  preference: CalendarPreference,
): string | undefined {
  const birth = oneYear({ greg: subject.birth, hijri: subject.birthHijriDate }, preference);
  const death = subject.isDeceased
    ? oneYear({ greg: subject.death, hijri: subject.deathHijriDate }, preference)
    : '';
  if (birth && death) return `${birth} – ${death}`;
  return birth || death || undefined;
}

/**
 * The marriage meta line, e.g. «عقد ١٤٢٧ هـ · حلب». Date honors the calendar
 * preference; place is appended when present. Returns undefined when neither a
 * date nor a place is known.
 */
export function marriageMeta(
  event: MarriageEvent | undefined,
  preference: CalendarPreference,
): string | undefined {
  if (!event) return undefined;
  const year = oneYear({ greg: event.date, hijri: event.hijriDate }, preference);
  const parts: string[] = [];
  if (year) parts.push(`عقد ${year}`);
  if (event.place?.trim()) parts.push(event.place.trim());
  return parts.length ? parts.join(' · ') : undefined;
}

/** «<preferred> ≡ <secondary>» when both calendars exist, else one with a marker. */
function bothCalendars(pair: DatePair, preference: CalendarPreference): string {
  const primary = getPreferredDate(pair.greg, pair.hijri, preference);
  if (!primary) return '';
  const secondary = getSecondaryDate(pair.greg, pair.hijri, preference);
  return secondary ? `${primary} ≡ ${secondary}` : `${primary}${getDateSuffix(pair.greg, pair.hijri)}`;
}
