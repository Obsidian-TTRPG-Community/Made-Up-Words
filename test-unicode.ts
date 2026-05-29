// Tests for Unicode/edge case handling.
// These exercise the bug-shaking work — the old [A-Za-z']+ regex broke
// for accented characters, non-Latin scripts, and hyphenated compounds.

import { WORD_RE, cleanWord, isWordChar, applyCasing, firstSense } from "./word-tokens";
import { tokeniseWithPhrases } from "./phrases";
import { glossEnglishToConlang, glossConlangToEnglish } from "./gloss";
import { applyCypher } from "./cypher";
import { DictionaryEntry, LanguageConfig } from "./types";

// === Lightweight fake Dictionary (same shape as test-gloss.ts) ===
class FakeDictionary {
  private byWord = new Map<string, DictionaryEntry[]>();
  private byEnglish = new Map<string, DictionaryEntry[]>();
  private phrasesList: DictionaryEntry[] = [];
  private allList: DictionaryEntry[] = [];

  add(word: string, definition: string, partOfSpeech?: string) {
    const entry: DictionaryEntry = {
      word, definition, path: `fake/${word}.md`,
      partOfSpeech,
      isPhrase: /\s/.test(word),
      wordCount: word.split(/\s+/).length,
    };
    const key = word.toLowerCase();
    const existing = this.byWord.get(key) ?? [];
    existing.push(entry);
    this.byWord.set(key, existing);
    this.allList.push(entry);
    for (const sense of definition.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean)) {
      const list = this.byEnglish.get(sense) ?? [];
      list.push(entry);
      this.byEnglish.set(sense, list);
    }
    if (entry.isPhrase) {
      this.phrasesList.push(entry);
      this.phrasesList.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
    }
  }
  lookup(w: string) { return this.byWord.get(w.toLowerCase())?.[0]; }
  lookupAll(w: string) { return this.byWord.get(w.toLowerCase()) ?? []; }
  lookupEnglish(s: string) { return this.byEnglish.get(s.toLowerCase()) ?? []; }
  allPhrases() { return this.phrasesList; }
  allWords() { return Array.from(this.byWord.keys()); }
  allEntries() { return this.allList.slice(); }
  clear() { this.byWord.clear(); this.byEnglish.clear(); this.phrasesList = []; this.allList = []; }
}

const lang: LanguageConfig = { name: "Test", dictionaryFolder: "x", hoverEnabled: true, sheets: [] };

function expect(label: string, ok: boolean, info?: any) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  ${JSON.stringify(info)}`}`);
  if (!ok) process.exitCode = 1;
}

// === WORD_RE basics ===

{
  const result = "kalá vrën".match(WORD_RE);
  expect("Accented Latin: kalá and vrën both captured whole",
    JSON.stringify(result) === JSON.stringify(["kalá", "vrën"]), result);
}

{
  const result = "Привет мир".match(WORD_RE);
  expect("Cyrillic: both words captured",
    JSON.stringify(result) === JSON.stringify(["Привет", "мир"]), result);
}

{
  const result = "kala-vren falls".match(WORD_RE);
  expect("Hyphenated compound: kala-vren is one token",
    JSON.stringify(result) === JSON.stringify(["kala-vren", "falls"]), result);
}

{
  const result = "don't worry".match(WORD_RE);
  expect("Apostrophe: don't is one token",
    JSON.stringify(result) === JSON.stringify(["don't", "worry"]), result);
}

{
  const result = "naïve".match(WORD_RE);
  expect("Diaeresis in middle: naïve captured whole",
    JSON.stringify(result) === JSON.stringify(["naïve"]), result);
}

// === cleanWord ===

{
  expect("cleanWord strips punctuation but keeps accents",
    cleanWord("¡Hola!") === "Hola");
  expect("cleanWord preserves hyphens",
    cleanWord("kala-vren!") === "kala-vren");
  expect("cleanWord preserves apostrophes",
    cleanWord("don't.") === "don't");
}

// === isWordChar ===

{
  expect("isWordChar: accented letter", isWordChar("á"));
  expect("isWordChar: Cyrillic letter", isWordChar("П"));
  expect("isWordChar: hyphen", isWordChar("-"));
  expect("isWordChar: apostrophe", isWordChar("'"));
  expect("isWordChar: space is NOT word char", !isWordChar(" "));
  expect("isWordChar: comma is NOT word char", !isWordChar(","));
  expect("isWordChar: digit is NOT word char", !isWordChar("5"));
}

