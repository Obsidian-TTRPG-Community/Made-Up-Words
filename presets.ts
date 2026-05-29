// Inflection presets: curated starter sets of inflection rules.
//
// Each preset is a list of rules with placeholder affixes (using English-ish
// defaults that users will edit to match their conlang). The point isn't the
// specific affixes — it's the linguistic *categories*. A user who doesn't know
// they should care about "past participle" will see the slot exist and either
// fill it in or delete it.
//
// All rules in presets are POS-conditioned where appropriate, so they don't
// fire on the wrong word class.

import { InflectionRule } from "./types";

export interface InflectionPreset {
  id: string;
  name: string;
  description: string;
  rules: InflectionRule[];
}

export const INFLECTION_PRESETS: InflectionPreset[] = [
  {
    id: "none",
    name: "None",
    description: "No inflection rules. Build your own from scratch.",
    rules: [],
  },
  {
    id: "minimal",
    name: "Minimal",
    description:
      "Just plural and past tense. Good for 'flavour' conlangs where the language only appears in names and short phrases.",
    rules: [
      { label: "plural", pattern: "s", position: "suffix", strip: "s", add: "", enabled: true, pos: "noun" },
      { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: true, pos: "verb" },
    ],
  },
  {
    id: "indo-european-basic",
    name: "Indo-European basic",
    description:
      "Plural, past tense, present participle, possessive, comparative. Covers the common cases for English/Spanish/German-flavoured conlangs.",
    rules: [
      { label: "plural", pattern: "s", position: "suffix", strip: "s", add: "", enabled: true, pos: "noun" },
      { label: "possessive", pattern: "'s", position: "suffix", strip: "'s", add: "", enabled: true, pos: "noun" },
      { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: true, pos: "verb" },
      { label: "present participle", pattern: "ing", position: "suffix", strip: "ing", add: "", enabled: true, pos: "verb" },
      { label: "comparative", pattern: "er", position: "suffix", strip: "er", add: "", enabled: true, pos: "adjective" },
    ],
  },
  {
    id: "indo-european-full",
    name: "Indo-European full",
    description:
      "Adds 3rd-person singular, past participle, superlative, and agent noun derivation. A serious starter kit.",
    rules: [
      { label: "plural", pattern: "s", position: "suffix", strip: "s", add: "", enabled: true, pos: "noun" },
      { label: "possessive", pattern: "'s", position: "suffix", strip: "'s", add: "", enabled: true, pos: "noun" },
      { label: "3rd sing.", pattern: "s", position: "suffix", strip: "s", add: "", enabled: true, pos: "verb" },
      { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: true, pos: "verb" },
      { label: "past participle", pattern: "en", position: "suffix", strip: "en", add: "", enabled: true, pos: "verb" },
      { label: "present participle", pattern: "ing", position: "suffix", strip: "ing", add: "", enabled: true, pos: "verb" },
      { label: "agent", pattern: "er", position: "suffix", strip: "er", add: "", enabled: true, pos: "verb" },
      { label: "comparative", pattern: "er", position: "suffix", strip: "er", add: "", enabled: true, pos: "adjective" },
      { label: "superlative", pattern: "est", position: "suffix", strip: "est", add: "", enabled: true, pos: "adjective" },
      { label: "adverb", pattern: "ly", position: "suffix", strip: "ly", add: "", enabled: true, pos: "adjective" },
    ],
  },
  {
    id: "agglutinative",
    name: "Agglutinative starter",
    description:
      "Case markers (nominative/accusative/genitive/dative/locative) and tense markers. Inspired by Finnish/Turkish/Quenya-style languages where each grammatical role gets its own suffix.",
    rules: [
      // The "default" nominative is unmarked (no rule).
      { label: "accusative", pattern: "n", position: "suffix", strip: "n", add: "", enabled: true, pos: "noun" },
      { label: "genitive", pattern: "in", position: "suffix", strip: "in", add: "", enabled: true, pos: "noun" },
      { label: "dative", pattern: "lle", position: "suffix", strip: "lle", add: "", enabled: true, pos: "noun" },
      { label: "locative", pattern: "ssa", position: "suffix", strip: "ssa", add: "", enabled: true, pos: "noun" },
      { label: "plural", pattern: "t", position: "suffix", strip: "t", add: "", enabled: true, pos: "noun" },
      { label: "past", pattern: "i", position: "suffix", strip: "i", add: "", enabled: true, pos: "verb" },
      { label: "future", pattern: "va", position: "suffix", strip: "va", add: "", enabled: true, pos: "verb" },
      { label: "negation", pattern: "epä", position: "prefix", strip: "epä", add: "", enabled: true },
    ],
  },
  {
    id: "analytic",
    name: "Analytic / Isolating",
    description:
      "No inflection rules — the language uses word order and particles for grammar. Pick this for Mandarin/Vietnamese-flavoured conlangs, or any language where 'grammar happens between words, not inside them'.",
    rules: [],
  },
];

export function findPreset(id: string): InflectionPreset | undefined {
  return INFLECTION_PRESETS.find((p) => p.id === id);
}
