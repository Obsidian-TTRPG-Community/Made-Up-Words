// Known-word highlighting — pure resolution logic.
//
// This module is deliberately free of CodeMirror and DOM dependencies so it
// can be unit-tested directly (see test-highlight.ts). The CM6 editor
// extension and the Reading-view post-processor live in highlight.ts and both
// consume `highlightSpans` / `classForKind` from here.

import type ConlangPlugin from "./main";
import { tokeniseWithPhrases, EMPTY_PHRASE_INDEX } from "./phrases";
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
  // Vault path of the dictionary entry note this span resolves to, if known.
  // Used to make recognised words clickable (open their entry). For inflected
  // forms this is the lemma's note; for English matches, the first translation.
  path?: string;
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

// Guard against unbounded growth on very large / unusual documents. When the
// cache fills we drop it wholesale — the next viewport repopulates it with
// exactly the words that matter.
const CLASSIFY_CACHE_MAX = 20000;

/**
 * Classify a single (already-cleaned) word. Conlang direction wins over the
 * English direction, mirroring the hover-tooltip resolution order. Returns
 * null when the word isn't recognised or the relevant direction is disabled.
 *
 * Results are memoized on the plugin (`classifyCache`) because the editor
 * highlighter re-classifies every visible word on each keystroke and scroll,
 * and words repeat heavily. The cache is invalidated whenever the dictionary
 * reloads or settings change (see main.ts).
 */
export function classifyWord(
  plugin: ConlangPlugin,
  cleaned: string
): HighlightKind | null {
  if (!cleaned) return null;
  const cached = plugin.classifyCache.get(cleaned);
  if (cached !== undefined) return cached;
  const kind = computeClassifyWord(plugin, cleaned);
  if (plugin.classifyCache.size >= CLASSIFY_CACHE_MAX) {
    plugin.classifyCache.clear();
  }
  plugin.classifyCache.set(cleaned, kind);
  return kind;
}

function computeClassifyWord(
  plugin: ConlangPlugin,
  cleaned: string
): HighlightKind | null {
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
    ? plugin.dictionary.phraseIndex()
    : EMPTY_PHRASE_INDEX;
  const tokens = tokeniseWithPhrases(text, phrases);

  let offset = baseOffset;
  for (const token of tokens) {
    const len = token.text.length;
    if (token.kind === "phrase" && token.entry) {
      out.push({ from: offset, to: offset + len, kind: "phrase", path: token.entry.path });
    } else if (token.kind === "word") {
      const cleaned = cleanWord(token.text);
      const kind = classifyWord(plugin, cleaned);
      if (kind) {
        const path = resolveEntryPath(plugin, cleaned, kind);
        out.push({ from: offset, to: offset + len, kind, path });
      }
    }
    offset += len;
  }
  return out;
}

/**
 * Resolve the entry-note path a recognised word should link to. Mirrors the
 * classification order: direct conlang headword, then inflected form (→ lemma),
 * then English translation. Returns undefined if nothing resolves (the span is
 * still highlighted, just not clickable).
 */
function resolveEntryPath(
  plugin: ConlangPlugin,
  cleaned: string,
  kind: HighlightKind
): string | undefined {
  if (kind === "english") {
    return plugin.dictionary.lookupEnglish(cleaned)[0]?.path;
  }
  const direct = plugin.dictionary.lookupAll(cleaned)[0];
  if (direct) return direct.path;
  for (const lang of plugin.getActiveLanguages()) {
    const infl = findInflection(cleaned, plugin.dictionary, lang.inflections);
    if (infl) return infl.lemma.path;
  }
  return undefined;
}