// === Tokeniser handles Unicode ===

{
  const d = new FakeDictionary();
  d.add("kalá vrën", "tear", "noun"); // phrase with accents
  const tokens = tokeniseWithPhrases("She wept kalá vrën quietly", d.allPhrases());
  const phrase = tokens.find((t) => t.kind === "phrase");
  expect("Accented phrase matched",
    phrase?.entry?.word === "kalá vrën", phrase);
}

// === Gloss handles Unicode and compounds ===

{
  const d = new FakeDictionary();
  d.add("kala-vren", "tear", "noun");
  const tokens = glossEnglishToConlang("the kala-vren falls", d as any, lang);
  const compound = tokens.find((t) => t.source === "kala-vren");
  // It's a conlang word recognised as one token (via dictionary direct match)
  expect("Hyphenated compound recognised in gloss",
    compound?.kind === "dictionary" && compound.candidates?.[0]?.word === "kala-vren",
    compound);
}

// === Cypher: word-boundary detection works with accented neighbours ===

{
  const cypherLang: LanguageConfig = {
    name: "Test", dictionaryFolder: "x", hoverEnabled: true,
    sheets: [{
      name: "test", enabled: true,
      rules: [{ input: "the", output: "ka", type: "word", enabled: true }],
    }],
  };
  // "the" with accented neighbours: word-boundary detection must treat
  // accents as letters or "the" inside "áthé" wrongly fires.
  const result = applyCypher("kalá the vrën", cypherLang.sheets);
  expect("Word-type rule matches 'the' in context with accented words",
    result === "kalá ka vrën", { result });

  // "the" embedded in non-word characters but with accented before:
  // "áthe" — 'the' should NOT match because 'á' is a letter and 'the' isn't word-bordered
  const result2 = applyCypher("áthe", cypherLang.sheets);
  expect("Word-type rule does NOT match 'the' when preceded by accented letter",
    result2 === "áthe", { result2 });
}

// === Conlang→English direction also handles Unicode ===

{
  const d = new FakeDictionary();
  d.add("kalá", "water", "noun");
  const tokens = glossConlangToEnglish("the kalá flows", d as any, lang);
  const k = tokens.find((t) => t.source === "kalá");
  expect("Conlang→English finds accented entry",
    k?.kind === "dictionary" && k.candidates?.[0]?.definition === "water", k);
}

// === Edge cases that shouldn't crash ===

{
  const d = new FakeDictionary();
  // Empty input
  const tokens1 = tokeniseWithPhrases("", []);
  expect("Empty input produces empty token list", tokens1.length === 0);

  // Only punctuation
  const tokens2 = tokeniseWithPhrases("!!!", []);
  expect("Punctuation-only input: one separator token",
    tokens2.length === 1 && tokens2[0].kind === "separator");

  // Very long single word (no crash)
  const longWord = "a".repeat(10000);
  const tokens3 = tokeniseWithPhrases(longWord, []);
  expect("10k-char word doesn't crash",
    tokens3.length === 1 && tokens3[0].kind === "word", { len: tokens3.length });
}

// === applyCasing ===

{
  expect("applyCasing: all-caps source -> all-caps target",
    applyCasing("WATER", "kala") === "KALA");
  expect("applyCasing: capitalised source -> capitalised target",
    applyCasing("Water", "kala") === "Kala");
  expect("applyCasing: lowercase source -> unchanged target",
    applyCasing("water", "kala") === "kala");
  // The bug that lived in the old main.ts copy: a source starting with a
  // non-cased character must NOT trigger capitalisation.
  expect("applyCasing: digit-leading source -> target unchanged",
    applyCasing("5th", "kala") === "kala");
  expect("applyCasing: empty source -> target unchanged",
    applyCasing("", "kala") === "kala");
  expect("applyCasing: empty target -> empty",
    applyCasing("WATER", "") === "");
  // Accented capital should still count as capitalised
  expect("applyCasing: accented capital source -> capitalised target",
    applyCasing("Été", "kala") === "Kala");
}

// === firstSense ===

{
  expect("firstSense: comma-separated takes first",
    firstSense("water, liquid, fluid") === "water");
  expect("firstSense: semicolon-separated takes first",
    firstSense("see; understand") === "see");
  expect("firstSense: no separator returns whole",
    firstSense("water") === "water");
  expect("firstSense: trims whitespace",
    firstSense("  water  , liquid") === "water");
  expect("firstSense: blank returns empty",
    firstSense("") === "");
}

console.log("\nDone.");
