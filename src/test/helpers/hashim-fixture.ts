/**
 * Shared «اسم الشهرة» fixture: عبدالمطلب → أبو طالب (عبدمناف) → علي, plus
 * جعفر with no parents. Used by the form and the preview tests.
 */
import type { Family, GedcomData, Individual } from '@/lib/gedcom/types';

export function ind(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.givenName ?? '',
    givenName: '',
    surname: '',
    sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '',
    isDeceased: true, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  };
}

export function fam(overrides: Partial<Family> & { id: string }): Family {
  const ev = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    type: 'FAM', husband: null, wife: null, children: [],
    marriageContract: ev, marriage: ev, divorce: ev, isDivorced: false,
    ...overrides,
  } as Family;
}

/** عبدالمطلب → أبو طالب (عبدمناف) → علي; جعفر has no parents. */
export function hashimData(): GedcomData {
  return {
    individuals: {
      I1: ind({ id: 'I1', givenName: 'عبدالمطلب', familiesAsSpouse: ['F1'] }),
      I2: ind({ id: 'I2', givenName: 'عبدمناف', famousName: 'أبو طالب', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
      I3: ind({ id: 'I3', givenName: 'علي', familyAsChild: 'F2' }),
      I4: ind({ id: 'I4', givenName: 'جعفر' }),
    },
    families: {
      F1: fam({ id: 'F1', husband: 'I1', children: ['I2'] }),
      F2: fam({ id: 'F2', husband: 'I2', children: ['I3'] }),
    },
  } as unknown as GedcomData;
}
