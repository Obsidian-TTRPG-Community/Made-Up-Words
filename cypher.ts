// FanLang-style cypher engine.
//
// Algorithm (faithful to the original):
// For each character in the input, look ahead by the length of the longest
// possible match. Try to find a matching rule, prioritised by:
//   1. Input length (longer wins)
//   2. Context type (word > prefix > suffix > default)
// If a match is found, write the output and advance by the input length.
// If no match, write the original character and advance by 1.
// Sheets run sequentially: output of sheet N is input to sheet N+1.

import { CypherSheet, CypherRule, HashType } from "./types";

// "Letter" means any Unicode letter (Latin, Cyrillic, CJK, accented Latin,
// etc.). Pre-Unicode behaviour used /[A-Za-z]/ which silently broke for
// any conlang that wasn't pure ASCII.
const LETTER = /\p{L}/u;

function isLetter(ch: string | undefined): boolean {
  return !!ch && LETTER.test(ch);
}

function contextMatches(
  type: HashType,
  before: string | undefined,
  after: string | undefined
): boolean {
  const beforeIsLetter = isLetter(before);
  const afterIsLetter = isLetter(after);
  switch (type) {
    case "word":
      return !beforeIsLetter && !afterIsLetter;
    case "prefix":
      return !beforeIsLetter;
    case "suffix":
      return !afterIsLetter;
    case "default":
      return true;
  }
}

// Priority for type tiebreaking (higher wins)
const TYPE_PRIORITY: Record<HashType, number> = {
  word: 4,
  prefix: 3,
  suffix: 2,
  default: 1,
};

interface IndexedSheet {
  // Rules grouped by input length, sorted by length descending
  byLength: Array<{ len: number; rules: CypherRule[] }>;
  maxLen: number;
  // Case-preserved lookup: lowercase input -> rules
  rulesByLowerInput: Map<string, CypherRule[]>;
}

function indexSheet(sheet: CypherSheet): IndexedSheet {
  const enabled = sheet.rules.filter((r) => r.enabled && r.input.length > 0);
  const lengths = new Map<number, CypherRule[]>();
  const byLowerInput = new Map<string, CypherRule[]>();
  let maxLen = 0;
  for (const r of enabled) {
    const len = r.input.length;
    if (len > maxLen) maxLen = len;
    if (!lengths.has(len)) lengths.set(len, []);
    lengths.get(len)!.push(r);
    const lower = r.input.toLowerCase();
    if (!byLowerInput.has(lower)) byLowerInput.set(lower, []);
    byLowerInput.get(lower)!.push(r);
  }
  const byLength = Array.from(lengths.entries())
    .map(([len, rules]) => ({ len, rules }))
    .sort((a, b) => b.len - a.len);
  return { byLength, maxLen, rulesByLowerInput: byLowerInput };
}

// Preserve casing of the input segment when writing the output.
// - All upper -> all upper
// - First letter capitalised -> capitalise first letter of output
// - Otherwise -> lowercase
function preserveCasing(inputSegment: string, output: string): string {
  if (inputSegment.length === 0) return output;
  const allUpper =
    inputSegment === inputSegment.toUpperCase() &&
    inputSegment !== inputSegment.toLowerCase();
  if (allUpper) return output.toUpperCase();
  const firstUpper =
    inputSegment[0] === inputSegment[0].toUpperCase() &&
    inputSegment[0] !== inputSegment[0].toLowerCase();
  if (firstUpper) {
    return output.charAt(0).toUpperCase() + output.slice(1);
  }
  return output;
}

function findBestMatch(
  text: string,
  index: number,
  indexed: IndexedSheet
): { rule: CypherRule; matched: string } | null {
  const remaining = text.length - index;
  const maxCheck = Math.min(indexed.maxLen, remaining);

  // Walk from longest to shortest length we have rules for
  for (const { len } of indexed.byLength) {
    if (len > maxCheck) continue;
    const segment = text.substring(index, index + len);
    const lower = segment.toLowerCase();
    const candidates = indexed.rulesByLowerInput.get(lower);
    if (!candidates) continue;

    const before = index > 0 ? text[index - 1] : undefined;
    const after = index + len < text.length ? text[index + len] : undefined;

    // Among candidates of this length, pick highest-priority type
    let best: CypherRule | null = null;
    let bestPriority = -1;
    for (const r of candidates) {
      if (r.input.length !== len) continue;
      if (!contextMatches(r.type, before, after)) continue;
      const p = TYPE_PRIORITY[r.type];
      if (p > bestPriority) {
        best = r;
        bestPriority = p;
      }
    }
    if (best) {
      return { rule: best, matched: segment };
    }
  }
  return null;
}

function applySheet(text: string, sheet: CypherSheet): string {
  if (!sheet.enabled) return text;
  const indexed = indexSheet(sheet);
  if (indexed.maxLen === 0) return text;

  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const match = findBestMatch(text, i, indexed);
    if (match) {
      out.push(preserveCasing(match.matched, match.rule.output));
      i += match.matched.length;
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join("");
}

export function applyCypher(text: string, sheets: CypherSheet[]): string {
  let current = text;
  for (const sheet of sheets) {
    current = applySheet(current, sheet);
  }
  return current;
}

// Reverse lookup is not strictly possible for an arbitrary cypher
// (substitutions can collide). But for the curated dictionary case we
// can attempt a best-effort reverse by running each sheet's rules backwards.
// We expose this as a separate function so callers know its limitations.
export function applyCypherReverse(text: string, sheets: CypherSheet[]): string {
  // Reverse the sheet order, and within each sheet flip input/output
  const reversedSheets: CypherSheet[] = sheets
    .slice()
    .reverse()
    .map((s) => ({
      name: s.name,
      enabled: s.enabled,
      rules: s.rules.map((r) => ({
        input: r.output,
        output: r.input,
        type: r.type,
        enabled: r.enabled,
      })),
    }));
  return applyCypher(text, reversedSheets);
}
