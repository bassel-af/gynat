/**
 * Sources («المصادر») — the relation word on a people-picker row: what `to`
 * is to `from` («الأب», «ابنة العم», …), or null when the relation is not in
 * the short list below (or unknown). Pure; walks `GedcomData` only.
 *
 * Siblings share at least one parent (half-siblings included). Where the word
 * depends on the relative's sex and it is unknown, the answer is null — never
 * a guess.
 */
import type { GedcomData } from '@/lib/gedcom/types';

export type RelationLabel =
  | 'الأب' | 'الأم' | 'الزوج' | 'الزوجة' | 'ابن' | 'ابنة' | 'الأخ' | 'الأخت'
  | 'الجد' | 'الجدة' | 'حفيد' | 'حفيدة' | 'العم' | 'العمة' | 'الخال' | 'الخالة'
  | 'ابن العم' | 'ابنة العم' | 'ابن الأخ' | 'ابنة الأخ';

type Sex = 'M' | 'F' | null;

export function parentsOf(data: GedcomData, id: string): { father: string | null; mother: string | null } {
  const famId = data.individuals[id]?.familyAsChild;
  const fam = famId ? data.families[famId] : undefined;
  return { father: fam?.husband ?? null, mother: fam?.wife ?? null };
}

export function childrenOf(data: GedcomData, id: string): Set<string> {
  const out = new Set<string>();
  for (const famId of data.individuals[id]?.familiesAsSpouse ?? []) {
    for (const c of data.families[famId]?.children ?? []) out.add(c);
  }
  return out;
}

export function spousesOf(data: GedcomData, id: string): Set<string> {
  const out = new Set<string>();
  for (const famId of data.individuals[id]?.familiesAsSpouse ?? []) {
    const fam = data.families[famId];
    if (!fam) continue;
    const other = fam.husband === id ? fam.wife : fam.husband;
    if (other) out.add(other);
  }
  return out;
}

/** People sharing at least one parent with `id`, never `id` itself. */
export function siblingsOf(data: GedcomData, id: string): Set<string> {
  const out = new Set<string>();
  const { father, mother } = parentsOf(data, id);
  for (const parent of [father, mother]) {
    if (parent) for (const c of childrenOf(data, parent)) out.add(c);
  }
  out.delete(id);
  return out;
}

function bySex(sex: Sex, male: RelationLabel, female: RelationLabel): RelationLabel | null {
  if (sex === 'M') return male;
  if (sex === 'F') return female;
  return null;
}

function isMale(data: GedcomData, id: string): boolean {
  return data.individuals[id]?.sex === 'M';
}

export function relationLabel(fromId: string, toId: string, data: GedcomData): RelationLabel | null {
  const from = data.individuals[fromId];
  const to = data.individuals[toId];
  if (!from || !to || fromId === toId) return null;
  const sex = to.sex;

  const { father, mother } = parentsOf(data, fromId);
  if (toId === father) return 'الأب';
  if (toId === mother) return 'الأم';

  if (spousesOf(data, fromId).has(toId)) {
    for (const famId of from.familiesAsSpouse) {
      const fam = data.families[famId];
      if (fam?.husband === toId) return 'الزوج';
      if (fam?.wife === toId) return 'الزوجة';
    }
  }

  const children = childrenOf(data, fromId);
  if (children.has(toId)) return bySex(sex, 'ابن', 'ابنة');

  const siblings = siblingsOf(data, fromId);
  if (siblings.has(toId)) return bySex(sex, 'الأخ', 'الأخت');

  const parents = [father, mother].filter((p): p is string => !!p);
  for (const p of parents) {
    const gp = parentsOf(data, p);
    if (toId === gp.father || toId === gp.mother) return bySex(sex, 'الجد', 'الجدة');
  }

  for (const c of children) {
    if (childrenOf(data, c).has(toId)) return bySex(sex, 'حفيد', 'حفيدة');
  }

  const fatherSiblings = father ? siblingsOf(data, father) : new Set<string>();
  if (fatherSiblings.has(toId)) return bySex(sex, 'العم', 'العمة');
  if (mother && siblingsOf(data, mother).has(toId)) return bySex(sex, 'الخال', 'الخالة');

  for (const uncle of fatherSiblings) {
    if (isMale(data, uncle) && childrenOf(data, uncle).has(toId)) {
      return bySex(sex, 'ابن العم', 'ابنة العم');
    }
  }

  for (const brother of siblings) {
    if (isMale(data, brother) && childrenOf(data, brother).has(toId)) {
      return bySex(sex, 'ابن الأخ', 'ابنة الأخ');
    }
  }

  return null;
}
