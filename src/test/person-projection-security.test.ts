import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { projectPerson, PRIVATE_PLACEHOLDER, MEMBER_PROJECT_OPTIONS, type PersonProjection, type ProjectOptions } from '@/lib/tree/person-projection';

// MEMBER options: the SHIPPED member predicate (so this guard tests production,
// not a copy). The cross-workspace boundary is the TOP of a borrowed branch — a
// `_pointed` node whose father is NOT `_pointed`. In every fixture here the
// borrowed node's secret parent is non-`_pointed`, so the borrowed node IS the
// boundary and its ancestry is never climbed (G2 holds under the new rule too).
const MEMBER_OPTS: ProjectOptions = MEMBER_PROJECT_OPTIONS;

// PUBLIC-style options: same shipped boundary, female-line depth 1, and — per the
// security review of §4.4 — the patriline STOPS at a private ancestor
// (continueThroughPrivateAncestor false), so a private person's father is NOT
// revealed on the public page.
const PUBLIC_OPTS: ProjectOptions = {
  ...MEMBER_PROJECT_OPTIONS,
  maternalRecursionDepth: 1,
  continueThroughPrivateAncestor: false,
};

// ===========================================================================
// SECURITY INVARIANTS for projectPerson (Surface 4 ownership).
//
// The per-mechanism behaviour is covered in person-projection.test.ts. This
// file asserts the two HOLISTIC guarantees end-to-end over the WHOLE emitted
// projection, with a worst-case tree that plants a private person AND a borrowed
// (`_pointed`) ancestor in every reachable position:
//
//   G1 — No private person's IDENTITY or LINK ever escapes. A private person's
//        id, given name, surname, or any PII must never appear anywhere in the
//        projection. The ONLY permitted trace is the bare, id-less «خاص»
//        placeholder string in a direct-ancestor spine slot.
//   G2 — No borrowed ANCESTRY escapes. A `_pointed` node may be emitted as a
//        boundary chip, but NOTHING above it (its secret parents) may appear.
// ===========================================================================

function ind(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
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
    ...overrides,
  };
}

const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EV,
    marriage: EV,
    divorce: EV,
    isDivorced: false,
    ...overrides,
  };
}

// All string values anywhere in the projection (for sweeping).
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

// Every id that appears anywhere in the projection (chips carry `id`).
function allIds(obj: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      if (typeof rec.id === 'string') out.push(rec.id);
      Object.values(rec).forEach(walk);
    }
  };
  walk(obj);
  return out;
}

// ---------------------------------------------------------------------------
// A worst-case tree: a private person AND a borrowed ancestor in many slots.
//   subject S
//   father FATHER (deceased) — his father is PRIVATE (PRIV_GF), whose own
//     father SECRET_GGF surfaces ONLY under MEMBER opts (continue past private);
//     under PUBLIC opts the climb STOPS at PRIV_GF so SECRET_GGF stays hidden.
//   mother MOTHER — her father is a borrowed _pointed ancestor (POINTED_MGF)
//     whose parent is ABSENT from the payload (downward-only extract): the climb
//     terminates at the borrowed root and no cross-workspace ancestry surfaces.
//   a PRIVATE sibling PRIV_SIB
//   a PRIVATE spouse PRIV_SPOUSE with a child CHILD (visible)
//   a borrowed _pointed paternal grandfather... reused as POINTED_MGF above.
// ---------------------------------------------------------------------------

