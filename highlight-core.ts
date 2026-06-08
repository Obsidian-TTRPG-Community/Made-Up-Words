// Known-word highlighting — pure resolution logic.
//
// This module is deliberately free of CodeMirror and DOM dependencies so it
// can be unit-tested directly (see test-highlight.ts). The CM6 editor
// extension and the Reading-view post-processor live in highlight.ts and both
// consume `highlightSpans` / `classForKind` from here.

import type ConlangPlugin from "./main";
import { tokeniseWithPhrases } from "./phrases";
import { cleanWord } from "./word-tokens";
import { findInflection } from "./inflection";

export type HighlightKind = "conlang" | "english" | "phrase";

/**
 * A resolved highlight span, expressed as character offsets relative to the
 * baseOffset passed into `highlightSpans`.
 */
export interface HighlightSpan {
  from: number;
  to: number;
  kind: HighlightKind;
}

export const BASE_CLASS = "conlang-known-word";

/** Map a highlight kind to the CSS class string applied to its span. */
export function classForKind(kind: HighlightKind): string {
  switch (kind) {
    case "english":
      return `${BASE_CLASS} is-english`;
    case "phrase":
      return `${BASE_CLASS} is-conlang is-phrase`;
    case "conlang":
    default:
      return `${BASE_CLASS} is-conlang`;
  }
}

/**
 * Classify a single (already-cleaned) word. Conlang direction wins over the
 * English direction, mirroring the hover-tooltip resolution order. Returns
 * null when the word isn't recognised or the relevant direction is disabled.
 */
export function classifyWord(
  plugin: ConlangPlugin,
  cleaned: string
): HighlightKind | null {
  if (!cleaned) return null;
  const s = plugin.settings;

  if (s.highlightConlang) {
    // Direct headword match in any active language.
    if (plugin.dictionary.lookupAll(cleaned).length > 0) return "conlang";
    // Inflected form that resolves to a headword via this language's rules.
    for (const lang of plugin.getActiveLanguages()) {
      if (findInflection(cleaned, plugin.dictionary, lang.inflections)) {
        return "conlang";
      }
    }
  }

  if (s.highlightEnglish) {
    if (plugin.dictionary.lookupEnglish(cleaned).length > 0) return "english";
  }

  return null;
}

/**
 * Resolve every highlight span within `text`. Phrases are matched first
 * (longest-first, like hover), then remaining single words are classified.
 * Returned offsets are relative to `baseOffset` so callers can map them onto
 * either a CodeMirror document position or a DOM text node.
 */
export function highlightSpans(
  plugin: ConlangPlugin,
  text: string,
  baseOffset: number
): HighlightSpan[] {
  const out: HighlightSpan[] = [];
  if (!plugin.settings.highlightKnownWords) return out;

  // Phrase entries are conlang headwords, so only scan them when the conlang
  // direction is enabled.
  const phrases = plugin.settings.highlightConlang
    ? plugin.dictionary.allPhrases()
    : [];
  const tokens = tokeniseWithPhrases(text, phrases);

  let offset = baseOffset;
  for (const token of tokens) {
    const len = token.text.length;
    if (token.kind === "phrase" && token.entry) {
      out.push({ from: offset, to: offset + len, kind: "phrase" });
    } else if (token.kind === "word") {
      const kind = classifyWord(plugin, cleanWord(token.text));
      if (kind) out.push({ from: offset, to: offset + len, kind });
    }
    offset += len;
  }
  return out;
}
