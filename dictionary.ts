// Dictionary: reads word-entry notes from a folder and indexes them
// for fast lookup. Each entry is a single markdown file whose name is
// the conlang word (e.g. "kala.md") and whose frontmatter holds the
// translation and other metadata.
//
// Expected frontmatter:
//   ---
//   definition: water
//   partOfSpeech: noun
//   ipa: /ˈka.la/
//   etymology: from proto-form *kal-
//   language: Example
//   aliases: Feb, Febr        # optional: alternate forms that resolve here
//   ---
//
// Body of the note can contain freeform usage notes; we include it as `notes`.

import { App, TFile, TFolder, CachedMetadata } from "obsidian";
import { DictionaryEntry } from "./types";
import { extractBodyPreview as _extractBodyPreview } from "./body-preview";
import { parseStringList } from "./word-tokens";

export class Dictionary {
  // Conlang lookup: multiple entries possible when multiple languages
  // are active and they share a spelling (e.g. "kala" in two languages).
  private byWord: Map<string, DictionaryEntry[]> = new Map();
  private byEnglish: Map<string, DictionaryEntry[]> = new Map(); // lowercase english -> entries
  // Phrase entries sorted by word count descending. The matcher walks this
  // list to try longer phrases first, so "good morning" beats "good".
  private phrases: DictionaryEntry[] = [];
  // Ordered list of all entries in insertion order (preserves "recently
  // added" sorting and stable iteration).
  private all: DictionaryEntry[] = [];
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  clear() {
    this.byWord.clear();
    this.byEnglish.clear();
    this.phrases = [];
    this.all = [];
  }

  /**
   * Look up a conlang word and return its dictionary entry, if any.
   * Returns the FIRST match if multiple languages share the spelling.
   * Use lookupAll() to get every match.
   */
  lookup(conlangWord: string): DictionaryEntry | undefined {
    return this.byWord.get(conlangWord.toLowerCase())?.[0];
  }

  /**
   * Look up a conlang word across all loaded languages. Returns every entry
   * whose word matches, regardless of source language. Empty array if none.
   */
  lookupAll(conlangWord: string): DictionaryEntry[] {
    return this.byWord.get(conlangWord.toLowerCase()) ?? [];
  }

  /**
   * Get all phrase entries (entries whose word contains a space),
   * sorted longest-first by word count. Used by the phrase matcher.
   */
  allPhrases(): DictionaryEntry[] {
    return this.phrases;
  }

  /**
   * Look up English text and return any conlang entries that translate to it.
   * Useful for the "highlight English, translate to conlang" workflow.
   */
  lookupEnglish(english: string): DictionaryEntry[] {
    return this.byEnglish.get(english.toLowerCase()) ?? [];
  }

  /**
   * All known conlang words (lowercase). For multi-language vaults, a word
   * appearing in multiple languages is listed once.
   */
  allWords(): string[] {
    return Array.from(this.byWord.keys());
  }

  /**
   * All dictionary entries across all loaded languages, in insertion order.
   */
  allEntries(): DictionaryEntry[] {
    return this.all.slice();
  }

  /**
   * Build the index by scanning a single folder for .md files. Kept for
   * callers that only need one language at a time.
   */
  async loadFromFolder(folderPath: string, languageName?: string): Promise<number> {
    return this.loadFromFolders([{ folder: folderPath, language: languageName }]);
  }

  /**
   * Build the index by scanning multiple folders, one per active language.
   * Each folder is filtered to entries whose frontmatter `language` matches
   * (if specified), so entries don't leak between languages even if folders
   * overlap.
   */
  async loadFromFolders(
    sources: { folder: string; language?: string }[]
  ): Promise<number> {
    this.clear();
    let count = 0;
    const properNounEntries: { entry: DictionaryEntry; file: TFile }[] = [];
    for (const source of sources) {
      const folder = this.app.vault.getAbstractFileByPath(source.folder);
      if (!folder || !(folder instanceof TFolder)) continue;
      const files = this.collectMarkdownFiles(folder);
      for (const file of files) {
        const entry = this.readEntry(file);
        if (!entry) continue;
        if (source.language && entry.language && entry.language !== source.language) {
          continue;
        }
        // If the frontmatter didn't specify a language, assume it belongs to
        // the source folder's language. This keeps backward-compat with
        // entries that pre-date the explicit language field.
        if (!entry.language && source.language) {
          entry.language = source.language;
        }
        this.addEntry(entry);
        count++;
        if (this.isProperNoun(entry)) {
          properNounEntries.push({ entry, file });
        }
      }
    }
    void this.loadBodyPreviews(properNounEntries);
    return count;
  }

  private isProperNoun(entry: DictionaryEntry): boolean {
    const pos = entry.partOfSpeech?.toLowerCase() ?? "";
    return pos === "proper-noun" || pos === "proper noun" || pos === "propernoun";
  }