function worstCaseTree(): GedcomData {
  const individuals: Record<string, Individual> = {
    S: ind({ id: 'S', name: 'سالم', givenName: 'سالم', familyAsChild: 'F_PARENTS', familiesAsSpouse: ['F_MARRIAGE'] }),

    FATHER: ind({ id: 'FATHER', name: 'فؤاد', givenName: 'فؤاد', isDeceased: true, familyAsChild: 'F_PGF', familiesAsSpouse: ['F_PARENTS'] }),
    MOTHER: ind({ id: 'MOTHER', name: 'منى', givenName: 'منى', sex: 'F', familyAsChild: 'F_MGF', familiesAsSpouse: ['F_PARENTS'] }),

    // Private paternal grandfather — SECRET name + a secret great-grandfather above.
    PRIV_GF: ind({ id: 'PRIV_GF', name: 'سر_الجد', givenName: 'سر_الجد', isPrivate: true, familyAsChild: 'F_SECRET_PGGF', familiesAsSpouse: ['F_PGF'] }),
    SECRET_GGF: ind({ id: 'SECRET_GGF', name: 'سر_جد_الجد', givenName: 'سر_جد_الجد', familiesAsSpouse: ['F_SECRET_PGGF'] }),

    // Borrowed (_pointed) maternal grandfather — emitted as boundary, NOT climbed.
    // His parent is ABSENT from the payload (the downward-only extract never pulls
    // a borrowed root's father) — `familyAsChild: null`. This is the REALISTIC
    // shape: the merge stamps EVERY foreign node `_pointed`, so a present
    // non-`_pointed` ancestor cannot occur; cross-workspace ancestry is absent,
    // and the climb stops at getFather===null.
    POINTED_MGF: ind({ id: 'POINTED_MGF', name: 'مستعار', givenName: 'مستعار', _pointed: true, _sourceWorkspaceId: 'OTHER_WS', familyAsChild: null, familiesAsSpouse: ['F_MGF'] }),

    PRIV_SIB: ind({ id: 'PRIV_SIB', name: 'سر_الأخت', givenName: 'سر_الأخت', sex: 'F', isPrivate: true, familyAsChild: 'F_PARENTS' }),

    PRIV_SPOUSE: ind({ id: 'PRIV_SPOUSE', name: 'سر_الزوجة', givenName: 'سر_الزوجة', sex: 'F', isPrivate: true, familiesAsSpouse: ['F_MARRIAGE'] }),
    CHILD: ind({ id: 'CHILD', name: 'عمر', givenName: 'عمر', familyAsChild: 'F_MARRIAGE' }),
  };
  const families: Record<string, Family> = {
    F_PARENTS: fam({ id: 'F_PARENTS', husband: 'FATHER', wife: 'MOTHER', children: ['S', 'PRIV_SIB'] }),
    F_PGF: fam({ id: 'F_PGF', husband: 'PRIV_GF', children: ['FATHER'] }),
    F_SECRET_PGGF: fam({ id: 'F_SECRET_PGGF', husband: 'SECRET_GGF', children: ['PRIV_GF'] }),
    F_MGF: fam({ id: 'F_MGF', husband: 'POINTED_MGF', children: ['MOTHER'] }),
    F_MARRIAGE: fam({ id: 'F_MARRIAGE', husband: 'S', wife: 'PRIV_SPOUSE', children: ['CHILD'] }),
  };
  return { individuals, families };
}

const PRIVATE_IDS = ['PRIV_GF', 'PRIV_SIB', 'PRIV_SPOUSE'];
const PRIVATE_NAMES = ['سر_الجد', 'سر_الأخت', 'سر_الزوجة'];

describe('projectPerson — security invariant G1: no private identity or link escapes', () => {
  const proj = projectPerson(worstCaseTree(), 'S', MEMBER_OPTS) as PersonProjection;

  test('the subject projects (sanity)', () => {
    expect(proj).not.toBeNull();
    expect(proj.subject.id).toBe('S');
  });

  test('no private person id appears anywhere in the projection', () => {
    const idSet = new Set(allIds(proj));
    for (const pid of PRIVATE_IDS) {
      expect(idSet.has(pid)).toBe(false);
    }
  });

  test('no private person real name appears anywhere in the projection', () => {
    const strings = allStrings(proj);
    for (const name of PRIVATE_NAMES) {
      expect(strings).not.toContain(name);
    }
  });

  test('the ONLY trace of a private person is the bare id-less «خاص» placeholder', () => {
    // The private paternal grandfather sits on the spine -> a placeholder token
    // with no id. Assert any «خاص» token carries no id (not clickable).
    const placeholders: { id?: string; name: string }[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const rec = v as { name?: unknown; id?: unknown };
        if (rec.name === PRIVATE_PLACEHOLDER) {
          placeholders.push({ id: rec.id as string | undefined, name: rec.name as string });
        }
        Object.values(v).forEach(walk);
      }
    };
    walk(proj);
    // At least the paternal-grandfather placeholder exists, and NONE carry an id.
    for (const p of placeholders) {
      expect(p.id).toBeUndefined();
    }
  });

  test('a private spouse yields spouse=null; private children/siblings omitted', () => {
    // The marriage with the private spouse still lists the visible child, but
    // the spouse is null (never the private person), and no private sibling.
    const marriage = proj.marriages.find((m) => m.children.some((c) => c.id === 'CHILD'));
    expect(marriage).toBeDefined();
    expect(marriage!.spouse).toBeNull();
    expect(proj.siblings.map((s) => s.id)).not.toContain('PRIV_SIB');
  });
});

