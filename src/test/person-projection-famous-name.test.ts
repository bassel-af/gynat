import { describe, test, expect, vi } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import {
  projectPerson,
  MEMBER_PROJECT_OPTIONS,
  PRIVATE_PLACEHOLDER,
  type ProjectOptions,
  type PersonProjection,
  type PersonChip,
} from '@/lib/tree/person-projection';
import { redactPrivateIndividuals } from '@/lib/tree/mapper';
import { applyPublicRedaction } from '@/lib/tree/public-serve';

// Famous name (اسم الشهرة) on the Person Page projection: the subject and every
// chip carry it, the «خاص» placeholder never does, and a private ancestor's
// famous name can never escape — on the member OR the public surface.

const PUBLIC_OPTS: ProjectOptions = {
  ...MEMBER_PROJECT_OPTIONS,
  maternalRecursionDepth: 1,
  continueThroughPrivateAncestor: false,
};

const SECRET_FAMOUS = 'شهرة_سرية';

function ind(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI', name: overrides.id, givenName: overrides.id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: true, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  };
}

const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM', husband: null, wife: null, children: [],
    marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false,
    ...overrides,
  };
}

//   PRIV_GF (private, has a famous name) — FATHER — S, SIB
function tree(): GedcomData {
  return {
    individuals: {
      S: ind({ id: 'S', famousName: 'شهرة_س', famousNameInNasab: true, familyAsChild: 'F_P' }),
      SIB: ind({ id: 'SIB', famousName: 'شهرة_الأخ', familyAsChild: 'F_P' }),
      FATHER: ind({
        id: 'FATHER', famousName: 'شهرة_الأب', famousNameInNasab: false,
        familyAsChild: 'F_GF', familiesAsSpouse: ['F_P'],
      }),
      PRIV_GF: ind({
        id: 'PRIV_GF', isPrivate: true, famousName: SECRET_FAMOUS, famousNameInNasab: true,
        familiesAsSpouse: ['F_GF'],
      }),
    },
    families: {
      F_P: fam({ id: 'F_P', husband: 'FATHER', children: ['S', 'SIB'] }),
      F_GF: fam({ id: 'F_GF', husband: 'PRIV_GF', children: ['FATHER'] }),
    },
  };
}

function project(data: GedcomData, opts: ProjectOptions = MEMBER_PROJECT_OPTIONS): PersonProjection {
  const p = projectPerson(data, 'S', opts);
  if (!p) throw new Error('projection is null');
  return p;
}

function placeholderOf(p: PersonProjection): PersonChip {
  const chip = p.paternalChain.find((c) => c.name === PRIVATE_PLACEHOLDER);
  if (!chip) throw new Error('no placeholder in paternal chain');
  return chip;
}

function allStrings(obj: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(obj);
  return out;
}

const publicSettings = {
  enableKunya: true, enableFamousName: true,
  hideBirthDateForFemale: false, hideBirthDateForMale: false,
};

describe('projectPerson — famous name on the subject', () => {
  test('subject carries its famous name', () => {
    expect(project(tree()).subject.famousName).toBe('شهرة_س');
  });

  test('subject carries its in-nasab choice', () => {
    expect(project(tree()).subject.famousNameInNasab).toBe(true);
  });

  test('subject without a famous name gets an empty string', () => {
    const data = tree();
    delete data.individuals.S.famousName;
    expect(project(data).subject.famousName).toBe('');
  });

  test('subject with no in-nasab choice has no flag key', () => {
    const data = tree();
    delete data.individuals.S.famousNameInNasab;
    expect('famousNameInNasab' in project(data).subject).toBe(false);
  });
});

describe('projectPerson — famous name on chips', () => {
  test('a spine chip carries the famous name', () => {
    const father = project(tree()).paternalChain.find((c) => c.id === 'FATHER');
    expect(father?.famousName).toBe('شهرة_الأب');
  });

  test('a spine chip carries the in-nasab choice', () => {
    const father = project(tree()).paternalChain.find((c) => c.id === 'FATHER');
    expect(father?.famousNameInNasab).toBe(false);
  });

  test('a relation chip carries the famous name', () => {
    const sib = project(tree()).siblings.find((c) => c.id === 'SIB');
    expect(sib?.famousName).toBe('شهرة_الأخ');
  });

  test('a chip with no in-nasab choice has no flag key', () => {
    const sib = project(tree()).siblings.find((c) => c.id === 'SIB');
    expect(sib && 'famousNameInNasab' in sib).toBe(false);
  });
});

describe('projectPerson — «خاص» placeholder and private famous names', () => {
  // Raw (un-redacted) input: the projection itself must not read a private
  // person's famous name even if an upstream redactor were skipped.
  test('placeholder has an empty famous name', () => {
    expect(placeholderOf(project(tree())).famousName).toBe('');
  });

  test('placeholder has no in-nasab flag', () => {
    expect('famousNameInNasab' in placeholderOf(project(tree()))).toBe(false);
  });

  test('placeholder has no id', () => {
    expect('id' in placeholderOf(project(tree()))).toBe(false);
  });

  test('member: private ancestor famous name never appears', () => {
    const p = project(redactPrivateIndividuals(tree()), MEMBER_PROJECT_OPTIONS);
    expect(allStrings(p)).not.toContain(SECRET_FAMOUS);
  });

  test('member: private famous name absent even without the redactor', () => {
    const p = project(tree(), MEMBER_PROJECT_OPTIONS);
    expect(allStrings(p)).not.toContain(SECRET_FAMOUS);
  });

  test('public: private ancestor famous name never appears', () => {
    const p = project(applyPublicRedaction(tree(), publicSettings), PUBLIC_OPTS);
    expect(allStrings(p)).not.toContain(SECRET_FAMOUS);
  });

  test('public: toggle off leaves no famous name anywhere', () => {
    const p = project(
      applyPublicRedaction(tree(), { ...publicSettings, enableFamousName: false }),
      PUBLIC_OPTS,
    );
    expect(allStrings(p).filter((s) => s.startsWith('شهرة_'))).toEqual([]);
  });
});
