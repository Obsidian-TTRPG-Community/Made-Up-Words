// Smoke test for the cypher engine.

import { applyCypher } from "./cypher";
import { CypherSheet } from "./types";

// Word substitutions run FIRST, then sound changes.
const sheets: CypherSheet[] = [
  {
    name: "Common Words",
    enabled: true,
    rules: [
      { input: "the", output: "ka", type: "word", enabled: true },
      { input: "and", output: "vel", type: "word", enabled: true },
    ],
  },
  {
    name: "Sounds",
    enabled: true,
    rules: [
      { input: "th", output: "dh", type: "default", enabled: true },
      { input: "sh", output: "sk", type: "default", enabled: true },
    ],
  },
  {
    name: "Vowels",
    enabled: true,
    rules: [
      { input: "a", output: "ae", type: "default", enabled: true },
      { input: "e", output: "i", type: "default", enabled: true },
    ],
  },
];

function expect(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: "${actual}"${ok ? "" : ` (expected "${expected}")`}`);
  if (!ok) process.exitCode = 1;
}

expect("Word rule isolates whole words", applyCypher("the there", sheets), "kae dhiri");
expect("Sequential sheets", applyCypher("shape", sheets), "skaepi");

const longSheet: CypherSheet[] = [
  {
    name: "test",
    enabled: true,
    rules: [
      { input: "a", output: "X", type: "default", enabled: true },
      { input: "abc", output: "Y", type: "default", enabled: true },
    ],
  },
];
expect("Longer match wins", applyCypher("abc", longSheet), "Y");

expect("Casing preserved (title)", applyCypher("The", sheets), "Kae");
expect("Casing preserved (upper)", applyCypher("THE", sheets), "KAE");
expect("Punctuation untouched", applyCypher("the, and!", sheets), "kae, vil!");

const a = applyCypher("hello world", sheets);
const b = applyCypher("hello world", sheets);
expect("Deterministic", a, b);
expect("Empty input", applyCypher("", sheets), "");

const prefixSheet: CypherSheet[] = [
  { name: "test", enabled: true, rules: [{ input: "un", output: "ZZ", type: "prefix", enabled: true }] },
];
expect("Prefix matches at word start", applyCypher("undo", prefixSheet), "ZZdo");
expect("Prefix does not match mid-word", applyCypher("fun", prefixSheet), "fun");

const suffixSheet: CypherSheet[] = [
  { name: "test", enabled: true, rules: [{ input: "ing", output: "ZZ", type: "suffix", enabled: true }] },
];
expect("Suffix matches at word end", applyCypher("running", suffixSheet), "runnZZ");
expect("Suffix does not match mid-word", applyCypher("ingot", suffixSheet), "ingot");

const disabledSheet: CypherSheet[] = [
  {
    name: "test",
    enabled: true,
    rules: [
      { input: "a", output: "X", type: "default", enabled: false },
      { input: "b", output: "Y", type: "default", enabled: true },
    ],
  },
];
expect("Disabled rule skipped", applyCypher("ab", disabledSheet), "aY");

const disabledSheetTest: CypherSheet[] = [
  { name: "test", enabled: false, rules: [{ input: "a", output: "X", type: "default", enabled: true }] },
];
expect("Disabled sheet skipped", applyCypher("a", disabledSheetTest), "a");

console.log("\nDone.");
