/**
 * Sources («المصادر») — the people picker's pure logic: quick buttons,
 * row lines and search over the loaded tree.
 */
import { describe, it, expect } from 'vitest';
import {
  quickGroups,
  birthLabel,
  pickerRow,
  searchPickerPeople,
  isSelectablePerson,
} from '@/lib/tree/source-people';
import { buildPickerFamily } from './helpers/source-people-fixture';

const data = buildPickerFamily();
const summary = (groups: ReturnType<typeof quickGroups>) => groups.map((g) => [g.label, [...g.ids].sort()]);

describe('quickGroups', () => {
  it('from a man: one «الزوجة» per wife, the children of every couple, and the whole family with him', () => {
    expect(summary(quickGroups(data, 'M'))).toEqual([
      ['الزوجة: فاطمة', ['W1']],
      ['الزوجة: زينب', ['W2']],
      ['الأبناء (٣)', ['K1', 'K2', 'K3']],
      ['الأسرة كلها (٦)', ['K1', 'K2', 'K3', 'M', 'W1', 'W2']],
    ]);
  });

  it('never offers a private or borrowed-branch person, nor counts them', () => {
    const ids = quickGroups(data, 'M').flatMap((g) => g.ids);
    expect(ids).not.toContain('KP');
    expect(ids).not.toContain('KB');
  });

  it('from a woman: «الزوج» and her children', () => {
    expect(summary(quickGroups(data, 'W1'))).toEqual([
      ['الزوج: محمد', ['M']],
      ['الأبناء (٢)', ['K1', 'K2']],
      ['الأسرة كلها (٤)', ['K1', 'K2', 'M', 'W1']],
    ]);
  });

  it('from a child with no spouse or children: «الوالدان», «الإخوة» (half-siblings included), the whole family', () => {
    expect(summary(quickGroups(data, 'K1'))).toEqual([
      ['الوالدان', ['M', 'W1']],
      ['الإخوة (٢)', ['K2', 'K3']],
      ['الأسرة كلها (٥)', ['K1', 'K2', 'K3', 'M', 'W1']],
    ]);
  });

  it('a single known parent is named instead of «الوالدان»', () => {
    expect(summary(quickGroups(data, 'OTHER'))[0]).toEqual(['الأب: عبد الله', ['GF']]);
  });

  it('an unknown person has no quick buttons', () => {
    expect(quickGroups(data, 'NOPE')).toEqual([]);
  });
});

describe('birthLabel', () => {
  it('Hijri first, Gregorian in parentheses', () => {
    expect(birthLabel(data.individuals.M)).toBe('مواليد ١٣٥٠هـ (١٩٣١م)');
  });
  it('only the known calendar', () => {
    expect(birthLabel(data.individuals.K1)).toBe('مواليد ١٣٧٥هـ');
    expect(birthLabel(data.individuals.K2)).toBe('مواليد ١٩٥٧م');
  });
  it('nothing when no birth date', () => {
    expect(birthLabel(data.individuals.K3)).toBe('');
  });
});

describe('pickerRow', () => {
  it('line 1 is the 2-generation nasab with the family name; line 2 relation · birth', () => {
    expect(pickerRow(data, 'M', 'K1')).toEqual({
      id: 'K1',
      name: 'أحمد بن محمد العطار',
      sub: 'ابن · مواليد ١٣٧٥هـ',
      disabled: false,
    });
  });
  it('no relation and no birth → no second line', () => {
    expect(pickerRow(data, 'K1', 'W2').sub).toBeNull(); // a stepmother: no label in the list
  });
  it('a borrowed-branch person is disabled with the design note', () => {
    expect(pickerRow(data, 'M', 'KB')).toMatchObject({
      disabled: true,
      sub: 'من فرع مربوط من مساحة أخرى · لا يمكن إضافته',
    });
  });
  it('hides a birth date the workspace hides', () => {
    expect(pickerRow(data, 'M', 'K1', { hideBirthDateForMale: true }).sub).toBe('ابن');
  });
});

describe('searchPickerPeople', () => {
  it('matches across the whole tree, never a private person', () => {
    const ids = searchPickerPeople(data, 'عبد').map((p) => p.id);
    expect(ids).toContain('OTHER');
    expect(ids).toContain('GF');
    expect(searchPickerPeople(data, 'خاص')).toEqual([]);
  });
  it('shows borrowed-branch people (the row disables them)', () => {
    expect(searchPickerPeople(data, 'يوسف').map((p) => p.id)).toEqual(['KB']);
  });
  it('an empty query finds nobody', () => {
    expect(searchPickerPeople(data, '  ')).toEqual([]);
  });
});

describe('isSelectablePerson', () => {
  it('only native, non-private people', () => {
    expect(isSelectablePerson(data.individuals.K1)).toBe(true);
    expect(isSelectablePerson(data.individuals.KP)).toBe(false);
    expect(isSelectablePerson(data.individuals.KB)).toBe(false);
  });
});
