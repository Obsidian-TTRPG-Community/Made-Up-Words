// Tests for the phrase matcher.

import { tokeniseWithPhrases, matchPhraseAtStart, MatchedToken } from "./phrases";
import { DictionaryEntry } from "./types";

function mkPhrase(word: string, definition: string): DictionaryEntry {
  return {
    word,
    definition,
    path: `fake/${word}.md`,
    isPhrase: true,
    wordCount: word.split(/\s+/).length,
  };
}

function expect(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n  got:  ${JSON.stringify(actual)}\n  want: ${JSON.stringify(expected)}`}`);
  if (!ok) process.exitCode = 1;
}

// === Setup ===

const phrases: DictionaryEntry[] = [
  mkPhrase("good morning", "greeting"),
  mkPhrase("good", "well"), // Single-word — should not appear in phrases list
  mkPhrase("by the way", "incidentally"),
  mkPhrase("kala vren", "tear (compound)"),
];
// Filter to only true phrases (matcher expects pre-filtered list)
const phrasesOnly = phrases.filter((p) => p.isPhrase && (p.wordCount ?? 0) >= 2);
phrasesOnly.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));

// === Tests ===

// 1. Simple phrase match in middle of sentence
{
  const tokens = tokeniseWithPhrases("She said good morning to him", phrasesOnly);
  // Tokens should include the phrase as one unit
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Phrase matched in sentence", phraseTok?.entry?.word, "good morning");
}

// 2. Longest match wins (kala vren before kala alone if both existed)
{
  const tokens = tokeniseWithPhrases("kala vren falls", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Longest match wins", phraseTok?.entry?.word, "kala vren");
}

// 3. Phrase NOT matched when punctuation breaks it
{
  const tokens = tokeniseWithPhrases("good, morning star", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Punctuation breaks phrase", phraseTok, undefined);
}

// 4. Punctuation AFTER the phrase is fine
{
  const tokens = tokeniseWithPhrases("Said good morning.", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Trailing punctuation OK", phraseTok?.entry?.word, "good morning");
}

// 5. Case insensitive
{
  const tokens = tokeniseWithPhrases("Good Morning everyone", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Case insensitive", phraseTok?.entry?.word, "good morning");
}

// 6. Multiple spaces between words still matches
{
  const tokens = tokeniseWithPhrases("good   morning", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  expect("Multiple spaces allowed", phraseTok?.entry?.word, "good morning");
}

// 7. matchPhraseAtStart returns first phrase
{
  const m = matchPhraseAtStart("by the way that's interesting", phrasesOnly);
  expect("matchPhraseAtStart finds phrase", m?.entry.word, "by the way");
  expect("matchPhraseAtStart returns matched text", m?.matchedText, "by the way");
}

// 8. matchPhraseAtStart returns null if first word isn't a phrase
{
  const m = matchPhraseAtStart("interesting by the way", phrasesOnly);
  expect("matchPhraseAtStart respects ordering", m, null);
}

// 9. Empty input
{
  const tokens = tokeniseWithPhrases("", phrasesOnly);
  expect("Empty input returns empty", tokens, []);
}

// 10. Reconstructs text faithfully (concat all tokens = original)
{
  const input = "Said good morning. Then, by the way, left.";
  const tokens = tokeniseWithPhrases(input, phrasesOnly);
  const reconstructed = tokens.map((t) => t.text).join("");
  expect("Reconstruction faithful", reconstructed, input);
  // Should have matched both phrases
  const phraseCount = tokens.filter((t) => t.kind === "phrase").length;
  expect("Both phrases matched", phraseCount, 2);
}

// 11. Phrase doesn't match across newlines
{
  const tokens = tokeniseWithPhrases("good\nmorning", phrasesOnly);
  const phraseTok = tokens.find((t) => t.kind === "phrase");
  // Newlines ARE whitespace so this technically DOES match — let's check what
  // we want. For an Obsidian dictionary plugin, matching across line breaks
  // is probably fine for short phrases, but let's verify our current behaviour.
  // Our regex /^\s+$/ accepts \n as whitespace, so this should match.
  expect("Phrase matches across whitespace including newline", phraseTok?.entry?.word, "good morning");
}

console.log("\nDone.");
