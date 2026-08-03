// Shared word-tokenisation helpers.
//
// The plugin used to use /[A-Za-z']+/ everywhere, which broke for any conlang
// using accented characters, non-Latin scripts, or compound words with
// hyphens. This module centralises the regex so behaviour is consistent.
//
// The pattern: a "word" starts with a letter (any Unicode letter, via \p{L})
// and may contain additional letters, apostrophes, or hyphens. Trailing
// punctuation is naturally excluded because the engine stops at non-letter
// non-apostrophe non-hyphen.
//
// Compounds like "kala-vren" are treated as one token because they're
// addressable as one dictionary entry. Decomposition is explicit (the
// `parts` field) rather than implicit (regex-driven).

/** Match a whole word. Use with .match(WORD_RE) or .replace(WORD_RE, ...). */
export const WORD_RE = /\p{L}[\p{L}'-]*/gu;

/** Anchored version: test whether a string IS a single word. */
export const WORD_ANCHORED_RE = /^\p{L}[\p{L}'-]*$/u;

/** Strip non-word characters from a string. Used to clean hovered text. */
export function cleanWord(s: string): string {
  return s.replace(/[^\p{L}'-]/gu, "");
}

/** Test whether a single character is part of a word. */
export function isWordChar(ch: string): boolean {
  return /[\p{L}'-]/u.test(ch);
}

/**
 * Copy the casing pattern of `source` onto `target`.
 * - source all-uppercase  -> target all-uppercase
 * - source Capitalised     -> target Capitalised
 * - otherwise              -> target unchanged
 *
 * The "has distinct cases" guard (toUpperCase !== toLowerCase) matters: a
 * source starting with a digit or a caseless character must NOT be treated
 * as capitalised, or we'd wrongly capitalise the target.
 */
export function applyCasing(source: string, target: string): string {
  if (source.length === 0 || target.length === 0) return target;
  if (
    source === source.toUpperCase() &&
    source !== source.toLowerCase()
  ) {
    return target.toUpperCase();
  }
  if (
    source[0] === source[0].toUpperCase() &&
    source[0] !== source[0].toLowerCase()
  ) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * Extract the first sense from a definition. Definitions can hold multiple
 * comma- or semicolon-separated senses ("water, liquid"); the first is the
 * primary gloss. Falls back to the whole definition if there's no separator,
 * and to an empty string if the definition is blank.
 */
export function firstSense(definition: string): string {
  return definition.split(/[,;]/)[0].trim();
}


/**
 * Default label used when a declared form arrives with no `label:` prefix.
 * Keeps a bare list (`forms: [kalath, kalen]`) usable — it degrades to
 * alias-like behaviour, but honestly labelled rather than silently unlabelled.
 */
export const DEFAULT_FORM_LABEL = "variant";

/**
 * Parse the `forms:` frontmatter property into label/form pairs.
 *
 * The canonical shape is a YAML list of "label: form" strings, because
 * Obsidian's Properties editor renders a list-of-text natively but shows
 * nested objects as an unsupported type:
 *
 *   forms:
 *     - "plural: kalath"
 *     - "genitive: kalen"
 *     - "dative: kalim, kalum"     # two forms sharing one label
 *
 * For tolerance we also accept a YAML map (`{plural: kalath}`), a list of
 * single-key maps (`- plural: kalath`), and one comma-separated string.
 *
 * Within a string, commas separate forms and the FIRST colon separates label
 * from form. A comma-separated piece with no colon inherits the preceding
 * label, so "dative: kalim, kalum" yields two dative forms rather than one
 * dative and one mystery.
 */
export function parseInflectedForms(
  value: unknown
): { label: string; form: string }[] | undefined {
  const out: { label: string; form: string }[] = [];

  // Collapse internal whitespace runs. The phrase index tokenises on /\s+/,
  // so "big  house" written with two spaces has to be stored the same way the
  // matcher will see it or the two indexes disagree about the same form.
  const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

  const pushFromString = (raw: string) => {
    let label = DEFAULT_FORM_LABEL;
    for (const piece of raw.split(",")) {
      const chunk = piece.trim();
      if (!chunk) continue;
      const colon = chunk.indexOf(":");
      if (colon >= 0) {
        const l = tidy(chunk.slice(0, colon));
        const f = tidy(chunk.slice(colon + 1));
        // A label with no form ("plural:") declares nothing — drop it, but
        // remember the label so a following bare piece attaches to it.
        if (l) label = l;
        if (f) out.push({ label, form: f });
      } else {
        out.push({ label, form: tidy(chunk) });
      }
    }
  };

  const pushFromRecord = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      const label = tidy(k);
      if (!label) continue;
      const values = Array.isArray(v) ? v : [v];
      for (const item of values) {
        if (item === null || item === undefined) continue;
        // The value may itself be comma-separated ("kalim, kalum").
        for (const f of String(item).split(",")) {
          const form = tidy(f);
          if (form) out.push({ label, form });
        }
      }
    }
  };

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item)) pushFromRecord(item);
      else if (item !== null && item !== undefined) pushFromString(String(item));
    }
  } else if (isRecord(value)) {
    pushFromRecord(value);
  } else if (typeof value === "string" && value.trim()) {
    pushFromString(value);
  } else {
    return undefined;
  }

  return out.length > 0 ? out : undefined;
}

/**
 * Parse a frontmatter field that may be a YAML list or a comma-separated
 * string into a clean string array. Trims entries and drops blanks. Returns
 * undefined when there's nothing usable. Shared by the `parts` and `aliases`
 * dictionary fields.
 */
export function parseStringList(value: unknown): string[] | undefined {
  let out: string[];
  if (Array.isArray(value)) {
    out = value.map((v) => String(v).trim());
  } else if (typeof value === "string" && value.trim()) {
    out = value.split(",").map((v) => v.trim());
  } else {
    return undefined;
  }
  out = out.filter((v) => v.length > 0);
  return out.length > 0 ? out : undefined;
}
