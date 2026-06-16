/**
 * STATIC placeholder redacted tree for the read-only public viewer preview.
 *
 * Shaped as `GedcomData` (what `TreeContext` consumes today). This stands in for
 * the server's already-redacted public payload: private people appear as
 * redacted entries, living people have birth/places cleared. The components
 * never re-derive redaction — they render what's here. The TDD phase replaces
 * this with the real public endpoint response. NOT real data.
 */

import type { GedcomData } from '@/lib/gedcom/types';

function person(
  p: Partial<GedcomData['individuals'][string]> & { id: string },
): GedcomData['individuals'][string] {
  return {
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: null,
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...p,
  };
}

export const SAMPLE_PUBLIC_TREE: GedcomData = {
  individuals: {
    i1: person({
      id: 'i1',
      name: 'محمد السعيد',
      givenName: 'محمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1870',
      birthHijriDate: '1287',
      birthPlace: 'حلب',
      death: '1945',
      deathHijriDate: '1364',
      deathPlace: 'دمشق',
      kunya: 'أبو أحمد',
      isDeceased: true,
      familiesAsSpouse: ['f1'],
    }),
    i2: person({
      id: 'i2',
      name: 'أحمد السعيد',
      givenName: 'أحمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1902',
      death: '1978',
      isDeceased: true,
      familyAsChild: 'f1',
      familiesAsSpouse: ['f2'],
    }),
    i3: person({
      id: 'i3',
      name: 'خالد السعيد',
      givenName: 'خالد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1906',
      death: '1982',
      isDeceased: true,
      familyAsChild: 'f1',
    }),
    i4: person({
      id: 'i4',
      name: 'يوسف السعيد',
      givenName: 'يوسف',
      surname: 'السعيد',
      sex: 'M',
      kunya: 'أبو محمد',
      // living — server cleared birth fields
      isDeceased: false,
      familyAsChild: 'f2',
    }),
    i5: person({
      id: 'i5',
      // private / redacted placeholder from the server
      name: 'خاص',
      sex: 'F',
      isPrivate: true,
      familyAsChild: 'f2',
    }),
  },
  families: {
    f1: {
      id: 'f1',
      type: 'FAM',
      husband: 'i1',
      wife: null,
      children: ['i2', 'i3'],
      marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      isDivorced: false,
    },
    f2: {
      id: 'f2',
      type: 'FAM',
      husband: 'i2',
      wife: null,
      children: ['i4', 'i5'],
      marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      isDivorced: false,
    },
  },
};
