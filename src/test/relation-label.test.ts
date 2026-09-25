/**
 * Sources («المصادر») — `relationLabel(fromId, toId, data)`: the muted
 * relation word on a people-picker row, i.e. what `to` is to `from`.
 */
import { describe, test, expect } from 'vitest';
import { relationLabel } from '@/lib/tree/relation-label';
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';

const EV: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function buildData(): GedcomData {
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  const ind = (id: string, sex: 'M' | 'F' | null) => {
    individuals[id] = {
      id, type: 'INDI', name: id, givenName: id, surname: '', sex,
      birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
      death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
      kunya: '', notes: '', isDeceased: false, isPrivate: false,
      familiesAsSpouse: [], familyAsChild: null,
    };
  };
  const fam = (id: string, husband: string | null, wife: string | null, children: string[]) => {
    families[id] = {
      id, type: 'FAM', husband, wife, children,
      marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false,
    } as Family;
    if (husband) individuals[husband].familiesAsSpouse.push(id);
    if (wife) individuals[wife].familiesAsSpouse.push(id);
    for (const c of children) individuals[c].familyAsChild = id;
  };

  for (const [id, sex] of [
    ['GF', 'M'], ['GM', 'F'], ['FATHER', 'M'], ['UNCLE', 'M'], ['AUNT', 'F'],
    ['MGF', 'M'], ['MGM', 'F'], ['MOTHER', 'F'], ['KHAL', 'M'], ['KHALA', 'F'],
    ['SELF', 'M'], ['BRO', 'M'], ['SIS', 'F'], ['HALF', 'M'], ['STEPMOM', 'F'],
    ['WIFE', 'F'], ['SON', 'M'], ['DAU', 'F'], ['SW', 'F'], ['GSON', 'M'], ['GDAU', 'F'],
    ['UW', 'F'], ['COUSIN_M', 'M'], ['COUSIN_F', 'F'],
    ['BW', 'F'], ['NEPH', 'M'], ['NIECE', 'F'],
    ['SH', 'M'], ['SIS_SON', 'M'], ['AH', 'M'], ['AUNT_SON', 'M'],
    ['STRANGER', 'M'], ['UNKNOWN_SEX_KID', null],
  ] as const) ind(id, sex);

  fam('F_GP', 'GF', 'GM', ['FATHER', 'UNCLE', 'AUNT']);
  fam('F_MGP', 'MGF', 'MGM', ['MOTHER', 'KHAL', 'KHALA']);
  fam('F_P', 'FATHER', 'MOTHER', ['SELF', 'BRO', 'SIS', 'UNKNOWN_SEX_KID']);
  fam('F_P2', 'FATHER', 'STEPMOM', ['HALF']);
  fam('F_SELF', 'SELF', 'WIFE', ['SON', 'DAU']);
  fam('F_SON', 'SON', 'SW', ['GSON', 'GDAU']);
  fam('F_U', 'UNCLE', 'UW', ['COUSIN_M', 'COUSIN_F']);
  fam('F_B', 'BRO', 'BW', ['NEPH', 'NIECE']);
  fam('F_S', 'SH', 'SIS', ['SIS_SON']);
  fam('F_A', 'AH', 'AUNT', ['AUNT_SON']);
  return { individuals, families };
}

const data = buildData();
const label = (to: string, from = 'SELF') => relationLabel(from, to, data);

describe('relationLabel', () => {
  test.each([
    ['FATHER', 'الأب'],
    ['MOTHER', 'الأم'],
    ['WIFE', 'الزوجة'],
    ['SON', 'ابن'],
    ['DAU', 'ابنة'],
    ['BRO', 'الأخ'],
    ['SIS', 'الأخت'],
    ['HALF', 'الأخ'],
    ['GF', 'الجد'],
    ['MGM', 'الجدة'],
    ['GSON', 'حفيد'],
    ['GDAU', 'حفيدة'],
    ['UNCLE', 'العم'],
    ['AUNT', 'العمة'],
    ['KHAL', 'الخال'],
    ['KHALA', 'الخالة'],
    ['COUSIN_M', 'ابن العم'],
    ['COUSIN_F', 'ابنة العم'],
    ['NEPH', 'ابن الأخ'],
    ['NIECE', 'ابنة الأخ'],
  ])('%s → %s', (to, expected) => {
    expect(label(to)).toBe(expected);
  });

  test('the husband, seen from the wife', () => {
    expect(label('SELF', 'WIFE')).toBe('الزوج');
  });

  test('relations outside the list are null', () => {
    expect(label('SIS_SON')).toBeNull(); // ابن الأخت — not in the list
    expect(label('AUNT_SON')).toBeNull(); // ابن العمة — not in the list
    expect(label('STRANGER')).toBeNull();
    expect(label('STEPMOM')).toBeNull();
  });

  test('self, unknown ids and unknown sex are null', () => {
    expect(label('SELF')).toBeNull();
    expect(label('NOPE')).toBeNull();
    expect(relationLabel('NOPE', 'SELF', data)).toBeNull();
    expect(label('UNKNOWN_SEX_KID')).toBeNull();
  });
});
