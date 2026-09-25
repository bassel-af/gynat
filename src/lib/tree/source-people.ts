/**
 * Sources («المصادر») — the people picker's pure logic over the loaded tree
 * (`GedcomData`): quick buttons from the starting person's relationships,
 * one row per person (name line + relation · birth line) and search.
 *
 * Private people are never offered (the tree shows them as «خاص» even to
 * admins, so they cannot be told apart). Borrowed-branch (`_pointed`) people
 * are found by search but cannot be picked: their data belongs to another
 * family space.
 */
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { getDisplayNameWithNasab } from '@/lib/gedcom/display';
import { getPersonRelationships } from '@/lib/gedcom/relationships';
import { matchesSearch, searchRelevance } from '@/lib/utils/search';
import { shouldHideBirthDate, type BirthDatePrivacySettings } from '@/lib/tree/birth-date-privacy';
import { relationLabel } from '@/lib/tree/relation-label';
import { toArabicDigits } from '@/components/sources/arabicDigits';

export const BORROWED_PERSON_NOTE = 'من فرع مربوط من مساحة أخرى · لا يمكن إضافته';
const PICKER_NASAB_DEPTH = 2;
const MAX_SEARCH_RESULTS = 40;

export interface QuickGroup {
  key: string;
  label: string;
  /** Every member the button selects (the starting person included for «الأسرة كلها»). */
  ids: string[];
}

export interface PickerRow {
  id: string;
  name: string;
  /** «{صلة القرابة} · مواليد …», or null when neither is known. */
  sub: string | null;
  disabled: boolean;
}

/** A person the picker may select: native to this tree and not private. */
export function isSelectablePerson(ind: Individual | undefined): ind is Individual {
  return !!ind && ind.isPrivate === false && !ind._pointed;
}

const shortName = (ind: Individual) => ind.givenName || ind.name;

function selectable(list: readonly Individual[]): Individual[] {
  return list.filter(isSelectablePerson);
}

/**
 * The quick buttons for the starting person (only groups that exist):
 * - a spouse or parent of children: one «الزوجة: …» / «الزوج: …» per
 *   spouse, «الأبناء (N)» over every couple, «الأسرة كلها (N)»;
 * - otherwise (a child): «الوالدان» (or the one known parent by name),
 *   «الإخوة (N)», «الأسرة كلها (N)».
 * «الأسرة كلها» counts the starting person too.
 */
export function quickGroups(data: GedcomData, startId: string): QuickGroup[] {
  const start = data.individuals[startId];
  if (!start) return [];
  const rel = getPersonRelationships(data, startId);
  const groups: QuickGroup[] = [];
  const family = new Set<string>([startId]);

  const spouses = selectable(rel.spouses);
  const children = selectable(rel.children);

  if (spouses.length > 0 || children.length > 0) {
    for (const spouse of spouses) {
      const isWife = start.familiesAsSpouse.some((fid) => data.families[fid]?.wife === spouse.id);
      groups.push({
        key: `spouse-${spouse.id}`,
        label: `${isWife ? 'الزوجة' : 'الزوج'}: ${shortName(spouse)}`,
        ids: [spouse.id],
      });
      family.add(spouse.id);
    }
    if (children.length > 0) {
      groups.push({ key: 'children', label: `الأبناء (${toArabicDigits(children.length)})`, ids: children.map((c) => c.id) });
      children.forEach((c) => family.add(c.id));
    }
  } else {
    const parents = selectable(rel.parents);
    if (parents.length === 2) {
      groups.push({ key: 'parents', label: 'الوالدان', ids: parents.map((p) => p.id) });
    } else if (parents.length === 1) {
      const p = parents[0];
      groups.push({ key: 'parents', label: `${p.sex === 'F' ? 'الأم' : 'الأب'}: ${shortName(p)}`, ids: [p.id] });
    }
    parents.forEach((p) => family.add(p.id));
    const siblings = selectable([...rel.siblings, ...rel.halfSiblings]);
    if (siblings.length > 0) {
      groups.push({ key: 'siblings', label: `الإخوة (${toArabicDigits(siblings.length)})`, ids: siblings.map((s) => s.id) });
      siblings.forEach((s) => family.add(s.id));
    }
  }

  if (family.size > 1) {
    groups.push({ key: 'all', label: `الأسرة كلها (${toArabicDigits(family.size)})`, ids: [...family] });
  }
  return groups;
}

const year = (date: string): string | null => date.match(/\d{3,4}/)?.[0] ?? null;

/** «مواليد ١٣٥٥هـ (١٩٣٦م)» — Hijri first; only the known calendar; '' when none. */
export function birthLabel(ind: Individual): string {
  const hijri = year(ind.birthHijriDate || '');
  const greg = year(ind.birth || '');
  if (hijri && greg) return `مواليد ${toArabicDigits(Number(hijri))}هـ (${toArabicDigits(Number(greg))}م)`;
  if (hijri) return `مواليد ${toArabicDigits(Number(hijri))}هـ`;
  if (greg) return `مواليد ${toArabicDigits(Number(greg))}م`;
  return '';
}

/** One picker row: name + 2-generation nasab + family name, then relation · birth. */
export function pickerRow(
  data: GedcomData,
  fromId: string | null,
  id: string,
  birthPrivacy: BirthDatePrivacySettings = {},
): PickerRow {
  const ind = data.individuals[id];
  if (!ind) return { id, name: '', sub: null, disabled: true };
  const name = getDisplayNameWithNasab(data, ind, PICKER_NASAB_DEPTH);
  if (ind._pointed) return { id, name, sub: BORROWED_PERSON_NOTE, disabled: true };
  const relation = fromId ? relationLabel(fromId, id, data) : null;
  const birth = shouldHideBirthDate(ind, birthPrivacy) ? '' : birthLabel(ind);
  const sub = [relation, birth].filter(Boolean).join(' · ');
  return { id, name, sub: sub || null, disabled: false };
}

/** Anyone in the tree matching the query (never a private person), best first. */
export function searchPickerPeople(data: GedcomData, query: string): Individual[] {
  if (!query.trim()) return [];
  const scored: { ind: Individual; score: number }[] = [];
  for (const ind of Object.values(data.individuals)) {
    if (ind.isPrivate !== false) continue;
    const name = getDisplayNameWithNasab(data, ind, PICKER_NASAB_DEPTH);
    const text = ind.kunya ? `${name} ${ind.kunya}` : name;
    if (matchesSearch(text, query)) scored.push({ ind, score: searchRelevance(name, query) });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, MAX_SEARCH_RESULTS).map((s) => s.ind);
}
