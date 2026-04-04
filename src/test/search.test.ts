import { describe, test, expect } from 'vitest';
import { matchesSearch, searchRelevance } from '@/lib/utils/search';

describe('matchesSearch', () => {
  test('returns true for empty query, whitespace-only, and blank string', () => {
    expect(matchesSearch('أحمد بن محمد', '')).toBe(true);
    expect(matchesSearch('أحمد بن محمد', '   ')).toBe(true);
    expect(matchesSearch('', '')).toBe(true);
  });

  test('returns true when single token is a substring of the text', () => {
    expect(matchesSearch('أحمد بن محمد سعيد', 'أحمد')).toBe(true);
    expect(matchesSearch('أحمد بن محمد سعيد', 'سعيد')).toBe(true);
    expect(matchesSearch('أحمد بن محمد سعيد', 'بن')).toBe(true);
  });

  test('returns true only when all tokens are present, false if any is missing', () => {
    expect(matchesSearch('أحمد بن محمد سعيد', 'أحمد سعيد')).toBe(true);
    expect(matchesSearch('أحمد بن محمد سعيد', 'أحمد بن محمد سعيد')).toBe(true);
    expect(matchesSearch('أحمد بن محمد سعيد', 'أحمد خالد')).toBe(false);
  });

  test('matches regardless of case', () => {
    expect(matchesSearch('Ahmad ibn Saeed', 'AHMAD')).toBe(true);
    expect(matchesSearch('Ahmad ibn Saeed', 'ahmad ibn saeed')).toBe(true);
    expect(matchesSearch('AHMAD IBN SAEED', 'ahmad')).toBe(true);
  });

  test('returns false when a token does not appear in the text', () => {
    expect(matchesSearch('أحمد بن محمد سعيد', 'خالد')).toBe(false);
    expect(matchesSearch('', 'أحمد')).toBe(false);
    expect(matchesSearch('أحمد بن محمد سعيد', 'أحمد خالد')).toBe(false);
  });
});

describe('searchRelevance', () => {
  test('returns 0 for empty or whitespace-only query', () => {
    expect(searchRelevance('أحمد بن محمد', '')).toBe(0);
    expect(searchRelevance('أحمد بن محمد', '   ')).toBe(0);
    expect(searchRelevance('', '')).toBe(0);
  });

  test('returns -1 when query tokens are not all found', () => {
    expect(searchRelevance('أحمد بن سعيد', 'محمد')).toBe(-1);
    expect(searchRelevance('أحمد بن محمد', 'أحمد خالد')).toBe(-1);
    expect(searchRelevance('', 'أحمد')).toBe(-1);
  });

  test('tier 0: first word of text starts with first query token', () => {
    expect(searchRelevance('محمد بن علي', 'محمد')).toBe(0);
    expect(searchRelevance('محمد بن علي', 'محمد علي')).toBe(0);
  });

  test('tier 1: first query token found at a word boundary but not in first word', () => {
    expect(searchRelevance('علي بن محمد', 'محمد')).toBe(1);
    expect(searchRelevance('علي بن محمد', 'محمد علي')).toBe(1);
  });

  test('tier 2: first query token only matches as substring within a word', () => {
    expect(searchRelevance('أبومحمد بن علي', 'محمد')).toBe(2);
  });

  test('tier 0 ranks higher than tier 1', () => {
    const tier0 = searchRelevance('محمد بن علي', 'محمد');
    const tier1 = searchRelevance('علي بن محمد', 'محمد');
    expect(tier0).toBeLessThan(tier1);
  });

  test('tier 1 ranks higher than tier 2', () => {
    const tier1 = searchRelevance('علي بن محمد', 'محمد');
    const tier2 = searchRelevance('أبومحمد بن علي', 'محمد');
    expect(tier1).toBeLessThan(tier2);
  });

  test('strips diacritics before comparison', () => {
    // مُحَمَّد with diacritics should match محمد without
    expect(searchRelevance('مُحَمَّد بن علي', 'محمد')).toBe(0);
    expect(searchRelevance('علي بن مُحَمَّد', 'محمد')).toBe(1);
  });

  test('case insensitive for Latin text', () => {
    expect(searchRelevance('Ahmad ibn Saeed', 'ahmad')).toBe(0);
    expect(searchRelevance('Ahmad ibn Saeed', 'AHMAD')).toBe(0);
    expect(searchRelevance('ibn Ahmad Saeed', 'ahmad')).toBe(1);
  });

  test('multi-word query: all tokens must be present for a match', () => {
    expect(searchRelevance('محمد بن علي', 'محمد خالد')).toBe(-1);
  });

  test('multi-word query: tier is determined by first token position', () => {
    // first token "علي" starts the first word → tier 0
    expect(searchRelevance('علي بن محمد بن سعيد', 'علي سعيد')).toBe(0);
    // first token "سعيد" is not the first word → tier 1
    expect(searchRelevance('علي بن محمد بن سعيد', 'سعيد علي')).toBe(1);
  });

  test('single-word text matches correctly', () => {
    expect(searchRelevance('محمد', 'محمد')).toBe(0);
    expect(searchRelevance('أبومحمد', 'محمد')).toBe(2);
  });

  test('all results with same score are treated equally', () => {
    // Two names both tier 0 for same query
    const score1 = searchRelevance('محمد بن علي', 'محمد');
    const score2 = searchRelevance('محمد بن سعيد', 'محمد');
    expect(score1).toBe(score2);
    expect(score1).toBe(0);
  });
});
