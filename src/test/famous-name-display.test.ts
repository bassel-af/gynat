/**
 * Famous-name («الاسم الذي اشتهر به») display helpers.
 *
 * Fixture chain (father ← son):
 *   عبدمناف (no famous) ← عمرو (هاشم) ← شيبة (عبدالمطلب) ← عبدمناف (أبو طالب) ← علي
 */
import { describe, test, expect } from 'vitest';
import {
  getDisplayNameWithNasab,
  getDisplayName,
  getLeadName,
  isFamousNameLead,
  defaultFamousNameInNasab,
  toNasabGenitive,
  getAlternateNameLine,
  shouldShowKunya,
} from '@/lib/gedcom/display';
import type { Family, GedcomData, Individual } from '@/lib/gedcom/types';

function person(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id,
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

function family(id: string, husband: string | null, children: string[]): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    id,
    type: 'FAM',
    husband,
    wife: null,
    children,
    marriageContract: { ...empty },
    marriage: { ...empty },
    divorce: { ...empty },
    isDivorced: false,
  } as Family;
}

/** Builds the Quraysh chain; `over` patches individuals by id. */
function chain(over: Record<string, Partial<Individual>> = {}): GedcomData {
  const base: Record<string, Individual> = {
    abdmanaf1: person('abdmanaf1', { name: 'عبدمناف', givenName: 'عبدمناف', familiesAsSpouse: ['F1'] }),
    amr: person('amr', { name: 'عمرو', givenName: 'عمرو', famousName: 'هاشم', sex: null, familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
    shayba: person('shayba', { name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', familyAsChild: 'F2', familiesAsSpouse: ['F3'] }),
    abutalib: person('abutalib', { name: 'عبدمناف', givenName: 'عبدمناف', famousName: 'أبو طالب', kunya: 'أبو طالب', familyAsChild: 'F3', familiesAsSpouse: ['F4'] }),
    ali: person('ali', { name: 'علي', givenName: 'علي', familyAsChild: 'F4' }),
  };
  const individuals: Record<string, Individual> = {};
  for (const [id, p] of Object.entries(base)) individuals[id] = { ...p, ...(over[id] ?? {}) };
  return {
    individuals,
    families: {
      F1: family('F1', 'abdmanaf1', ['amr']),
      F2: family('F2', 'amr', ['shayba']),
      F3: family('F3', 'shayba', ['abutalib']),
      F4: family('F4', 'abutalib', ['ali']),
    },
  };
}

describe('getDisplayNameWithNasab with famous names', () => {
  test('1. علي at default depth uses his father\'s famous name in the genitive', () => {
    const d = chain();
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبي طالب');
  });

  test('2. علي at depth 0 walks the famous names up the chain', () => {
    const d = chain();
    expect(getDisplayNameWithNasab(d, d.individuals.ali, 0)).toBe(
      'علي بن أبي طالب بن عبدالمطلب بن هاشم بن عبدمناف'
    );
  });

  test('3. a famous subject leads in the nominative', () => {
    const d = chain();
    expect(getDisplayNameWithNasab(d, d.individuals.abutalib)).toBe('أبو طالب بن عبدالمطلب');
  });

  test('4. عبدالمطلب at depth 0', () => {
    const d = chain();
    expect(getDisplayNameWithNasab(d, d.individuals.shayba, 0)).toBe('عبدالمطلب بن هاشم بن عبدمناف');
  });

  test('5. famousNameInNasab false puts the real name in the chain', () => {
    const d = chain({ abutalib: { famousNameInNasab: false } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن عبدمناف');
  });

  test('6. with every famous name removed the chain is the real names', () => {
    const d = chain({
      amr: { famousName: undefined },
      shayba: { famousName: undefined },
      abutalib: { famousName: undefined },
    });
    expect(getDisplayNameWithNasab(d, d.individuals.ali, 0)).toBe(
      'علي بن عبدمناف بن شيبة بن عمرو بن عبدمناف'
    );
  });

  test('7. bare-alif «ابو» is recognised and written canonically', () => {
    const d = chain({ abutalib: { famousName: 'ابو طالب' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبي طالب');
  });

  test('8. tashkeel on «أَبُو» is ignored for matching', () => {
    const d = chain({ abutalib: { famousName: 'أَبُو طالب' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبي طالب');
  });

  test('9a. «أبا طالب» stays as typed', () => {
    const d = chain({ abutalib: { famousName: 'أبا طالب' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبا طالب');
  });

  test('9b. a lone «أبو» stays as typed', () => {
    const d = chain({ abutalib: { famousName: 'أبو' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبو');
  });

  test('10. a surname starting with «أبو» is not converted', () => {
    const d = chain({ abutalib: { surname: 'أبو سعيد' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe('علي بن أبي طالب أبو سعيد');
  });

  test('11. the jump father token uses the famous name in the genitive', () => {
    const d = chain({ ali: { familyAsChild: null, ancestryJumpAsDescendant: 'J1' } });
    d.ancestryJumps = {
      J1: {
        id: 'J1',
        type: '_ANC_JUMP',
        descendant: 'ali',
        ancestorFamily: 'F4',
        generationsMin: null,
        generationsMax: null,
        notes: '',
      },
    };
    expect(getDisplayNameWithNasab(d, d.individuals.ali, 0)).toBe(
      'علي، من وَلَد أبي طالب بن عبدالمطلب بن هاشم بن عبدمناف'
    );
  });
});

describe('getAlternateNameLine', () => {
  test('12a. famous-led male shows his real name', () => {
    const d = chain();
    expect(getAlternateNameLine(d.individuals.abutalib)).toBe('واسمه عبدمناف');
  });

  test('12b. unknown sex uses the masculine form', () => {
    const d = chain();
    expect(getAlternateNameLine(d.individuals.amr)).toBe('واسمه عمرو');
  });

  test('12c. female famous-led uses «واسمها»', () => {
    const d = chain({ shayba: { sex: 'F' } });
    expect(getAlternateNameLine(d.individuals.shayba)).toBe('واسمها شيبة');
  });

  test('12d. no famous name gives null', () => {
    const d = chain();
    expect(getAlternateNameLine(d.individuals.ali)).toBeNull();
  });

  test('13a. real-led shows the famous name in the genitive', () => {
    const d = chain({ abutalib: { famousNameInNasab: false } });
    expect(getAlternateNameLine(d.individuals.abutalib)).toBe('ويُعرف بأبي طالب');
  });

  test('13b. real-led with a plain famous name', () => {
    const d = chain({ shayba: { famousNameInNasab: false } });
    expect(getAlternateNameLine(d.individuals.shayba)).toBe('ويُعرف بعبدالمطلب');
  });

  test('13c. real-led female uses «وتُعرف»', () => {
    const p = person('x', { name: 'عائشة', givenName: 'عائشة', sex: 'F', famousName: 'بنت الشاطئ' });
    expect(getAlternateNameLine(p)).toBe('وتُعرف ببنت الشاطئ');
  });
});

describe('defaultFamousNameInNasab', () => {
  test('14a. «ابن الزبير» is excluded', () => {
    expect(defaultFamousNameInNasab('ابن الزبير')).toBe(false);
  });
  test('14b. «بنت الشاطئ» is excluded', () => {
    expect(defaultFamousNameInNasab('بنت الشاطئ')).toBe(false);
  });
  test('14c. «ابنة X» is excluded', () => {
    expect(defaultFamousNameInNasab('ابنة X')).toBe(false);
  });
  test('14d. «ابنالزبير» (not a whole word) is included', () => {
    expect(defaultFamousNameInNasab('ابنالزبير')).toBe(true);
  });
  test('14e. «أبو طالب» is included', () => {
    expect(defaultFamousNameInNasab('أبو طالب')).toBe(true);
  });
  test('14f. hamza-under «إبن» is normalised and excluded', () => {
    expect(defaultFamousNameInNasab('إبن الزبير')).toBe(false);
  });
});

describe('«ابن الزبير» default', () => {
  function zubayr(inNasab?: boolean): GedcomData {
    return {
      individuals: {
        abdallah: person('abdallah', {
          name: 'عبدالله',
          givenName: 'عبدالله',
          famousName: 'ابن الزبير',
          famousNameInNasab: inNasab,
          familiesAsSpouse: ['FZ'],
        }),
        khubayb: person('khubayb', { name: 'خبيب', givenName: 'خبيب', familyAsChild: 'FZ' }),
      },
      families: { FZ: family('FZ', 'abdallah', ['khubayb']) },
    };
  }

  test('15a. default keeps the real name in the son\'s nasab', () => {
    const d = zubayr();
    expect(getDisplayNameWithNasab(d, d.individuals.khubayb)).toBe('خبيب بن عبدالله');
  });
  test('15b. alt line shows the famous name', () => {
    const d = zubayr();
    expect(getAlternateNameLine(d.individuals.abdallah)).toBe('ويُعرف بابن الزبير');
  });
  test('15c. explicit true overrides the default', () => {
    const d = zubayr(true);
    expect(getDisplayNameWithNasab(d, d.individuals.khubayb)).toBe('خبيب بن ابن الزبير');
  });
});

describe('shouldShowKunya', () => {
  test('16a. kunya equal to the famous name is hidden', () => {
    const d = chain();
    expect(shouldShowKunya(d.individuals.abutalib)).toBe(false);
  });
  test('16b. kunya shown when famous name is empty', () => {
    const d = chain({ abutalib: { famousName: '' } });
    expect(shouldShowKunya(d.individuals.abutalib)).toBe(true);
  });
});

describe('toNasabGenitive', () => {
  test('ذو becomes ذي when a word follows', () => {
    expect(toNasabGenitive('ذو النورين')).toBe('ذي النورين');
  });
  test('a lone ذو stays', () => {
    expect(toNasabGenitive('ذو')).toBe('ذو');
  });
  test('أم and أبي stay as typed', () => {
    expect(toNasabGenitive('أم كلثوم')).toBe('أم كلثوم');
    expect(toNasabGenitive('أبي بكر')).toBe('أبي بكر');
  });
});

describe('17. no famousName key behaves exactly as before', () => {
  const d: GedcomData = {
    individuals: {
      f: person('f', { name: 'محمد سعيد', givenName: 'محمد', surname: 'سعيد', familiesAsSpouse: ['FA'] }),
      s: person('s', { name: 'أحمد سعيد', givenName: 'أحمد', surname: 'سعيد', familyAsChild: 'FA' }),
    },
    families: { FA: family('FA', 'f', ['s']) },
  };

  test('nasab, depth 1, lead name and alt line are unchanged', () => {
    const s = d.individuals.s;
    expect('famousName' in s).toBe(false);
    expect(getDisplayNameWithNasab(d, s)).toBe('أحمد بن محمد سعيد');
    expect(getDisplayNameWithNasab(d, s, 1)).toBe(getDisplayName(s));
    expect(getLeadName(s)).toBe('أحمد');
    expect(isFamousNameLead(s)).toBe(false);
    expect(getAlternateNameLine(s)).toBeNull();
  });

  test('lead name keeps today\'s untrimmed fallback', () => {
    expect(getLeadName(person('u', { givenName: ' أحمد ' }))).toBe(' أحمد ');
    expect(getLeadName(person('u'))).toBe('Unknown');
  });
});

describe('depth 1 with a famous lead', () => {
  test('returns famous name plus surname', () => {
    const d = chain({ abutalib: { surname: 'الهاشمي' } });
    expect(getDisplayNameWithNasab(d, d.individuals.abutalib, 1)).toBe('أبو طالب الهاشمي');
  });
});

describe('famous name equal to the real name counts as absent', () => {
  test.each(['علي', '  علي '])('alt line is null for famousName %j', (famousName) => {
    const d = chain({ ali: { famousName } });
    expect(getAlternateNameLine(d.individuals.ali)).toBeNull();
  });

  test('nasab is unchanged', () => {
    const d = chain({ ali: { famousName: '  علي ' } });
    expect(getDisplayNameWithNasab(d, d.individuals.ali)).toBe(
      getDisplayNameWithNasab(chain(), chain().individuals.ali),
    );
  });

  test('kunya equal to such a famous name is still shown', () => {
    const d = chain({ ali: { givenName: 'أبو الحسن', name: 'أبو الحسن', famousName: ' أبو الحسن ', kunya: 'أبو الحسن' } });
    expect(shouldShowKunya(d.individuals.ali)).toBe(true);
  });
});
