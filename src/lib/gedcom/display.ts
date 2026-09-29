import type { GedcomData, Individual } from './types';

export const DEFAULT_NASAB_DEPTH = 2;

export function getDisplayName(person: Individual | null | undefined): string {
  if (!person) return 'Unknown';

  const nameParts = person.name.split(' ').filter((p) => p);
  if (nameParts.length > 1) {
    return person.name;
  }

  if (person.givenName && person.surname) {
    return `${person.givenName} ${person.surname}`;
  }
  if (person.givenName) {
    return person.givenName;
  }
  if (person.name) {
    return person.name;
  }
  if (person.surname) {
    return person.surname;
  }

  return 'Unknown';
}

/** Arabic tashkeel (harakat, tanwin, shadda, sukun, dagger alif). */
const TASHKEEL = /[\u064B-\u065F\u0670]/g;

/**
 * Whether a famous name should, by default, replace the real name in names and
 * nasab chains. False when it is itself a patronymic («ابن الزبير», «بنت
 * الشاطئ»): «خبيب بن ابن الزبير» is wrong, so the real name stays in the chain.
 */
export function defaultFamousNameInNasab(famousName: string): boolean {
  const words = famousName
    .replace(TASHKEEL, '')
    .replace(/[إأ]/g, 'ا')
    .split(/\s+/);
  return !words.some((w) => w === 'ابن' || w === 'بنت' || w === 'ابنة');
}

/**
 * The trimmed famous name, or null when it is absent: empty, or equal to the
 * real name (trimmed givenName || name). THE "does this person have a famous
 * name" rule — callers never re-check `famousName` themselves.
 */
export function effectiveFamousName(person: Individual): string | null {
  const famous = person.famousName?.trim();
  if (!famous) return null;
  if (famous === (person.givenName || person.name).trim()) return null;
  return famous;
}

/** The effective famous name when it leads instead of the real name, else null. */
function leadingFamousName(person: Individual): string | null {
  const famous = effectiveFamousName(person);
  if (!famous) return null;
  return (person.famousNameInNasab ?? defaultFamousNameInNasab(famous)) ? famous : null;
}

/** True when the person's famous name leads instead of the real name. */
export function isFamousNameLead(person: Individual): boolean {
  return leadingFamousName(person) !== null;
}

/** The name that leads a person's name line: famous name or real given name. */
export function getLeadName(person: Individual): string {
  return leadingFamousName(person) ?? (person.givenName || person.name || 'Unknown');
}

/**
 * A name in genitive position after بن/بنت/من وَلَد: a leading أبو → أبي and
 * ذو → ذي («بن أبي طالب»), only when another word follows. Everything else —
 * أبا, أبي, أم, a lone أبو — stays as typed.
 */
export function toNasabGenitive(name: string): string {
  const match = name.match(/^(\S+)(\s+\S[\s\S]*)$/);
  if (!match) return name;
  const first = match[1].replace(TASHKEEL, '').replace(/^ا/, 'أ');
  if (first === 'أبو') return 'أبي' + match[2];
  if (first === 'ذو') return 'ذي' + match[2];
  return name;
}

/**
 * The bare name that does NOT lead: the real name when the famous name leads,
 * the famous name when the real name leads, or null when there is no famous
 * name.
 */
export function getOtherName(person: Individual): string | null {
  const famous = effectiveFamousName(person);
  if (!famous) return null;
  return leadingFamousName(person) ? person.givenName || person.name : famous;
}

/**
 * The secondary line under the lead name: the real name when the famous name
 * leads («واسمه عبدمناف»), the famous name when the real name leads («ويُعرف
 * بأبي طالب»), or null when there is no famous name.
 */
export function getAlternateNameLine(person: Individual): string | null {
  const other = getOtherName(person);
  if (other === null) return null;
  const female = person.sex === 'F';
  if (isFamousNameLead(person)) {
    return `${female ? 'واسمها' : 'واسمه'} ${other}`;
  }
  return `${female ? 'وتُعرف ب' : 'ويُعرف ب'}${toNasabGenitive(other)}`;
}

/**
 * The one-line name a person leads with: the famous name + surname when the
 * famous name leads, otherwise the real display name (getDisplayName).
 */
export function getLeadDisplayName(person: Individual | null | undefined): string {
  const famous = person ? leadingFamousName(person) : null;
  if (famous) return [famous, person!.surname].filter(Boolean).join(' ');
  return getDisplayName(person);
}

/** The kunya is hidden when it is the famous name itself («أبو طالب»). */
export function shouldShowKunya(person: Individual): boolean {
  const kunya = person.kunya?.trim();
  if (!kunya) return false;
  return kunya !== effectiveFamousName(person);
}

/** An ancestor's token in a nasab chain (genitive when the famous name leads). */
export function getNasabToken(person: Individual): string {
  const famous = leadingFamousName(person);
  return famous ? toNasabGenitive(famous) : getLeadName(person);
}

/** The classical partitive that marks a «قفزة نسب» in a name chain. */
export const JUMP_CONNECTOR = 'من وَلَد';

/**
 * How many generation slots crossing a «قفزة نسب» consumes. TWO: the gap spans
 * at least one unrecorded generation PLUS the distant ancestor himself. The
 * practical consequence is the point — at `DEFAULT_NASAB_DEPTH = 2` the chain
 * stops before the jump, so cards, the sidebar and the pickers read «عدنان»
 * and only the Person Page ribbon and `depth: 0` callers spell out
 * «عدنان، من وَلَد إسماعيل».
 */
