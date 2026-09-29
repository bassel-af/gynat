import { describe, test, expect } from 'vitest';
import { highlightSegments } from '@/lib/utils/search';

/** Only the highlighted pieces, in order. */
function hits(text: string, query: string): string[] {
  return highlightSegments(text, query)
    .filter((s) => s.hit)
    .map((s) => s.text);
}

describe('highlightSegments', () => {
  test('an empty query leaves the whole text unhighlighted', () => {
    expect(highlightSegments('علي بن أبي طالب', '  ')).toEqual([{ text: 'علي بن أبي طالب', hit: false }]);
  });

  test('segments always rejoin to the original text', () => {
    const text = 'عَبْدُالْمُطَّلِب بن هاشم';
    expect(highlightSegments(text, 'مطلب هاشم').map((s) => s.text).join('')).toBe(text);
  });

  test('marks a plain match between unmarked pieces', () => {
    expect(highlightSegments('واسمه شيبة', 'شيبة')).toEqual([
      { text: 'واسمه ', hit: false },
      { text: 'شيبة', hit: true },
    ]);
  });

  test('matches text carrying tashkeel and keeps the marks inside the hit', () => {
    expect(hits('واسمه شَيْبَةُ', 'شيبة')).toEqual(['شَيْبَةُ']);
  });

  test('a query carrying tashkeel matches bare text', () => {
    expect(hits('واسمه شيبة', 'شَيْبَة')).toEqual(['شيبة']);
  });

  test('marks every query token', () => {
    expect(hits('علي بن أبي طالب القرشي', 'طالب علي')).toEqual(['علي', 'طالب']);
  });

  test('matches regardless of case', () => {
    expect(hits('Ali ibn Abi Talib', 'TALIB')).toEqual(['Talib']);
  });

  test('regex-special characters in the query are matched literally', () => {
    expect(hits('a.b (c)', '(c)')).toEqual(['(c)']);
    expect(hits('abc', '.*')).toEqual([]);
  });
});
