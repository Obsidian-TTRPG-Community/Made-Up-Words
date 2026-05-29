// Smoke tests for the inflection matcher.

import { findInflection } from "./inflection";
import { Dictionary } from "./dictionary";
import { InflectionRule, DictionaryEntry } from "./types";

// Build a fake Dictionary that just wraps a Map. We don't need the full
// vault-aware loader for these tests.
class FakeDictionary {
  private byWord = new Map<string, DictionaryEntry>();
  add(word: string, definition: string) {
    this.byWord.set(word.toLowerCase(), {
      word, definition, path: `fake/${word}.md`,
    });
  }
  lookup(w: string): DictionaryEntry | undefined {
    return this.byWord.get(w.toLowerCase());
  }
  // Stub methods that satisfy the type-shape we use (we cast as any)
  lookupEnglish() { return []; }
  allWords() { return Array.from(this.byWord.keys()); }
  allEntries() { return Array.from(this.byWord.values()); }
  clear() { this.byWord.clear(); }
}

function expect<T>(label: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`}`);
  if (!ok) process.exitCode = 1;
}

const dict = new FakeDictionary();
dict.add("kala", "water");
dict.add("drennith", "the sea");
dict.add("vren", "eye");

// Simple suffix rule: -ath = plural, strip "ath" add ""
// Actually example default is suffix "th" stripped to "" -- let's match that style.
const rules: InflectionRule[] = [
  { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true },
  { label: "genitive", pattern: "en", position: "suffix", strip: "en", add: "", enabled: true },
];

// Test 1: kalath -> kala (plural)
const m1 = findInflection("kalath", dict as any, rules);
expect("Recognises plural", m1?.lemma.word, "kala");
expect("Returns plural label", m1?.rule.label, "plural");

// Test 2: kalaen -> kala (genitive)
const m2 = findInflection("kalaen", dict as any, rules);
expect("Recognises genitive", m2?.lemma.word, "kala");

// Test 3: word that's already a lemma should fall through to first matching
// rule and try to strip. "kala" itself ends in "a" not "th", so no match.
const m3 = findInflection("kala", dict as any, rules);
expect("Lemma itself doesn't match", m3, null);

// Test 4: word that doesn't end in any known suffix
const m4 = findInflection("xyzzy", dict as any, rules);
expect("Unknown word returns null", m4, null);

// Test 5: word ending in -th but whose stem isn't in the dictionary
// e.g. "moth" -> "mo" which doesn't exist
const m5 = findInflection("moth", dict as any, rules);
expect("Stem not in dictionary returns null", m5, null);

// Test 6: case-insensitive
const m6 = findInflection("Kalath", dict as any, rules);
expect("Case-insensitive match", m6?.lemma.word, "kala");

// Test 7: disabled rule is skipped
const disabledRules: InflectionRule[] = [
  { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: false },
];
const m7 = findInflection("kalath", dict as any, disabledRules);
expect("Disabled rule skipped", m7, null);

// Test 8: rule with add (English -ies -> -y style)
// Cities -> city: pattern "ies", strip "ies", add "y"
const respellRules: InflectionRule[] = [
  { label: "plural", pattern: "ies", position: "suffix", strip: "ies", add: "y", enabled: true },
];
const dict2 = new FakeDictionary();
dict2.add("city", "place where people live");
const m8 = findInflection("cities", dict2 as any, respellRules);
expect("Respelling rule (-ies -> -y)", m8?.lemma.word, "city");

// Test 9: prefix rule. e.g. negation prefix "un-"
const prefixRules: InflectionRule[] = [
  { label: "negation", pattern: "un", position: "prefix", strip: "un", add: "", enabled: true },
];
const dict3 = new FakeDictionary();
dict3.add("happy", "joyful");
const m9 = findInflection("unhappy", dict3 as any, prefixRules);
expect("Prefix rule", m9?.lemma.word, "happy");

// Test 10: order matters - first matching rule wins.
// If we have a "-th" plural AND a "-ath" causative, and the word is "kalath",
// the order in the rules list decides which one is tried first.
const ordered: InflectionRule[] = [
  { label: "causative", pattern: "ath", position: "suffix", strip: "ath", add: "", enabled: true },
  { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true },
];
// kalath stripped of "ath" gives "kal" - not in dictionary, falls through
// kalath stripped of "th" gives "kala" - in dictionary, matches
const m10 = findInflection("kalath", dict as any, ordered);
expect("Falls through when first rule's stem not in dict", m10?.rule.label, "plural");

// === POS conditioning ===

class PosDictionary {
  private byWord = new Map<string, DictionaryEntry>();
  add(word: string, definition: string, partOfSpeech?: string) {
    this.byWord.set(word.toLowerCase(), { word, definition, path: `fake/${word}.md`, partOfSpeech });
  }
  lookup(w: string): DictionaryEntry | undefined { return this.byWord.get(w.toLowerCase()); }
  lookupEnglish() { return []; }
  allWords() { return Array.from(this.byWord.keys()); }
  allEntries() { return Array.from(this.byWord.values()); }
  clear() { this.byWord.clear(); }
}

// Test 11: rule with POS filter only matches entries of that POS
const posDict = new PosDictionary();
posDict.add("walk", "to move on foot", "verb");
posDict.add("cat", "feline", "noun");
const verbOnlyRule: InflectionRule[] = [
  { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: true, pos: "verb" },
];
const m11a = findInflection("walked", posDict as any, verbOnlyRule);
expect("POS-gated rule matches verb", m11a?.lemma.word, "walk");

