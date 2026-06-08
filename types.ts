// Shared types for the Conlang plugin

export type HashType = "word" | "prefix" | "suffix" | "default";

export interface CypherRule {
  input: string;
  output: string;
  type: HashType;
  enabled: boolean;
}

export interface CypherSheet {
  name: string;
  enabled: boolean;
  rules: CypherRule[];
}

export interface DictionaryEntry {
  // The conlang form (the key in the dictionary). For phrase entries this
  // can contain spaces — set via frontmatter `word:` to override the filename.
  word: string;
  // The English translation/definition
  definition: string;
  // Source file path inside the vault
  path: string;
  // Optional metadata read from frontmatter
  partOfSpeech?: string;
  ipa?: string;
  etymology?: string;
  notes?: string;
  language?: string;
  // File modification time, used for "recently added" sorting in the browser
  mtime?: number;
  // For proper-noun entries: what category of named thing (character, place,
  // faction, etc.). Free-form string; we suggest common values in the UI.
  nameCategory?: string;
  // The first paragraph of the note body, used for richer hover tooltips on
  // proper nouns. Captured at dictionary-load time from the markdown body
  // (skipping frontmatter and the H1 heading).
  bodyPreview?: string;
  // True if this entry's word contains a space (i.e. it's a multi-word
  // phrase). Computed at load time, not stored separately in frontmatter.
  isPhrase?: boolean;
  // The number of words in this entry's surface form (1 for single words,
  // 2+ for phrases). Used by the phrase matcher to scan longest-first.
  wordCount?: number;
  // Optional: conlang words this entry decomposes into. For transparent
  // compounds like "kala-vren" (eye-water = tear), `parts: ["kala", "vren"]`
  // lets the plugin show what each piece means on hover. Free-form list.
  parts?: string[];
}

export interface InflectionRule {
  // A descriptive label shown on hover, e.g. "plural", "past tense", "genitive"
  label: string;
  // The suffix or prefix pattern this rule matches (just letters, no slashes)
  pattern: string;
  // Where the pattern is found
  position: "suffix" | "prefix";
  // What to strip from the word to get back to the lemma. Usually equal to
  // `pattern`, but can be different for cases like English -ies → -y.
  strip: string;
  // What to add back after stripping, to reconstruct the lemma.
  // Empty string for simple chop-off cases.
  add: string;
  // Toggle without deleting
  enabled: boolean;
  // Optional: restrict this rule to entries with a specific part of speech.
  // Empty/undefined means "applies to any POS". Comma-separated values let
  // a single rule cover multiple POS (e.g. "noun,proper-noun").
  pos?: string;
  // Optional: user-written explanation shown as a hover tooltip in the
  // panel. Overrides the built-in explanation for common labels. Useful
  // when you invent a custom inflection category your conlang needs.
  description?: string;
}

export interface LanguageConfig {
  // Display name of the language
  name: string;
  // Folder containing dictionary entries (one .md file per word)
  dictionaryFolder: string;
  // Cypher sheets used for translation when a word isn't in the dictionary
  sheets: CypherSheet[];
  // If true, hovering a recognised conlang word shows its English definition
  hoverEnabled: boolean;
  // Optional morphological rules used when a direct dictionary lookup misses.
  // Tried in order; first match wins.
  inflections?: InflectionRule[];
}

export interface ConlangSettings {
  languages: LanguageConfig[];
  // List of languages currently "active" — hover, lookup, and dictionary
  // queries check all of them. Multiple languages let GM-style users see
  // every translation of a concept at once. (New in v0.13.)
  activeLanguages: string[];
  // Which language new entries default to, and the target for English→conlang
  // translation. Must be one of the active languages.
  primaryLanguage: string;
  // Legacy single-language field. Kept for backwards compat on migration;
  // not used directly anymore. Migration code reads this and populates
  // activeLanguages/primaryLanguage if they're empty.
  activeLanguage?: string;
  // When committing a translation, wrap it with this syntax so we can find it again
  commitWrapper: "footnote-style" | "html-tooltip" | "wikilink";
  // Modifier key required for hover tooltip to appear. "none" = always-on
  // (the old behaviour), "shift"/"alt"/"ctrl" require holding that key.
  // Default "shift" because always-on is too intrusive — multiple testers said so.
  hoverModifier: "none" | "shift" | "alt" | "ctrl";
  // What to show in the hover tooltip when a word has no dictionary entry.
  // "cypher" = the cyphered form (default — the existing behaviour),
  // "nothing" = no tooltip at all (less noise for users who only care about dictionary).
  hoverFallback: "cypher" | "nothing";
  // Set to true after the user has seen the first-run welcome notice.
  // Persisted in settings so the message only appears once per install.
  hasSeenWelcome?: boolean;
  // === Known-word highlighting (v0.16) ===
  // Master switch: visually mark words in notes that the plugin recognises,
  // both in the editor (Live Preview / Source) and in Reading view.
  highlightKnownWords: boolean;
  // Visual treatment for highlighted words. "underline" = subtle dotted
  // underline + accent colour (default, least intrusive), "italic" = render
  // in italics, "background" = faint highlighter background.
  highlightStyle: "underline" | "italic" | "background";
  // Highlight conlang headwords — words that exist as dictionary entries in
  // any active language (including inflected forms and known phrases).
  highlightConlang: boolean;
  // Highlight English terms the dictionary can translate (e.g. "cat" when a
  // word meaning cat exists). Useful for spotting "I have a word for this",
  // but noisier in English-heavy notes.
  highlightEnglish: boolean;
}

export const DEFAULT_SETTINGS: ConlangSettings = {
  languages: [
    {
      name: "Example",
      dictionaryFolder: "Made Up Words/Example",
      hoverEnabled: true,
      inflections: [
        // Default rules use POS conditioning so they only fire on appropriate words.
        // Edit these in Settings → Made Up Words → Inflection rules, or apply a preset.
        { label: "plural", pattern: "th", position: "suffix", strip: "th", add: "", enabled: true, pos: "noun" },
        { label: "genitive", pattern: "en", position: "suffix", strip: "en", add: "", enabled: true, pos: "noun" },
      ],
      // Sheets run top-to-bottom. Put whole-word substitutions FIRST,
      // before sound changes mangle the input beyond recognition.
      sheets: [
        {
          name: "Common Words",
          enabled: true,
          rules: [
            { input: "the", output: "ka", type: "word", enabled: true },
            { input: "and", output: "vel", type: "word", enabled: true },
            { input: "of", output: "no", type: "word", enabled: true },
          ],
        },
        {
          name: "Sounds",
          enabled: true,
          rules: [
            { input: "th", output: "dh", type: "default", enabled: true },
            { input: "sh", output: "sk", type: "default", enabled: true },
            { input: "ch", output: "kh", type: "default", enabled: true },
            { input: "ph", output: "f", type: "default", enabled: true },
          ],
        },
        {
          name: "Vowels",
          enabled: true,
          rules: [
            { input: "a", output: "ae", type: "default", enabled: true },
            { input: "e", output: "i", type: "default", enabled: true },
            { input: "o", output: "u", type: "default", enabled: true },
          ],
        },
      ],
    },
  ],
  activeLanguages: ["Example"],
  primaryLanguage: "Example",
  commitWrapper: "html-tooltip",
  hoverModifier: "shift",
  hoverFallback: "cypher",
  highlightKnownWords: true,
  highlightStyle: "underline",
  highlightConlang: true,
  highlightEnglish: true,
};
