// Phrase matcher.
//
// Given a span of text and the dictionary's phrase index, walks word by word
// and tries to match the longest phrase entry starting at each position.
//
// The matcher returns "tokens" — either a phrase match, a single word, or
// a chunk of whitespace/punctuation. This is enough for downstream code to
// reconstruct the text while substituting matched phrases.

import { DictionaryEntry } from "./types";
import { WORD_RE } from "./word-tokens";

export interface MatchedToken {
  kind: "phrase" | "word" | "separator";
  text: string;
  // For phrase tokens: the entry that matched
  entry?: DictionaryEntry;
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
  phrases: DictionaryEntry[]
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
    const match = matchPhraseAt(words, wi, phrases, text);
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
 * `phrases` is expected sorted by word count descending so the first match wins.
 *
 * We also verify the spacing between matched words is "clean" — only whitespace,
 * no punctuation that would break the phrase semantically. ("good. morning"
 * isn't the phrase "good morning".)
 */
function matchPhraseAt(
  words: { text: string; start: number; end: number }[],
  startIdx: number,
  phrases: DictionaryEntry[],
  source: string
): { entry: DictionaryEntry; wordCount: number } | null {
  const remaining = words.length - startIdx;
  for (const phrase of phrases) {
    const wc = phrase.wordCount ?? 0;
    if (wc < 2) continue; // shouldn't happen — phrases must be ≥ 2 words
    if (wc > remaining) continue;

    // Compare phrase words to source words, case-insensitive
    const phraseWords = phrase.word.toLowerCase().split(/\s+/);
    let allMatch = true;
    for (let i = 0; i < wc; i++) {
      if (words[startIdx + i].text.toLowerCase() !== phraseWords[i]) {
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

    return { entry: phrase, wordCount: wc };
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
  phrases: DictionaryEntry[]
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
