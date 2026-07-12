// Phrase matcher.
//
// Given a span of text and the dictionary's phrase index, walks word by word
// and tries to match the longest phrase entry starting at each position.
//
// The matcher returns "tokens" — either a phrase match, a single word, or
// a chunk of whitespace/punctuation. This is enough for downstream code to
// reconstruct the text while substituting matched phrases.
//
// Performance: phrases are indexed by their first word, so per word position
// we only examine phrases that could possibly start there. This keeps the
// tokeniser O(words) even for dictionaries with thousands of phrase entries.

import { DictionaryEntry } from "./types";
import { WORD_RE } from "./word-tokens";

export interface MatchedToken {
  kind: "phrase" | "word" | "separator";
  text: string;
  // For phrase tokens: the entry that matched
  entry?: DictionaryEntry;
}

/** A phrase entry with its lowercased words precomputed for fast comparison. */
export interface IndexedPhrase {
  entry: DictionaryEntry;
  wordsLower: string[];
}

/**
 * Phrase entries bucketed by their (lowercased) first word. Each bucket is
 * sorted longest-first so the matcher's first hit is the longest match —
 * the same priority order the old flat, fully-sorted list provided.
 */
export interface PhraseIndex {
  byFirstWord: Map<string, IndexedPhrase[]>;
  size: number;
  // When true, phrase words were indexed with case preserved and the matcher
  // compares case-sensitively. Mirrors the dictionary's caseSensitiveMatching.
  caseSensitive: boolean;
}

/** Shared empty index for callers that have phrase matching disabled. */
export const EMPTY_PHRASE_INDEX: PhraseIndex = {
  byFirstWord: new Map(),
  size: 0,
  caseSensitive: false,
};

/** Normalise a phrase word for indexing/comparison, respecting case mode. */
function normWord(s: string, caseSensitive: boolean): string {
  return caseSensitive ? s : s.toLowerCase();
}

/**
 * Build a first-word index from phrase entries. Lowercasing and word
 * splitting happen once here instead of on every comparison. Buckets are
 * sorted by word count descending; the sort is stable, so entries with the
 * same length keep their insertion order (matching previous behaviour).
 */
export function buildPhraseIndex(
  phrases: DictionaryEntry[],
  caseSensitive = false
): PhraseIndex {
  const byFirstWord = new Map<string, IndexedPhrase[]>();
  let size = 0;
  for (const entry of phrases) {
    const wordsLower = normWord(entry.word, caseSensitive)
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (wordsLower.length < 2) continue; // phrases must be ≥ 2 words
    const list = byFirstWord.get(wordsLower[0]) ?? [];
    list.push({ entry, wordsLower });
    byFirstWord.set(wordsLower[0], list);
    size++;
  }
  for (const list of byFirstWord.values()) {
    list.sort((a, b) => b.wordsLower.length - a.wordsLower.length);
  }
  return { byFirstWord, size, caseSensitive };
}

/**
 * Tokenise text and resolve any phrase matches. Single-word tokens are NOT
 * looked up here — callers handle single-word lookup themselves so they can
 * also try inflection and English-direction matches.
 *
 * Phrases are matched case-insensitively. Whitespace between phrase words
 * may include multiple spaces but no other content (no punctuation breaking
 * the phrase). Punctuation after the phrase is fine — it goes into a
 * separator token.
 */
export function tokeniseWithPhrases(
  text: string,
  phrases: PhraseIndex
): MatchedToken[] {
  const out: MatchedToken[] = [];
  // Build a word-and-separator stream using the shared Unicode-aware
  // tokeniser. This handles accented characters, hyphenated compounds,
  // and apostrophes consistently with the rest of the plugin.
  const words: { text: string; start: number; end: number }[] = [];
  // RegExp objects with the 'g' flag are stateful — clone before iterating
  // so concurrent callers don't trample each other.
  const wordRe = new RegExp(WORD_RE.source, "gu");
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  let cursor = 0; // position in source text
  let wi = 0; // word index

  while (wi < words.length) {
    const w = words[wi];
    // Emit any separator content before this word
    if (cursor < w.start) {
      out.push({ kind: "separator", text: text.slice(cursor, w.start) });
    }

    // Try to match the longest phrase starting at this word.
    const match =
      phrases.size > 0 ? matchPhraseAt(words, wi, phrases, text) : null;
    if (match) {
      // Emit the entire phrase including the original spacing between its
      // words. We slice from the first word's start to the last word's end.
      const last = words[wi + match.wordCount - 1];
      out.push({
        kind: "phrase",
        text: text.slice(w.start, last.end),
        entry: match.entry,
      });
      cursor = last.end;
      wi += match.wordCount;
    } else {
      out.push({ kind: "word", text: w.text });
      cursor = w.end;
      wi += 1;
    }
  }

  // Trailing separator
  if (cursor < text.length) {
    out.push({ kind: "separator", text: text.slice(cursor) });
  }

  return out;
}

/**
 * Find the longest phrase entry that matches starting at `words[startIdx]`.
 * Only phrases sharing the position's first word are examined (via the
 * index); buckets are sorted by word count descending so the first match wins.
 *
 * We also verify the spacing between matched words is "clean" — only whitespace,
 * no punctuation that would break the phrase semantically. ("good. morning"
 * isn't the phrase "good morning".)
 */
function matchPhraseAt(
  words: { text: string; start: number; end: number }[],
  startIdx: number,
  phrases: PhraseIndex,
  source: string
): { entry: DictionaryEntry; wordCount: number } | null {
  const cs = phrases.caseSensitive;
  const bucket = phrases.byFirstWord.get(normWord(words[startIdx].text, cs));
  if (!bucket) return null;
  const remaining = words.length - startIdx;

  for (const { entry, wordsLower } of bucket) {
    const wc = wordsLower.length;
    if (wc > remaining) continue;

    // Compare phrase words to source words. The first word already matched via
    // the bucket lookup. Comparison honours the index's case-sensitivity mode.
    let allMatch = true;
    for (let i = 1; i < wc; i++) {
      if (normWord(words[startIdx + i].text, cs) !== wordsLower[i]) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) continue;

    // Verify the gaps between consecutive words contain only whitespace.
    // If "good" is followed by "morning" but with a comma or full stop
    // between them, this isn't the phrase "good morning".
    let cleanGaps = true;
    for (let i = 0; i < wc - 1; i++) {
      const gap = source.slice(words[startIdx + i].end, words[startIdx + i + 1].start);
      if (!/^\s+$/.test(gap)) {
        cleanGaps = false;
        break;
      }
    }
    if (!cleanGaps) continue;

    return { entry, wordCount: wc };
  }
  return null;
}

/**
 * Convenience: try to match a multi-word phrase at the start of `text`.
 * Returns the matched entry plus the consumed text, or null if no match.
 * Used by hover to detect when the cursor is inside a phrase.
 */
export function matchPhraseAtStart(
  text: string,
  phrases: PhraseIndex
): { entry: DictionaryEntry; matchedText: string } | null {
  const tokens = tokeniseWithPhrases(text, phrases);
  // Find the first non-separator token; if it's a phrase, we have a match.
  for (const t of tokens) {
    if (t.kind === "separator") continue;
    if (t.kind === "phrase" && t.entry) {
      return { entry: t.entry, matchedText: t.text };
    }
    return null;
  }
  return null;
}
