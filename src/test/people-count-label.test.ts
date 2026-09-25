/**
 * Sources («المصادر») — Arabic number wording for people counts in the
 * shared-source form, picker and preview.
 */
import { describe, it, expect } from 'vitest';
import { peopleCountLabel, selectedPeopleLabel, othersMoreLabel, namesSummary, fileCountLabel } from '@/components/sources/arabicDigits';

describe('peopleCountLabel — «حفظ عند …» / «هذا المصدر لـ …»', () => {
  it.each([
    [1, 'شخص واحد'],
    [2, 'شخصين'],
    [3, '٣ أشخاص'],
    [10, '١٠ أشخاص'],
    [11, '١١ شخصًا'],
    [42, '٤٢ شخصًا'],
    [100, '١٠٠ شخص'],
    [103, '١٠٣ أشخاص'],
  ])('%i → %s', (n, expected) => {
    expect(peopleCountLabel(n)).toBe(expected);
  });
});

describe('selectedPeopleLabel — the picker footer', () => {
  it.each([
    [1, 'شخص واحد محدد'],
    [2, 'شخصان محددان'],
    [3, '٣ أشخاص محددين'],
    [10, '١٠ أشخاص محددين'],
    [11, '١١ شخصًا محددًا'],
  ])('%i → %s', (n, expected) => {
    expect(selectedPeopleLabel(n)).toBe(expected);
  });
});

describe('othersMoreLabel — the collapsed chips «و{N} آخرون»', () => {
  it.each([
    [1, 'وشخص آخر'],
    [2, 'وشخصان آخران'],
    [6, 'و٦ آخرون'],
    [12, 'و١٢ آخرون'],
  ])('%i → %s', (n, expected) => {
    expect(othersMoreLabel(n)).toBe(expected);
  });
});

describe('namesSummary — «مصدر لـ: محمد، فاطمة و٨ آخرون»', () => {
  it('lists up to three names in full', () => {
    expect(namesSummary(['محمد'], 1)).toBe('محمد');
    expect(namesSummary(['محمد', 'فاطمة'], 2)).toBe('محمد وفاطمة');
    expect(namesSummary(['محمد', 'فاطمة', 'أحمد'], 3)).toBe('محمد، فاطمة وأحمد');
  });
  it('collapses a longer list to two names and the rest', () => {
    expect(namesSummary(['محمد', 'فاطمة', 'أحمد', 'سعاد'], 10)).toBe('محمد، فاطمة و٨ آخرون');
  });
  it('counts people whose names were not sent (capped lists)', () => {
    expect(namesSummary(['محمد'], 4)).toBe('محمد و٣ آخرون');
  });
});

describe('fileCountLabel — «· ٣ ملفات» on a suggestion', () => {
  it.each([
    [1, 'ملف واحد'],
    [2, 'ملفان'],
    [3, '٣ ملفات'],
    [11, '١١ ملفًا'],
    [20, '٢٠ ملفًا'],
  ])('%i → %s', (n, expected) => {
    expect(fileCountLabel(n)).toBe(expected);
  });
});