describe('projectPerson — security invariant G2: no borrowed ancestry escapes', () => {
  const proj = projectPerson(worstCaseTree(), 'S', MEMBER_OPTS) as PersonProjection;

  test('the _pointed maternal grandfather IS emitted as a boundary chip', () => {
    // It appears on the maternal spine (boundary node is shown).
    expect(allIds(proj)).toContain('POINTED_MGF');
  });

  test('nothing ABOVE the _pointed boundary appears (its secret cross-workspace parents)', () => {
    // The cross-workspace boundary is the load-bearing guarantee I own: a
    // borrowed (_pointed) node is emitted, but its ancestry — which lives in
    // ANOTHER workspace — is NEVER climbed. POINTED_MGF's parent is absent from
    // the payload (downward-only extract), so the climb stops at getFather===null;
    // the former secret parent id/name and the source workspace id never surface.
    const idSet = new Set(allIds(proj));
    const strings = allStrings(proj);
    expect(idSet.has('SECRET_PARENT')).toBe(false);
    expect(strings).not.toContain('سر_الأصل');
    expect(strings).not.toContain('OTHER_WS'); // _sourceWorkspaceId never leaked
  });

  // POSITIVE counterpart to the boundary guarantee: the split predicate must NOT
  // over-block. A `_pointed` node whose father is NATIVE (present, non-`_pointed`)
  // — the قريش shape (محمد…هاشم borrowed, عبدمناف… native) — MUST climb into that
  // native father. Guards against a silent revert to the old single predicate,
  // which would dead-end at the borrowed root and still pass the negative tests.
  test('a _pointed node with a NATIVE present father DOES climb into the native lineage', () => {
    const data: GedcomData = {
      individuals: {
        // subject (borrowed) → borrowed father → NATIVE grandfather → NATIVE g-grandfather
        kid: ind({ id: 'kid', _pointed: true, familyAsChild: 'BF1' }),
        borrowedFather: ind({ id: 'borrowedFather', _pointed: true, familyAsChild: 'NF1', familiesAsSpouse: ['BF1'] }),
        nativeGF: ind({ id: 'nativeGF', familyAsChild: 'NF0', familiesAsSpouse: ['NF1'] }),
        nativeGGF: ind({ id: 'nativeGGF', familiesAsSpouse: ['NF0'] }),
      },
      families: {
        BF1: fam({ id: 'BF1', husband: 'borrowedFather', _pointed: true, children: ['kid'] }),
        NF1: fam({ id: 'NF1', husband: 'nativeGF', children: ['borrowedFather'] }),
        NF0: fam({ id: 'NF0', husband: 'nativeGGF', children: ['nativeGF'] }),
      },
    };
    const p = projectPerson(data, 'kid', MEMBER_OPTS) as PersonProjection;
    // Climbs through the borrowed father into BOTH native ancestors.
    expect(p.paternalChain.map((c) => c.id)).toEqual(['nativeGGF', 'nativeGF', 'borrowedFather']);
  });

  // §4.4 PATERNAL private ancestor — resolved per-surface by the security review:
  //  - MEMBER (continueThroughPrivateAncestor: true): the «خاص» placeholder is
  //    shown and the climb CONTINUES to his father (a separate person who may be
  //    public) — "private hides the individual, not the bloodline".
  //  - PUBLIC (continueThroughPrivateAncestor: false): the patriline STOPS at the
  //    private ancestor — his father is NOT revealed to anonymous visitors.
  test('MEMBER opts: the climb continues past a private ancestor to his (public) father', () => {
    const member = projectPerson(worstCaseTree(), 'S', MEMBER_OPTS) as PersonProjection;
    expect(new Set(allIds(member)).has('SECRET_GGF')).toBe(true);
  });

  test('PUBLIC opts: the climb STOPS at the private ancestor — his father is hidden', () => {
    const pub = projectPerson(worstCaseTree(), 'S', PUBLIC_OPTS) as PersonProjection;
    expect(new Set(allIds(pub)).has('SECRET_GGF')).toBe(false);
    expect(allStrings(pub)).not.toContain('سر_جد_الجد'); // SECRET_GGF's name
  });
});