// Test 12: same rule misses on a non-verb candidate
// "catted" -> "cat" which IS in the dictionary, but as a noun, so the
// verb-only rule should refuse to match.
const m12 = findInflection("catted", posDict as any, verbOnlyRule);
expect("POS-gated rule rejects wrong POS", m12, null);

// Test 13: comma-separated POS filter
const multiPosRule: InflectionRule[] = [
  { label: "plural", pattern: "s", position: "suffix", strip: "s", add: "", enabled: true, pos: "noun,proper-noun" },
];
const posDict2 = new PosDictionary();
posDict2.add("cat", "feline", "noun");
posDict2.add("Alice", "a name", "proper-noun");
const m13a = findInflection("cats", posDict2 as any, multiPosRule);
expect("Multi-POS filter matches first option", m13a?.lemma.word, "cat");
const m13b = findInflection("Alices", posDict2 as any, multiPosRule);
expect("Multi-POS filter matches second option", m13b?.lemma.word, "Alice");

// Test 14: filter strict — entry with no POS is rejected by a filtered rule
const posDict3 = new PosDictionary();
posDict3.add("walk", "to move on foot"); // no POS set
const m14 = findInflection("walked", posDict3 as any, verbOnlyRule);
expect("Filtered rule rejects POS-less entry", m14, null);

// Test 15: rule with no POS filter accepts POS-less entry (backwards compat)
const noFilter: InflectionRule[] = [
  { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: true },
];
const m15 = findInflection("walked", posDict3 as any, noFilter);
expect("Unfiltered rule accepts POS-less entry", m15?.lemma.word, "walk");

// === Forward generation ===

import { generateInflections } from "./inflection";

// Build a simple entry for forward-gen tests
const verbEntry: DictionaryEntry = {
  word: "delete", definition: "to remove", path: "fake/delete.md", partOfSpeech: "verb",
};
const nounEntry: DictionaryEntry = {
  word: "kala", definition: "water", path: "fake/kala.md", partOfSpeech: "noun",
};

const verbAndNounRules: InflectionRule[] = [
  { label: "past", pattern: "d", position: "suffix", strip: "d", add: "", enabled: true, pos: "verb" },
  { label: "present participle", pattern: "ing", position: "suffix", strip: "ing", add: "", enabled: true, pos: "verb" },
  { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true, pos: "noun" },
];

// Test 16: forward gen for a verb produces verb-specific forms only
const forms_verb = generateInflections(verbEntry, verbAndNounRules);
expect("Verb gets verb forms count", forms_verb.length, 2);
expect("Verb past form", forms_verb[0].form, "deleted");
expect("Verb present participle", forms_verb[1].form, "deleteing");
// Note: "deleteing" is what the naive rule produces; real English has spelling
// rules to drop the silent 'e'. Conlangs typically don't need those rules.

// Test 17: forward gen for a noun produces noun-specific forms only
const forms_noun = generateInflections(nounEntry, verbAndNounRules);
expect("Noun gets noun forms count", forms_noun.length, 1);
expect("Noun plural form", forms_noun[0].form, "kalath");

// Test 18: POS-less rule applies to everything
const universalRule: InflectionRule[] = [
  { label: "emphatic", pattern: "!", position: "suffix", strip: "!", add: "", enabled: true },
];
const forms_universal_verb = generateInflections(verbEntry, universalRule);
expect("Universal rule applies to verbs", forms_universal_verb.length, 1);
const forms_universal_noun = generateInflections(nounEntry, universalRule);
expect("Universal rule applies to nouns", forms_universal_noun.length, 1);

// Test 19: respelling rule (English -ies -> -y)
// Going FORWARD: lemma "city" -> we expect "cities".
// Rule says strip "ies", add "y". Forward, we expect lemma to end with "y",
// strip it, append "ies" -> "cities".
const respellingRule: InflectionRule[] = [
  { label: "plural", pattern: "ies", position: "suffix", strip: "ies", add: "y", enabled: true, pos: "noun" },
];
const cityEntry: DictionaryEntry = {
  word: "city", definition: "place", path: "fake/city.md", partOfSpeech: "noun",
};
const forms_respell = generateInflections(cityEntry, respellingRule);
expect("Respelling rule forward", forms_respell[0]?.form, "cities");

// Test 20: respelling rule where lemma doesn't end with `add` is skipped
const carEntry: DictionaryEntry = {
  word: "car", definition: "vehicle", path: "fake/car.md", partOfSpeech: "noun",
};
const forms_skip = generateInflections(carEntry, respellingRule);
expect("Respelling rule skips when add doesn't match", forms_skip.length, 0);

// Test 21: prefix rule going forward
const prefixRule: InflectionRule[] = [
  { label: "negation", pattern: "un", position: "prefix", strip: "un", add: "", enabled: true },
];
const happyEntry: DictionaryEntry = {
  word: "happy", definition: "joyful", path: "fake/happy.md", partOfSpeech: "adjective",
};
const forms_prefix = generateInflections(happyEntry, prefixRule);
expect("Prefix rule forward", forms_prefix[0]?.form, "unhappy");

// Test 22: disabled rule produces no form
const disabledForward: InflectionRule[] = [
  { label: "past", pattern: "ed", position: "suffix", strip: "ed", add: "", enabled: false, pos: "verb" },
];
const forms_disabled = generateInflections(verbEntry, disabledForward);
expect("Disabled rule skipped in forward", forms_disabled.length, 0);

console.log("\nDone.");
