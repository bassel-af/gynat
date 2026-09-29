/** All Arabic diacritics characters (tashkeel) as a string — shared with SQL translate() */
export const ARABIC_DIACRITICS_CHARS = '\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u065F\u0670';

/**
 * Strip Arabic diacritics (tashkeel) from a string.
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

/** A piece of text and whether it matched a search query. */
export interface HighlightSegment {
  text: string;
  hit: boolean;
}

const DIACRITIC_SET = new Set(ARABIC_DIACRITICS_CHARS);

/**
 * Split `text` into highlighted / plain pieces for a search `query`, matching
 * the way `matchesSearch` does: every whitespace-delimited token, case-
 * insensitive, ignoring tashkeel on both sides. Tashkeel inside or right after
 * a hit stays in the hit. Pure char walk — no RegExp is built from the query.
 * The pieces always rejoin to `text`.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(stripArabicDiacritics)
    .filter(Boolean);
  if (tokens.length === 0) return [{ text, hit: false }];

  // Normalized text (no tashkeel, lower case) + each char's index in `text`.
  let normalized = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (DIACRITIC_SET.has(ch)) continue;
    const lower = ch.toLowerCase();
    normalized += lower.length === 1 ? lower : ch;
    origin.push(i);
  }

  const hit = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    for (let at = normalized.indexOf(token); at !== -1; at = normalized.indexOf(token, at + 1)) {
      const start = origin[at];
      let end = origin[at + token.length - 1] + 1;
      while (end < text.length && DIACRITIC_SET.has(text[end])) end++;
      hit.fill(true, start, end);
    }
  }

  const segments: HighlightSegment[] = [];
  let from = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || hit[i] !== hit[from]) {
      segments.push({ text: text.slice(from, i), hit: hit[from] });
      from = i;
    }
  }
  return segments;
}

/**
 * Score search relevance for ranking (lower = better). Returns -1 if no match.
 *
 * Tier 0: First word of text starts with the first query token.
 * Tier 1: First query token starts a word in text, but not the first word.
 * Tier 2: First query token only appears as a substring within a word.
 */
export function searchRelevance(text: string, query: string): number {
  const trimmed = query.trim();
  if (!trimmed) return 0;

  const normalizedText = stripArabicDiacritics(text);
  const tokens = trimmed.split(/\s+/).map(t => stripArabicDiacritics(t));

  // All tokens must be present
  if (!tokens.every(token => normalizedText.includes(token))) return -1;

  const firstToken = tokens[0];
  const words = normalizedText.split(/\s+/);

  // Tier 0: first word starts with first token
  if (words[0]?.startsWith(firstToken)) return 0;

  // Tier 1: some other word starts with first token
  if (words.some(w => w.startsWith(firstToken))) return 1;

  // Tier 2: substring match only
  return 2;
}
