/**
 * getPersonSearchText — the ONE text every people-search list matches against:
 * the row's main text + the famous name + the real given name + the kunya.
 */
import { describe, test, expect } from 'vitest';
import { getPersonSearchText, getDisplayNameWithNasab, DEFAULT_NASAB_DEPTH } from '@/lib/gedcom/display';
import { matchesSearch } from '@/lib/utils/search';
import type { Family, GedcomData, Individual } from '@/lib/gedcom/types';

function person(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: '', givenName: '', surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: true, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  };
}

function family(id: string, husband: string, children: string[]): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    id, type: 'FAM', husband, wife: null, children,
    marriageContract: { ...empty }, marriage: { ...empty }, divorce: { ...empty }, isDivorced: false,
  } as Family;
}

/** عمرو (هاشم) ← شيبة (عبدالمطلب) ← عبدمناف (أبو طالب, kunya أبو طالب). */
function chain(over: Record<string, Partial<Individual>> = {}): GedcomData {
  const individuals: Record<string, Individual> = {
    amr: person('amr', { name: 'عمرو', givenName: 'عمرو', famousName: 'هاشم', familiesAsSpouse: ['F1'] }),
    shayba: person('shayba', { name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
    abutalib: person('abutalib', { name: 'عبدمناف', givenName: 'عبدمناف', famousName: 'أبو طالب', kunya: 'أبو طالب', familyAsChild: 'F2' }),
  };
  for (const [id, patch] of Object.entries(over)) individuals[id] = { ...individuals[id], ...patch };
  return { individuals, families: { F1: family('F1', 'amr', ['shayba']), F2: family('F2', 'shayba', ['abutalib']) } };
}

describe('getPersonSearchText', () => {
  test('famous name leads: both the famous name and the real name match', () => {
    const data = chain();
    const text = getPersonSearchText(data, data.individuals.shayba);
    expect(matchesSearch(text, 'عبدالمطلب')).toBe(true);
    expect(matchesSearch(text, 'شيبة')).toBe(true);
  });

  test('the kunya matches', () => {
    const data = chain({ shayba: { kunya: 'أبو الحارث' } });
    expect(matchesSearch(getPersonSearchText(data, data.individuals.shayba), 'أبو الحارث')).toBe(true);
  });

  test('a famous name that does not lead (ابن الزبير) still matches', () => {
    const data = chain({ shayba: { famousName: 'ابن الزبير' } });
    const text = getPersonSearchText(data, data.individuals.shayba);
    expect(matchesSearch(text, 'ابن الزبير')).toBe(true);
    expect(matchesSearch(text, 'شيبة')).toBe(true);
  });

  test('starts with the row main text (name with nasab)', () => {
    const data = chain();
    const p = data.individuals.abutalib;
    expect(getPersonSearchText(data, p).startsWith(getDisplayNameWithNasab(data, p, DEFAULT_NASAB_DEPTH))).toBe(true);
  });

  test('no duplicates: a kunya equal to the famous name appears once', () => {
    const data = chain();
    const text = getPersonSearchText(data, data.individuals.abutalib);
    expect(text.split('أبو طالب').length - 1).toBe(1);
  });

  test('no famous name: exactly today\'s «name kunya» text', () => {
    const data = chain({
      amr: { famousName: undefined },
      shayba: { famousName: undefined, kunya: 'أبو الحارث' },
    });
    const p = data.individuals.shayba;
    const name = getDisplayNameWithNasab(data, p, DEFAULT_NASAB_DEPTH);
    expect(getPersonSearchText(data, p)).toBe(`${name} أبو الحارث`);
  });

  test('no famous name and no kunya: exactly the name with nasab', () => {
    const data = chain({ amr: { famousName: '' }, shayba: { famousName: '' } });
    const p = data.individuals.shayba;
    expect(getPersonSearchText(data, p)).toBe(getDisplayNameWithNasab(data, p, DEFAULT_NASAB_DEPTH));
  });

  test('a list with its own main text keeps it and still adds the other names', () => {
    const data = chain();
    const text = getPersonSearchText(data, data.individuals.shayba, 'عبدالمطلب (1900)');
    expect(text.startsWith('عبدالمطلب (1900)')).toBe(true);
    expect(matchesSearch(text, 'شيبة')).toBe(true);
    expect(matchesSearch(text, '1900')).toBe(true);
  });
});
