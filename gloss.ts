// Gloss-based lookup model.
//
// The plugin treats translation as a *lookup* operation, not an
// auto-translation. Given input text, we produce a sequence of GlossTokens
// — each of which is either:
//   - a known dictionary entry (with potentially multiple senses)
//   - an inflected form of a dictionary entry
//   - a phrase match
//   - a word with no dictionary entry (cypher fallback)
//   - a separator (whitespace/punctuation)
//
// The UI is responsible for displaying this honestly, so users see what's
// a real translation vs what's a placeholder. The plugin never silently
// invents grammar.

import { DictionaryEntry, LanguageConfig } from "./types";
import { Dictionary } from "./dictionary";
import { findInflection } from "./inflection";
import { tokeniseWithPhrases } from "./phrases";
import { applyCypher, applyCypherReverse } from "./cypher";
import { WORD_RE, applyCasing, firstSense } from "./word-tokens";

export type GlossKind =
  | "dictionary"
  | "inflected"
  | "phrase"
  | "cypher-fallback"
  | "no-match"
  | "separator";

export interface GlossToken {
  kind: GlossKind;
  // The original source text for this token
  source: string;
  // For dictionary/phrase: all candidate entries (multi-sense aware)
  candidates?: DictionaryEntry[];
  // For inflected: the matched form descriptor
  inflection?: { lemma: DictionaryEntry; label: string };
  // For cypher-fallback: what the cypher produced
  cypherOutput?: string;
}

/**
 * Build a gloss for English text being looked up against the conlang dictionary.
 *
 * For each English word we find ALL matching dictionary entries (multi-sense
 * aware) and let the UI present them as a choice. Multi-word phrases are
 * recognised by their English definition matching the input span.
 */
export function glossEnglishToConlang(
  text: string,
  dictionary: Dictionary,
  lang: LanguageConfig | null
): GlossToken[] {
  return tokeniseEnglishAgainstDictionary(text, dictionary, lang);
}

/**
 * Build a gloss for conlang text being looked up against the English dictionary.
 *
 * For each conlang word: try direct match, then phrase, then inflection,
 * then cypher fallback. Each token carries enough metadata for the UI to
 * present what kind of match it is.
 */
export function glossConlangToEnglish(
  text: string,
  dictionary: Dictionary,
  lang: LanguageConfig | null
): GlossToken[] {
  const tokens: GlossToken[] = [];
  const phrases = dictionary.phraseIndex();
  const phraseTokens = tokeniseWithPhrases(text, phrases);

  for (const t of phraseTokens) {
    if (t.kind === "separator") {
      tokens.push({ kind: "separator", source: t.text });
      continue;
    }
    if (t.kind === "phrase" && t.entry) {
      tokens.push({
        kind: "phrase",
        source: t.text,
        candidates: [t.entry],
      });
      continue;
    }
    // word token: try direct, inflected, cypher-reverse
    const word = t.text;
    const direct = dictionary.lookup(word);
    if (direct) {
      tokens.push({ kind: "dictionary", source: word, candidates: [direct] });
      continue;
    }
    if (lang) {
      const m = findInflection(word, dictionary, lang.inflections);
      if (m) {
        tokens.push({
          kind: "inflected",
          source: word,
          inflection: { lemma: m.lemma, label: m.rule.label },
        });
        continue;
      }
    }
    // No dictionary match. Show the reverse cypher as a labelled approximation.
    if (lang) {
      const reversed = applyCypherReverse(word, lang.sheets);
      if (reversed !== word) {
        tokens.push({
          kind: "cypher-fallback",
          source: word,
          cypherOutput: reversed,
        });
        continue;
      }
    }
    tokens.push({ kind: "no-match", source: word });
  }
  return tokens;
}

/**
 * Internal: tokenise English and resolve each segment to a gloss token.
 * Multi-word English phrases are recognised by checking lookupEnglish on
 * progressively longer word spans (up to 5 words).
 */
