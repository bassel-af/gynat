/**
 * Strip Arabic diacritics (tashkeel) from a string.
 * Removes: fathatan, dammatan, kasratan, fatha, damma, kasra, shadda,
 * sukun, and superscript alef.
 */
export function stripArabicDiacritics(s: string): string {
  return s.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '');
}

/**
 * Multi-word search matching for Arabic and Latin text.
 * Returns true if every whitespace-delimited token in `query`
 * appears somewhere in `text` (case-insensitive, diacritics-stripped).
 */
export function matchesSearch(text: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const normalizedText = stripArabicDiacritics(text);
  const tokens = trimmed.split(/\s+/);

  return tokens.every(token => normalizedText.includes(stripArabicDiacritics(token)));
}
