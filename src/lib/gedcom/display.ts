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
 * Uses givenName for each person in the chain, with surname appended once at the end.
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

  if (depth === 1) {
    return getDisplayName(person);
  }

  const nameParts: string[] = [];
  const visited = new Set<string>();
  visited.add(person.id);

  // Start with the person's given name (not full name)
  nameParts.push(person.givenName || person.name || 'Unknown');

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
      nameParts.push(father.givenName || father.name || 'Unknown');

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

    // «… بن عدنان، من وَلَد إسماعيل». The comma binds to the PRECEDING token,
    // so it is appended rather than pushed (join(' ') would give «عدنان ، من»).
    nameParts[nameParts.length - 1] += '،';
    nameParts.push(JUMP_CONNECTOR);
    nameParts.push(jumpFather.givenName || jumpFather.name || 'Unknown');

    crossedJump = true;
    currentPerson = jumpFather;
    generationsAdded += JUMP_GENERATION_COST;
  }

  // Append surname once at the end (from the last person in the chain, frozen
  // at the jump — see above)
  const surname = surnameSource.surname || person.surname;
  if (surname) {
    nameParts.push(surname);
  }

  return nameParts.join(' ');
}
