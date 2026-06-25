import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { projectPerson, MEMBER_PROJECT_OPTIONS } from '@/lib/tree/person-projection';

// ===========================================================================
// REGRESSION (quraish nasab truncation) — member boundary fires at the WRONG node.
//
// SYMPTOM: on the member Person Page, محمد ﷺ in the "quraish" workspace shows a
// truncated nasab — it dead-ends at هاشم — even though the merged payload DOES
// contain the full patriline above هاشم (عبدمناف → قصي → … → عدنان, all native).
//
// REAL CAUSE (verified against the quraish DB, NOT a numeric depth cap):
// محمد + his fathers up to هاشم are a BORROWED branch (`_pointed: true`) grafted
// onto NATIVE ancient نسب. The member boundary predicate is
//     isBoundary: ind._pointed === true && !fatherIsPointed(data, ind)
//                                                     (person-projection.ts:80)
// هاشم is `_pointed` but his father عبدمناف is NOT (`_pointed` undefined →
// native), so `fatherIsPointed` is false and the boundary WRONGLY fires AT هاشم.
// `buildPaternalSpine` then emits هاشم and breaks (line 329), dropping the entire
// native upper lineage عبدمناف → قصي. The boundary is meant to stop at the top of
// a branch borrowed FROM another workspace (whose parent is unshared/foreign) —
// NOT at the seam where a borrowed branch sits ON TOP of native shared ancestry.
// ===========================================================================

function ind(o: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: o.id,
    givenName: o.id,
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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...o,
  };
}

const E = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(o: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: E,
    marriage: E,
    divorce: E,
    isDivorced: false,
    ...o,
  };
}

const ids = (chips: { id?: string }[]) => chips.map((c) => c.id);

describe('member Person Page — borrowed-on-native nasab (quraish regression)', () => {
  test('climbs through a _pointed branch into the NATIVE ancestors above the borrowed root', () => {
    // Patriline, oldest → subject:
    //   qusai (native) → abdManaf (native) → hashim (POINTED root)
    //     → abdMutallib (pointed) → abdullah (pointed) → muhammad (pointed)
    //
    // The whole chain is one merged GedcomData (this is what the member route
    // hands projectPerson). The seam is at hashim: `_pointed`, native father.
    const inds: Individual[] = [
      ind({ id: 'qusai', givenName: 'قصي', familiesAsSpouse: ['SF0'] }),
      ind({ id: 'abdManaf', givenName: 'عبدمناف', familyAsChild: 'SF0', familiesAsSpouse: ['SF1'] }),
      ind({ id: 'hashim', givenName: 'هاشم', _pointed: true, familyAsChild: 'SF1', familiesAsSpouse: ['SF2'] }),
      ind({ id: 'abdMutallib', givenName: 'عبدالمطلب', _pointed: true, familyAsChild: 'SF2', familiesAsSpouse: ['SF3'] }),
      ind({ id: 'abdullah', givenName: 'عبدالله', _pointed: true, familyAsChild: 'SF3', familiesAsSpouse: ['SF4'] }),
      ind({ id: 'muhammad', givenName: 'محمد', _pointed: true, familyAsChild: 'SF4' }),
    ];
    const fams: Family[] = [
      fam({ id: 'SF0', husband: 'qusai', children: ['abdManaf'] }),
      fam({ id: 'SF1', husband: 'abdManaf', children: ['hashim'] }),
      fam({ id: 'SF2', husband: 'hashim', _pointed: true, children: ['abdMutallib'] }),
      fam({ id: 'SF3', husband: 'abdMutallib', _pointed: true, children: ['abdullah'] }),
      fam({ id: 'SF4', husband: 'abdullah', _pointed: true, children: ['muhammad'] }),
    ];
    const data: GedcomData = {
      individuals: Object.fromEntries(inds.map((i) => [i.id, i])),
      families: Object.fromEntries(fams.map((f) => [f.id, f])),
    };

    const proj = projectPerson(data, 'muhammad', MEMBER_PROJECT_OPTIONS)!;

    // EXPECTED nasab (oldest → father): the full chain, native upper lineage
    // included. Currently the boundary fires at هاشم and truncates to
    // ['hashim', 'abdMutallib', 'abdullah'].
    expect(ids(proj.paternalChain)).toEqual([
      'qusai',
      'abdManaf',
      'hashim',
      'abdMutallib',
      'abdullah',
    ]);
  });
});
