// Inflection matching.
//
// Given a word that doesn't appear in the dictionary directly, try each
// inflection rule in order. For each rule:
//   1. Check the word matches the rule's pattern (suffix or prefix).
//   2. Strip the indicated text, then prepend/append `add` to reconstruct
//      a candidate lemma.
//   3. Look the candidate up in the dictionary.
//   4. If found, return the entry plus a description of the inflection.
//
// Rules are tried in order; first match wins. This is a deliberately
// constrained model: it handles affixational morphology (suffixes/prefixes
// with optional respelling) but not Semitic root templates, ablaut, or
// reduplication. That's fine for v1 — the goal is to cover the 80% case.

import { InflectionRule, DictionaryEntry } from "./types";
import { Dictionary } from "./dictionary";

export interface InflectionMatch {
  // The dictionary entry for the lemma we found.
  lemma: DictionaryEntry;
  // The rule that matched, so we can show a label like "plural".
  rule: InflectionRule;
  // The original inflected form (for display).
  inflectedForm: string;
}

export function findInflection(
  word: string,
  dictionary: Dictionary,
  rules: InflectionRule[] | undefined
): InflectionMatch | null {
  if (!rules || rules.length === 0) return null;
  const lower = word.toLowerCase();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.pattern) continue;

    const candidate = tryRule(lower, rule);
    if (!candidate) continue;
    if (candidate === lower) continue; // rule didn't actually change anything

    const entry = dictionary.lookup(candidate);
    if (!entry) continue;

    // If the rule has a POS filter, the lemma must match one of the allowed
    // parts of speech. Rules with no POS filter apply to any entry.
    if (!posMatches(rule.pos, entry.partOfSpeech)) continue;

    return { lemma: entry, rule, inflectedForm: word };
  }
  return null;
}

/**
 * True if a rule's POS filter accepts the entry's POS.
 * - No filter (empty/undefined) -> always accepts
 * - Filter "noun" -> entry must be exactly "noun"
 * - Filter "noun,proper-noun" -> entry must be one of those
 * - Filter "noun" but entry has no POS -> rejects (filter is strict)
 */
function posMatches(filter: string | undefined, entryPos: string | undefined): boolean {
  if (!filter || filter.trim() === "") return true;
  if (!entryPos) return false;
  const allowed = filter.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s);
  if (allowed.length === 0) return true;
  return allowed.includes(entryPos.toLowerCase());
}

function tryRule(word: string, rule: InflectionRule): string | null {
  const patt = rule.pattern.toLowerCase();
  const strip = rule.strip.toLowerCase();
  const add = rule.add.toLowerCase();

  if (rule.position === "suffix") {
    if (!word.endsWith(patt)) return null;
    if (!word.endsWith(strip)) return null; // sanity: strip should also be a suffix
    const base = word.slice(0, word.length - strip.length);
    return base + add;
  }

  if (rule.position === "prefix") {
    if (!word.startsWith(patt)) return null;
    if (!word.startsWith(strip)) return null;
    const base = word.slice(strip.length);
    return add + base;
  }

  return null;
}

// === Forward generation ===

export interface GeneratedForm {
  // The predicted inflected form (e.g. "kalath")
  form: string;
  // The rule that generated it, for labelling
  rule: InflectionRule;
}

/**
 * Generate predicted inflected forms for a lemma.
 *
 * For each enabled rule:
 *   - If the rule has a POS filter, skip rules that don't accept the lemma's POS.
 *   - Otherwise, run the rule "forward": take the lemma, undo the strip+add
 *     by reversing them, then append the pattern. The result is the predicted
 *     inflected form.
 *
 * This is the inverse of `tryRule` and `findInflection`. We deliberately
 * generate one form per matching rule, even if multiple rules would produce
 * conflicting forms — the user can see all possibilities and judge.
 *
 * Note: forward generation is not always well-defined for respelling rules.
 * If a rule says "strip: ies, add: y" (cities -> city), running it forward
 * from "city" means stripping "y" off the end and appending "ies" to get
 * "cities". That works. But edge cases exist — see the tests.
 */
export function generateInflections(
  lemma: DictionaryEntry,
  rules: InflectionRule[] | undefined
): GeneratedForm[] {
  if (!rules || rules.length === 0) return [];
  const out: GeneratedForm[] = [];
  const word = lemma.word.toLowerCase();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.pattern) continue;

    // Skip rules whose POS filter doesn't accept this lemma's POS
    if (!posMatches(rule.pos, lemma.partOfSpeech)) continue;

    const generated = applyRuleForward(word, rule);
    if (!generated) continue;
    if (generated === word) continue; // rule didn't change anything

    out.push({ form: generated, rule });
  }
  return out;
}

/**
 * Apply a rule "forward": take a lemma and produce the inflected form.
 *
 * For a suffix rule with pattern P, strip S, add A:
 *   The lemma is expected to end with A (the "add-back").
 *   We undo it by stripping A off the end, then appending S (which equals P in the simple case).
 *
 * For most rules, A is empty, so we just append the pattern.
 */
function applyRuleForward(lemma: string, rule: InflectionRule): string | null {
  const patt = rule.pattern.toLowerCase();
  const strip = rule.strip.toLowerCase();
  const add = rule.add.toLowerCase();

  if (rule.position === "suffix") {
    // If `add` is non-empty, the lemma is expected to end with `add`.
    // Strip that off and append the pattern.
    if (add.length > 0) {
      if (!lemma.endsWith(add)) return null;
      const base = lemma.slice(0, lemma.length - add.length);
      return base + strip;
    }
    // Simple chop-off rule: just append the pattern.
    return lemma + patt;
  }

  if (rule.position === "prefix") {
    if (add.length > 0) {
      if (!lemma.startsWith(add)) return null;
      const base = lemma.slice(add.length);
      return strip + base;
    }
    return patt + lemma;
  }

  return null;
}