const JUMP_GENERATION_COST = 2;

function getFather(
  data: GedcomData,
  person: Individual
): Individual | null {
  if (!person.familyAsChild) return null;
  const family = data.families[person.familyAsChild];
  if (!family?.husband) return null;
  return data.individuals[family.husband] || null;
}

/**
 * The MALE distant ancestor of a person's «قفزة نسب», or null.
 *
 * Returns null when the person has no jump, when the jump's family has no
 * husband (a FEMALE-only ancestor is NOT in the نسب chain — owner ruling; the
 * chain simply stops), or when the reference dangles.
 */
function getJumpFather(data: GedcomData, person: Individual): Individual | null {
  const jumpId = person.ancestryJumpAsDescendant;
  if (!jumpId) return null;
  const jump = data.ancestryJumps?.[jumpId];
  if (!jump) return null;
  const family = data.families[jump.ancestorFamily];
  if (!family?.husband) return null;
  return data.individuals[family.husband] ?? null;
}

/**
 * Returns a display name with Arabic nasab (patronymic chain).
 * Uses givenName for each person in the chain, with surname appended once at the end —
 * or, when the chain crosses a «قفزة نسب», placed once right before «، من وَلَد».
 *
 * @param data - The GEDCOM data containing individuals and families
 * @param person - The individual to get the name for
 * @param depth - Number of generations to include:
 *   - 1: name only (no ancestors)
 *   - 2: name + father (default)
 *   - 3: name + father + grandfather
 *   - 0: infinite (full ancestor chain)
 * @returns Formatted name with nasab, e.g., "أحمد بن محمد سعيد"
 */
export function getDisplayNameWithNasab(
  data: GedcomData,
  person: Individual | null | undefined,
  depth: number = DEFAULT_NASAB_DEPTH
): string {
  if (!person) return 'Unknown';

  if (depth === 1) return getLeadDisplayName(person);

  const nameParts: string[] = [];
  const visited = new Set<string>();
  visited.add(person.id);

  // Start with the person's lead name (not full name), always nominative
  nameParts.push(getLeadName(person));

  let currentPerson: Individual | null = person;
  let surnameSource: Individual = person;
  let crossedJump = false;
  let generationsAdded = 1;
  const maxGenerations = depth === 0 ? Infinity : depth;

  while (generationsAdded < maxGenerations) {
    const father = getFather(data, currentPerson);

    if (father) {
      if (visited.has(father.id)) break;
      visited.add(father.id);

      const connector = currentPerson.sex === 'F' ? 'بنت' : 'بن';

      nameParts.push(connector);
      nameParts.push(getNasabToken(father));

      // The surname is taken from the LAST person in the chain. Once we have
      // crossed a «قفزة نسب» the ancestor's house is NOT this family's house —
      // عدنان's line must never be stamped with إسماعيل's surname — so the
      // surname source freezes at the jump.
      if (!crossedJump) surnameSource = father;
      currentPerson = father;
      generationsAdded++;
      continue;
    }

    // No recorded father: a «قفزة نسب» may still carry the chain upward, but
    // only when the requested depth has room for the whole gap.
    if (generationsAdded + JUMP_GENERATION_COST > maxGenerations) break;

    const jumpFather = getJumpFather(data, currentPerson);
    if (!jumpFather) break;
    if (visited.has(jumpFather.id)) break;
    visited.add(jumpFather.id);

    // «… بن عدنان العدنانية، من وَلَد إسماعيل». The family name is placed HERE,
    // right before the connector, and never at the end: a name ending on the
    // ancestor would read as HIS house. The comma binds to the PRECEDING token,
    // so it is appended rather than pushed (join(' ') would give «عدنان ، من»).
    if (!crossedJump) {
      const surname = surnameSource.surname || person.surname;
      if (surname) nameParts.push(surname);
    }
    nameParts[nameParts.length - 1] += '،';
    nameParts.push(JUMP_CONNECTOR);
    nameParts.push(getNasabToken(jumpFather));

    crossedJump = true;
    currentPerson = jumpFather;
    generationsAdded += JUMP_GENERATION_COST;
  }

  // Append surname once at the end (from the last person in the chain). A chain
  // that crossed a jump already placed it before «، من وَلَد» — see above.
  if (!crossedJump) {
    const surname = surnameSource.surname || person.surname;
    if (surname) {
      nameParts.push(surname);
    }
  }

  return nameParts.join(' ');
}

/**
 * The text a people-search list matches a person against: the row's main text
 * (default: the name with nasab), then the famous name, the real given name and
 * the kunya — each only when not already present, so a person is found by any
 * name they go by. `mainText` lets a list keep its own row text (e.g. with a
 * birth year or a different nasab depth).
 */
export function getPersonSearchText(
  data: GedcomData,
  person: Individual,
  mainText: string = getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH),
): string {
  return withOtherNames(mainText, person);
}

/** `mainText` plus the person's other names — `getPersonSearchText` with no tree. */
export function withOtherNames(mainText: string, person: Individual): string {
  let text = mainText;
  for (const part of [effectiveFamousName(person), person.givenName || person.name, person.kunya]) {
    const value = part?.trim();
    if (value && !text.includes(value)) text += ` ${value}`;
  }
  return text;
}
