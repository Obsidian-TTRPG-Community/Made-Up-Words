// Tests for the gloss builder.

import { glossEnglishToConlang, glossConlangToEnglish, GlossToken } from "./gloss";
import { DictionaryEntry, LanguageConfig } from "./types";

// Lightweight fake Dictionary that satisfies the structural type used by gloss.
class FakeDictionary {
  private byWord = new Map<string, DictionaryEntry>();
  private byEnglish = new Map<string, DictionaryEntry[]>();
  private phrasesList: DictionaryEntry[] = [];
  add(word: string, definition: string, partOfSpeech?: string, isPhrase = false, wordCount = 1) {
    const entry: DictionaryEntry = {
      word, definition, path: `fake/${word}.md`,
      partOfSpeech,
      isPhrase: isPhrase || /\s/.test(word),
      wordCount: word.split(/\s+/).length,
    };
    this.byWord.set(word.toLowerCase(), entry);
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
  lookup(w: string) { return this.byWord.get(w.toLowerCase()); }
  lookupEnglish(s: string) { return this.byEnglish.get(s.toLowerCase()) ?? []; }
  allPhrases() { return this.phrasesList; }
  allWords() { return Array.from(this.byWord.keys()); }
  allEntries() { return Array.from(this.byWord.values()); }
  clear() { this.byWord.clear(); this.byEnglish.clear(); this.phrasesList = []; }
}

const lang: LanguageConfig = { name: "Test", dictionaryFolder: "x", hoverEnabled: true, sheets: [] };

function expect(label: string, ok: boolean, info?: any) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  ${JSON.stringify(info)}`}`);
  if (!ok) process.exitCode = 1;
}

// === Multi-sense lookup ===
{
  const d = new FakeDictionary();
  // Two distinct entries that both translate "see"
  d.add("sen", "see, perceive visually", "verb");
  d.add("tarin", "see, understand", "verb");

  const tokens = glossEnglishToConlang("I see the truth", d as any, lang);
  const seeToken = tokens.find((t) => t.source === "see");
  expect("Multi-sense: both candidates returned", (seeToken?.candidates?.length ?? 0) === 2, seeToken);
  expect("Multi-sense: first candidate is correct entry", seeToken?.candidates?.[0]?.word === "sen", seeToken);
}

// === Cypher fallback labelled correctly ===
{
  const d = new FakeDictionary();
  d.add("kala", "water");
  const langWithCypher: LanguageConfig = {
    name: "Test", dictionaryFolder: "x", hoverEnabled: true,
    sheets: [{ name: "s", enabled: true, rules: [{ input: "th", output: "dh", type: "default", enabled: true }] }],
  };
  // "thank" contains "th" so cypher will transform it; "water" hits dictionary
  const tokens = glossEnglishToConlang("thank the water", d as any, langWithCypher);
  const thank = tokens.find((t) => t.source === "thank");
  expect("Cypher fallback labelled", thank?.kind === "cypher-fallback", thank);
  const water = tokens.find((t) => t.source === "water");
  expect("Dictionary match labelled", water?.kind === "dictionary", water);
}

// === Phrase recognition in English→conlang ===
{
  const d = new FakeDictionary();
  d.add("kalvas", "good morning", "interjection");
  const tokens = glossEnglishToConlang("She said good morning", d as any, lang);
  const phrase = tokens.find((t) => t.kind === "phrase");
  expect("Phrase recognised in English direction", phrase?.candidates?.[0]?.word === "kalvas", phrase);
}

// === No match returned as no-match (not invented) ===
{
  const d = new FakeDictionary();
  const tokens = glossEnglishToConlang("xyzzy", d as any, null);
  const t = tokens.find((t) => t.kind !== "separator");
  expect("Unknown word returns no-match (no lang)", t?.kind === "no-match", t);
}

// === Conlang→English: dictionary vs inflected vs cypher-fallback ===
{
  const d = new FakeDictionary();
  d.add("kala", "water", "noun");
  const inflectLang: LanguageConfig = {
    name: "Test", dictionaryFolder: "x", hoverEnabled: true, sheets: [],
    inflections: [{ label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true, pos: "noun" }],
  };
  const tokens = glossConlangToEnglish("kala kalath xyz", d as any, inflectLang);
  const t1 = tokens.find((t) => t.source === "kala");
  expect("Conlang→English: direct dictionary", t1?.kind === "dictionary", t1);
  const t2 = tokens.find((t) => t.source === "kalath");
  expect("Conlang→English: inflected detected", t2?.kind === "inflected", t2);
  expect("Conlang→English: inflection label", t2?.inflection?.label === "plural", t2);
  const t3 = tokens.find((t) => t.source === "xyz");
  expect("Conlang→English: unknown is no-match", t3?.kind === "no-match", t3);
}

// === English→conlang: typing a known conlang word recognises it ===
// Bug: user types "Sarhang" (a conlang proper noun with definition "General")
// in English→conlang direction. Old behaviour: no match, output = "Sarhang"
// (input unchanged). New behaviour: surfaces the entry so user sees its meaning.
{
  const d = new FakeDictionary();
  d.add("Sarhang", "General", "proper-noun");
  const tokens = glossEnglishToConlang("Sarhang", d as any, lang);
  const t = tokens.find((t) => t.source === "Sarhang");
  expect("Conlang word typed in English direction recognised", t?.kind === "dictionary", t);
  expect("...with the original entry as candidate", t?.candidates?.[0]?.word === "Sarhang", t);
}

console.log("\nDone.");
