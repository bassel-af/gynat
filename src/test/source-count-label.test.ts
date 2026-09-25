import { describe, expect, it } from 'vitest';
import { sourceCountLabel } from '@/components/sources/arabicDigits';

describe('sourceCountLabel — Arabic number-noun agreement for «مصدر»', () => {
  it.each([
    [1, 'مصدر واحد'],
    [2, 'مصدران'],
    [3, '٣ مصادر'],
    [10, '١٠ مصادر'],
    [11, '١١ مصدرًا'],
    [99, '٩٩ مصدرًا'],
    [100, '١٠٠ مصدر'],
    [103, '١٠٣ مصادر'],
    [120, '١٢٠ مصدرًا'],
  ])('%i → %s', (n, expected) => {
    expect(sourceCountLabel(n)).toBe(expected);
  });
});
