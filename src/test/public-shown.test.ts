/**
 * Sources («المصادر») — `isShownOnPublicTree`: the client-safe predicate for
 * "the public tree shows this person in full". Must agree with the ONE public
 * redactor (`redactForPublic(...).publicDisplay === 'full'`) for native
 * people; a borrowed (`_pointed`) person is never shown for sources.
 */
import { describe, test, expect } from 'vitest';
import { isShownOnPublicTree } from '@/lib/tree/public-shown';
import { redactForPublic } from '@/lib/tree/public-visibility';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

const NOW = new Date(Date.UTC(2026, 8, 25));

function person(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id,
    type: 'INDI',
    name: id,
    givenName: id,
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
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...over,
  };
}

const FIXTURES: Individual[] = [
  person('deceased', { isDeceased: true }),
  person('old', { birth: '1850' }),
  person('living-no-date'),
  person('living-dated', { birth: '12 JAN 1990' }),
  person('private-deceased', { isPrivate: true, isDeceased: true }),
  person('private-living', { isPrivate: true }),
  person('boundary', { birth: String(2026 - 130) }),
  person('just-under', { birth: String(2026 - 129) }),
  person('female-hidden-birth', { sex: 'F', isDeceased: true, birth: '1900' }),
];

describe('isShownOnPublicTree', () => {
  test('a deceased, non-private native person is shown', () => {
    expect(isShownOnPublicTree(FIXTURES[0], NOW)).toBe(true);
  });

  test('a presumed-living person is not shown', () => {
    expect(isShownOnPublicTree(person('x'), NOW)).toBe(false);
  });

  test('a private person is not shown', () => {
    expect(isShownOnPublicTree(person('x', { isPrivate: true, isDeceased: true }), NOW)).toBe(false);
  });

  test('a borrowed (pointed) person is not shown', () => {
    expect(isShownOnPublicTree(person('x', { isDeceased: true, _pointed: true }), NOW)).toBe(false);
  });

  test('parity with redactForPublic on native fixtures', () => {
    const data: GedcomData = {
      individuals: Object.fromEntries(FIXTURES.map((p) => [p.id, p])),
      families: {},
    };
    const redacted = redactForPublic(data, NOW, { hideBirthDateForFemale: true });
    for (const p of FIXTURES) {
      expect({ id: p.id, shown: isShownOnPublicTree(p, NOW) }).toEqual({
        id: p.id,
        shown: redacted.individuals[p.id].publicDisplay === 'full',
      });
    }
  });
});
