// Shared word-tokenisation helpers.
//
// The plugin used to use /[A-Za-z']+/ everywhere, which broke for any conlang
// using accented characters, non-Latin scripts, or compound words with
// hyphens. This module centralises the regex so behaviour is consistent.
//
// The pattern: a "word" starts with a letter (any Unicode letter, via \p{L})
// and may contain additional letters, apostrophes, or hyphens. Trailing
// punctuation is naturally excluded because the engine stops at non-letter
// non-apostrophe non-hyphen.
//
// Compounds like "kala-vren" are treated as one token because they're
// addressable as one dictionary entry. Decomposition is explicit (the
// `parts` field) rather than implicit (regex-driven).

/** Match a whole word. Use with .match(WORD_RE) or .replace(WORD_RE, ...). */
export const WORD_RE = /\p{L}[\p{L}'-]*/gu;

/** Anchored version: test whether a string IS a single word. */
export const WORD_ANCHORED_RE = /^\p{L}[\p{L}'-]*$/u;

/** Strip non-word characters from a string. Used to clean hovered text. */
export function cleanWord(s: string): string {
  return s.replace(/[^\p{L}'-]/gu, "");
}

/** Test whether a single character is part of a word. */
export function isWordChar(ch: string): boolean {
  return /[\p{L}'-]/u.test(ch);
}

/**
 * Copy the casing pattern of `source` onto `target`.
 * - source all-uppercase  -> target all-uppercase
 * - source Capitalised     -> target Capitalised
 * - otherwise              -> target unchanged
 *
 * The "has distinct cases" guard (toUpperCase !== toLowerCase) matters: a
 * source starting with a digit or a caseless character must NOT be treated
 * as capitalised, or we'd wrongly capitalise the target.
 */
export function applyCasing(source: string, target: string): string {
  if (source.length === 0 || target.length === 0) return target;
  if (
    source === source.toUpperCase() &&
    source !== source.toLowerCase()
  ) {
    return target.toUpperCase();
  }
  if (
    source[0] === source[0].toUpperCase() &&
    source[0] !== source[0].toLowerCase()
  ) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * Extract the first sense from a definition. Definitions can hold multiple
 * comma- or semicolon-separated senses ("water, liquid"); the first is the
 * primary gloss. Falls back to the whole definition if there's no separator,
 * and to an empty string if the definition is blank.
 */
export function firstSense(definition: string): string {
  return definition.split(/[,;]/)[0].trim();
}