  private async loadBodyPreviews(items: { entry: DictionaryEntry; file: TFile }[]) {
    await Promise.all(
      items.map(async ({ entry, file }) => {
        try {
          const content = await this.app.vault.cachedRead(file);
          entry.bodyPreview = _extractBodyPreview(content);
        } catch {
          // Non-fatal — body preview is optional enrichment
        }
      })
    );
  }

  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const out: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") {
          out.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    return out;
  }

  private readEntry(file: TFile): DictionaryEntry | null {
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
    if (!cache) return null;
    const fm = cache.frontmatter ?? {};
    // Coerce values that should be string-ish. If a user wrote a number or
    // YAML date by accident, we still get something workable rather than
    // crashing or silently dropping the entry.
    const asString = (v: unknown): string | undefined => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      // Arrays / objects: probably a mistake, treat as missing
      return undefined;
    };
    const definition = asString(fm.definition ?? fm.translation ?? fm.meaning);
    if (!definition || !definition.trim()) return null;

    // The conlang form: frontmatter `word` overrides the filename. Spaces are
    // allowed (this is how phrase entries declare themselves) but commas,
    // semicolons, and quotes are still forbidden since they conflict with how
    // we index English definitions.
    const wordOverride = asString(fm.word)?.trim() ?? "";
    const word = wordOverride || file.basename;
    const isPhrase = /\s/.test(word);
    const wordCount = word.split(/\s+/).filter((w) => w.length > 0).length;

    // Optional `parts` (transparent-compound members) and `aliases` (alternate
    // surface forms). Both accept a YAML list or a comma-separated string.
    const parts = parseStringList(fm.parts);
    const aliases = parseStringList(fm.aliases);

    return {
      word,
      definition,
      path: file.path,
      partOfSpeech: asString(fm.partOfSpeech ?? fm.pos),
      ipa: asString(fm.ipa),
      etymology: asString(fm.etymology),
      notes: asString(fm.notes),
      language: asString(fm.language),
      mtime: file.stat.mtime,
      nameCategory: asString(fm.nameCategory ?? fm.category),
      isPhrase,
      wordCount,
      parts,
      aliases,
    };
  }

  private addEntry(entry: DictionaryEntry) {
    const key = entry.word.toLowerCase();
    const existing = this.byWord.get(key) ?? [];
    existing.push(entry);
    this.byWord.set(key, existing);
    this.all.push(entry);
    if (entry.isPhrase) {
      this.phrases.push(entry);
      // Maintain phrase list sorted by word count descending so the matcher
      // can walk it in priority order.
      this.phrases.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
    }

    // Index any aliases so they resolve to this same entry. A multi-word alias
    // is also registered as a phrase so the phrase matcher can catch it.
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const aliasKey = alias.toLowerCase();
        if (!aliasKey) continue;
        const list = this.byWord.get(aliasKey) ?? [];
        list.push(entry);
        this.byWord.set(aliasKey, list);
        if (/\s/.test(alias)) {
          this.phrases.push({
            ...entry,
            word: alias,
            isPhrase: true,
            wordCount: alias.split(/\s+/).filter((w) => w.length > 0).length,
          });
          this.phrases.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
        }
      }
    }
    // Index English definition: split on commas/semicolons so "water, liquid"
    // becomes two lookups.
    const englishKeys = entry.definition
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    for (const k of englishKeys) {
      const list = this.byEnglish.get(k) ?? [];
      list.push(entry);
      this.byEnglish.set(k, list);
    }
  }

  /**
   * Render an entry into a hover tooltip element using safe DOM construction.
   * Inline parts are separated by spaces to match the previous layout.
   */
  static renderTooltip(entry: DictionaryEntry, parent: HTMLElement): void {
    const sep = () => {
      if (parent.childNodes.length > 0) parent.appendText(" ");
    };
    sep();
    parent.createEl("strong", { text: entry.word });
    if (entry.aliases && entry.aliases.length > 0) {
      sep();
      parent.createSpan({
        cls: "conlang-tooltip-aliases",
        text: `(also: ${entry.aliases.join(", ")})`,
      });
    }
    if (entry.partOfSpeech) {
      sep();
      parent.createEl("em", { text: entry.partOfSpeech });
    }
    if (entry.nameCategory) {
      sep();
      parent.createSpan({
        cls: "conlang-tooltip-category",
        text: entry.nameCategory,
      });
    }
    if (entry.ipa) {
      sep();
      parent.appendText(entry.ipa);
    }
    sep();
    parent.createDiv({ cls: "conlang-tooltip-def", text: entry.definition });
    // For proper nouns, include a richer description from the note body
    if (entry.bodyPreview) {
      sep();
      parent.createDiv({
        cls: "conlang-tooltip-preview",
        text: entry.bodyPreview,
      });
    }
    if (entry.etymology) {
      sep();
      parent.createDiv({
        cls: "conlang-tooltip-etym",
        text: `Etymology: ${entry.etymology}`,
      });
    }
  }
}

/**
 * Extract the first meaningful paragraph from a markdown note's body.
 * Re-exported from body-preview module so callers can import either spot.
 */
export { extractBodyPreview } from "./body-preview";
