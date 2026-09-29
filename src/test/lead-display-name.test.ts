/**
 * getLeadDisplayName: the one-line name a list row leads with — famous name +
 * surname when the famous name leads, otherwise the real display name.
 * getNasabToken: an ancestor's token in a nasab chain.
 */
import { describe, test, expect } from 'vitest';
import { getLeadDisplayName, getNasabToken, getDisplayName } from '@/lib/gedcom';
import type { Individual } from '@/lib/gedcom/types';

function person(over: Partial<Individual> = {}): Individual {
  return {
    id: 'p',
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: 'M',
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
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...over,
  };
}

describe('getLeadDisplayName', () => {
  test('famous name that leads is shown with the surname', () => {
    const shayba = person({ name: 'شيبة', givenName: 'شيبة', surname: 'القرشي', famousName: 'عبدالمطلب' });
    expect(getLeadDisplayName(shayba)).toBe('عبدالمطلب القرشي');
  });

  test('real name leads when the famous name is chosen off the nasab', () => {
    const khubayb = person({
      name: 'خبيب',
      givenName: 'خبيب',
      surname: 'الأسدي',
      famousName: 'ابن الزبير',
    });
    expect(getLeadDisplayName(khubayb)).toBe(getDisplayName(khubayb));
  });

  test('a woman whose famous name leads is shown the same way', () => {
    const aisha = person({
      name: 'عائشة',
      givenName: 'عائشة',
      surname: 'التيمي',
      sex: 'F',
      famousName: 'أم عبدالله',
    });
    expect(getLeadDisplayName(aisha)).toBe('أم عبدالله التيمي');
  });

  test('a blank famous name falls back to the real display name', () => {
    const ahmad = person({ name: 'أحمد سعيد', givenName: 'أحمد', surname: 'سعيد', famousName: '   ' });
    expect(getLeadDisplayName(ahmad)).toBe('أحمد سعيد');
  });
});

describe('getNasabToken', () => {
  test('a leading famous name is put in the genitive', () => {
    const abuTalib = person({ name: 'عبدمناف', givenName: 'عبدمناف', famousName: 'أبو طالب' });
    expect(getNasabToken(abuTalib)).toBe('أبي طالب');
  });
});