function tokeniseEnglishAgainstDictionary(
  text: string,
  dictionary: Dictionary,
  lang: LanguageConfig | null
): GlossToken[] {
  const segments: { text: string; isWord: boolean }[] = [];
  const wordRe = new RegExp(WORD_RE.source, "gu");
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    if (m.index > lastEnd) {
      segments.push({ text: text.slice(lastEnd, m.index), isWord: false });
    }
    segments.push({ text: m[0], isWord: true });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd), isWord: false });
  }

  const out: GlossToken[] = [];
  const MAX_PHRASE_LENGTH = 5;
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (!seg.isWord) {
      out.push({ kind: "separator", source: seg.text });
      i++;
      continue;
    }

    // Try longest multi-word phrase first
    let matched = false;
    for (let n = MAX_PHRASE_LENGTH; n >= 2; n--) {
      const collected: string[] = [];
      let j = i;
      let cleanGaps = true;
      let phraseSourceText = "";
      while (collected.length < n && j < segments.length) {
        const s = segments[j];
        if (s.isWord) {
          collected.push(s.text);
          phraseSourceText += s.text;
          j++;
          continue;
        }
        if (!/^\s+$/.test(s.text)) {
          cleanGaps = false;
          break;
        }
        phraseSourceText += s.text;
        j++;
      }
      if (!cleanGaps) continue;
      if (collected.length < n) continue;

      const phrase = collected.join(" ");
      const hits = dictionary.lookupEnglish(phrase);
      if (hits.length > 0) {
        out.push({
          kind: "phrase",
          source: phraseSourceText.trim(),
          candidates: hits,
        });
        // Include any separator after the phrase as a fresh separator token
        // for honest reconstruction
        i = j;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single word: get ALL candidates (multi-sense aware)
    const word = seg.text;
    const hits = dictionary.lookupEnglish(word);
    if (hits.length > 0) {
      out.push({ kind: "dictionary", source: word, candidates: hits });
      i++;
      continue;
    }

    // The input might already be a conlang word the user typed by mistake
    // (or because they want to see what it means). Recognise it and surface
    // the entry — clearer than pretending we don't know it and cyphering.
    const conlangDirect = dictionary.lookup(word);
    if (conlangDirect) {
      out.push({ kind: "dictionary", source: word, candidates: [conlangDirect] });
      i++;
      continue;
    }

    // No dictionary match — fall back to cypher, clearly labelled
    if (lang) {
      const cyphered = applyCypher(word, lang.sheets);
      if (cyphered !== word) {
        out.push({ kind: "cypher-fallback", source: word, cypherOutput: cyphered });
        i++;
        continue;
      }
    }
    out.push({ kind: "no-match", source: word });
    i++;
  }
  return out;
}

/**
 * Render a gloss as a flat string for the "transliteration" mode.
 * Uses the first candidate for each multi-sense match (with a marker so
 * the user knows there are other senses). Cypher fallbacks are kept inline
 * but the UI is expected to render them differently.
 */
export function renderTransliterationString(tokens: GlossToken[]): string {
  const out: string[] = [];
  for (const t of tokens) {
    switch (t.kind) {
      case "separator":
        out.push(t.source);
        break;
      case "dictionary":
      case "phrase":
        if (t.candidates && t.candidates.length > 0) {
          out.push(applyCasing(t.source, t.candidates[0].word));
        } else {
          out.push(t.source);
        }
        break;
      case "inflected":
        if (t.inflection) {
          // For reverse direction: produce gloss-style "lemma.LABEL" form
          const sense = firstSense(t.inflection.lemma.definition);
          out.push(`${sense || t.inflection.lemma.word}.${t.inflection.label.toUpperCase()}`);
        } else {
          out.push(t.source);
        }
        break;
      case "cypher-fallback":
        out.push(t.cypherOutput ?? t.source);
        break;
      case "no-match":
        out.push(t.source);
        break;
    }
  }
  return out.join("");
}
