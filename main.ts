// Conlang plugin main entry.

import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  ConlangSettings,
  DEFAULT_SETTINGS,
  LanguageConfig,
  DictionaryEntry,
} from "./types";
import { applyCypher, applyCypherReverse } from "./cypher";
import { Dictionary } from "./dictionary";
import { findInflection, InflectionMatch } from "./inflection";
import { matchPhraseAtStart } from "./phrases";
import { WORD_RE, cleanWord, isWordChar, applyCasing } from "./word-tokens";
import { ConlangSettingTab } from "./settings";
import { TranslationPanelView, VIEW_TYPE_PANEL } from "./panel";
import { EntryCreationModal, EntryCreationOptions } from "./entry-modal";
import { NameCreationModal, NameCreationResult } from "./name-modal";
import { LookupModal, LookupMatch } from "./lookup-modal";
import { WordCreationModal, WordCreationResult } from "./word-modal";

export default class ConlangPlugin extends Plugin {
  settings: ConlangSettings = DEFAULT_SETTINGS;
  dictionary: Dictionary = new Dictionary(this.app);

  private tooltipEl: HTMLDivElement | null = null;
  private tooltipHideTimer: number | null = null;
  private lastHoverWord: string | null = null;

  async onload() {
    await this.loadSettings();
    this.dictionary = new Dictionary(this.app);

    this.app.workspace.onLayoutReady(async () => {
      await this.reloadActiveLanguage();
      this.refreshPanel();
      this.maybeShowWelcome();
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const lang = this.getActiveLanguage();
        if (!lang) return;
        if (file.path.startsWith(lang.dictionaryFolder)) {
          this.reloadActiveLanguage().then(() => this.refreshPanel());
        }
      })
    );

    this.addSettingTab(new ConlangSettingTab(this.app, this));

    // Register the side-panel view
    this.registerView(
      VIEW_TYPE_PANEL,
      (leaf: WorkspaceLeaf) => new TranslationPanelView(leaf, this)
    );

    // Ribbon icon to open the panel.
    // "book-open" is a Lucide icon bundled with Obsidian. Other safe choices:
    // "book", "globe", "message-square", "type". The "languages" icon exists
    // in newer Lucide but isn't always bundled, so we avoid it.
    const ribbon = this.addRibbonIcon("book-open", "Open Made Up Words panel", () => {
      this.openPanel();
    });
    ribbon.addClass("conlang-ribbon-icon");
    console.log("[Made Up Words] plugin loaded, ribbon icon added");

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: () => this.openPanel(),
    });

    this.addCommand({
      id: "translate-selection-preview",
      name: "Translate selection to primary language (preview)",
      editorCallback: (editor: Editor) => this.previewToConlang(editor),
    });

    this.addCommand({
      id: "translate-selection-commit",
      name: "Translate selection to primary language and replace",
      editorCallback: (editor: Editor) => this.commitSelectionToConlang(editor),
    });

    this.addCommand({
      id: "translate-selection-to-english-preview",
      name: "Translate selection to English (preview)",
      editorCallback: (editor: Editor) => this.previewToEnglish(editor),
    });

    this.addCommand({
      id: "reload-dictionary",
      name: "Reload dictionary",
      callback: async () => {
        const n = await this.reloadActiveLanguage();
        this.refreshPanel();
        new Notice(`Made Up Words: loaded ${n} dictionary entries`);
      },
    });

    this.addCommand({
      id: "create-entry-from-selection",
      name: "Add selection to dictionary",
      editorCallback: (editor: Editor) => this.createEntryFromSelection(editor),
    });

    this.addCommand({
      id: "create-name",
      name: "Add a name (proper noun)",
      callback: () => this.createName(),
    });

    this.addCommand({
      id: "lookup-word",
      name: "Look up word (all senses)",
      editorCallback: (editor: Editor) => this.lookupWord(editor),
    });

    // Hover tooltip handler
    this.registerDomEvent(document, "mousemove", (evt) => {
      this.handleHover(evt);
    });
  }

  onunload() {
    this.hideTooltip();
    if (this.tooltipEl && this.tooltipEl.parentElement) {
      this.tooltipEl.parentElement.removeChild(this.tooltipEl);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.migrateSettings();
  }

  /**
   * Migrate older single-active-language settings to the multi-active format.
   * Runs every load; safe to re-run because it only acts when activeLanguages
   * is empty or doesn't contain a valid name.
   */
  private migrateSettings() {
    const known = new Set(this.settings.languages.map((l) => l.name));

    // If we have legacy activeLanguage but no activeLanguages, migrate.
    if (
      (!this.settings.activeLanguages || this.settings.activeLanguages.length === 0) &&
      this.settings.activeLanguage
    ) {
      this.settings.activeLanguages = [this.settings.activeLanguage];
    }
    // Ensure activeLanguages exists and only contains known names
    if (!this.settings.activeLanguages) this.settings.activeLanguages = [];
    this.settings.activeLanguages = this.settings.activeLanguages.filter((n) =>
      known.has(n)
    );
    // If still empty, pick the first known language (if any)
    if (
      this.settings.activeLanguages.length === 0 &&
      this.settings.languages.length > 0
    ) {
      this.settings.activeLanguages = [this.settings.languages[0].name];
    }

    // Ensure primaryLanguage is one of the active languages
    if (!this.settings.primaryLanguage || !known.has(this.settings.primaryLanguage)) {
      this.settings.primaryLanguage =
        this.settings.activeLanguages[0] ?? this.settings.languages[0]?.name ?? "";
    }
    if (
      this.settings.activeLanguages.length > 0 &&
      !this.settings.activeLanguages.includes(this.settings.primaryLanguage)
    ) {
      this.settings.primaryLanguage = this.settings.activeLanguages[0];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshPanel();
  }

  /**
   * Show a one-time welcome notice if this is the user's first time loading
   * the plugin. The notice points them at the ribbon icon and the panel —
   * Autumn flagged that the side panel was hard to discover.
   *
   * The flag persists in settings so the message only shows once per install.
   */
  private maybeShowWelcome() {
    if (this.settings.hasSeenWelcome) return;
    // Mark as seen immediately so we don't double-show even if something
    // below throws.
    this.settings.hasSeenWelcome = true;
    this.saveData(this.settings);

    // Use a longer-than-default duration since we have meaningful content.
    // 12 seconds is enough to read without being intrusive.
    const message =
      "Made Up Words is loaded. Open the side panel via the book-open icon in the left ribbon, " +
      "or via the command palette → 'Made Up Words: Open panel'.";
    new Notice(message, 12000);
  }

  /**
   * Return the primary language config (the one used for new entries and
   * for English→conlang translation). Equivalent to the old getActiveLanguage
   * for callers that only deal with one language.
   */
  getPrimaryLanguage(): LanguageConfig | null {
    const name = this.settings.primaryLanguage;
    return this.settings.languages.find((l) => l.name === name) ?? null;
  }

  /**
   * Return ALL currently active languages. Hover and lookup query all of these.
   */
  getActiveLanguages(): LanguageConfig[] {
    const names = new Set(this.settings.activeLanguages);
    return this.settings.languages.filter((l) => names.has(l.name));
  }

  /**
   * Backwards compat: many existing callers use getActiveLanguage(). Keep it
   * working by returning the primary language. New code should use
   * getPrimaryLanguage() or getActiveLanguages() depending on intent.
   */
  getActiveLanguage(): LanguageConfig | null {
    return this.getPrimaryLanguage();
  }

  async reloadActiveLanguage(): Promise<number> {
    // With multi-active languages, this loads ALL active dictionaries
    // into the single Dictionary index. Each entry carries its `language`
    // field so callers can distinguish source.
    const active = this.getActiveLanguages();
    if (active.length === 0) {
      this.dictionary.clear();
      return 0;
    }
    return await this.dictionary.loadFromFolders(
      active.map((l) => ({ folder: l.dictionaryFolder, language: l.name }))
    );
  }

  // === Panel management ===

  async openPanel() {
    try {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PANEL);
      if (existing.length > 0) {
        this.app.workspace.revealLeaf(existing[0]);
        return;
      }
      let leaf = this.app.workspace.getRightLeaf(false);
      // Fall back to creating a new leaf if right sidebar isn't available
      if (!leaf) {
        leaf = this.app.workspace.getLeaf(true);
      }
      if (!leaf) {
        new Notice("Made Up Words: could not open panel (no available leaf)");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_PANEL, active: true });
      this.app.workspace.revealLeaf(leaf);
    } catch (e) {
      console.error("[Conlang] openPanel failed:", e);
      new Notice("Made Up Words: failed to open panel — see developer console");
    }
  }

  refreshPanel() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PANEL);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TranslationPanelView) {
        view.refresh();
      }
    }
  }

  // === Translation ===

  /**
   * Translate English text to the conlang. Public so the panel can call it.
   */
  translateToConlang(text: string): string {
    const lang = this.getActiveLanguage();
    if (!lang) return text;
    const replaced = this.replaceEnglishWithDictionary(text);
    return applyCypher(replaced, lang.sheets);
  }

  private replaceEnglishWithDictionary(text: string): string {
    // Tokenise into words and non-word spans so we can substitute whole
    // phrases while preserving punctuation and spacing.
    const segments: { text: string; isWord: boolean }[] = [];
    const wordRe = new RegExp(WORD_RE.source, "gu");
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(text)) !== null) {
      if (m.index > lastEnd) {
        segments.push({ text: text.slice(lastEnd, m.index), isWord: false });
      }
      segments.push({ text: m[0], isWord: true });
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < text.length) {
      segments.push({ text: text.slice(lastEnd), isWord: false });
    }

    // Walk segments, trying multi-word English matches first at each word.
    // We try sequences of up to 5 words — long enough for typical phrases
    // ("by the way", "thank you very much") without blowing up the search.
    const MAX_PHRASE_LENGTH = 5;
    const out: string[] = [];
    let i = 0;
    while (i < segments.length) {
      const seg = segments[i];
      if (!seg.isWord) {
        out.push(seg.text);
        i++;
        continue;
      }

      // Try longest match starting here
      let matched = false;
      for (let n = MAX_PHRASE_LENGTH; n >= 1; n--) {
        // Collect n consecutive word tokens (skipping over any non-word
        // segments that contain only whitespace — punctuation breaks the phrase).
        const collected: string[] = [];
        let j = i;
        let cleanGaps = true;
        while (collected.length < n && j < segments.length) {
          const s = segments[j];
          if (s.isWord) {
            collected.push(s.text);
            j++;
            continue;
          }
          // Non-word segment between words: must be whitespace-only
          if (!/^\s+$/.test(s.text)) {
            cleanGaps = false;
            break;
          }
          j++;
        }
        if (!cleanGaps) continue;
        if (collected.length < n) continue;

        const phrase = collected.join(" ");
        const hits = this.dictionary.lookupEnglish(phrase);
        if (hits.length > 0) {
          out.push(applyCasing(phrase, hits[0].word));
          i = j;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Fall through to single-word translation with original casing
        const word = seg.text;
        const entries = this.dictionary.lookupEnglish(word);
        if (entries.length > 0) {
          out.push(applyCasing(word, entries[0].word));
        } else {
          out.push(word);
        }
        i++;
      }
    }
    return out.join("");
  }

  private getSelectionOrWord(editor: Editor): { text: string; from: any; to: any } | null {
    const text = editor.getSelection();
    if (text && text.length > 0) {
      return { text, from: editor.getCursor("from"), to: editor.getCursor("to") };
    }
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    let start = cursor.ch;
    let end = cursor.ch;
    while (start > 0 && isWordChar(line[start - 1])) start--;
    while (end < line.length && isWordChar(line[end])) end++;
    if (start === end) return null;
    return {
      text: line.substring(start, end),
      from: { line: cursor.line, ch: start },
      to: { line: cursor.line, ch: end },
    };
  }

  private async previewToConlang(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    const translated = this.translateToConlang(sel.text);
    new Notice(`${sel.text}  →  ${translated}`, 6000);
  }

  /**
   * Commit the editor's current selection (or word under cursor) as conlang.
   * Public so the panel can call it.
   */
  async commitSelectionToConlang(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    const translated = this.translateToConlang(sel.text);
    const wrapped = this.wrapForCommit(translated, sel.text);
    editor.replaceRange(wrapped, sel.from, sel.to);
  }

  private wrapForCommit(translated: string, original: string): string {
    switch (this.settings.commitWrapper) {
      case "html-tooltip": {
        const safe = original
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<abbr title="${safe}">${translated}</abbr>`;
      }
      case "footnote-style":
        return `${translated}^[${original}]`;
      case "wikilink":
        return `[[${translated}|${translated}]]`;
      default:
        return translated;
    }
  }

  private async previewToEnglish(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    const entry = this.dictionary.lookup(cleanWord(sel.text));
    if (entry) {
      new Notice(`${entry.word}  →  ${entry.definition}`, 6000);
      return;
    }
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const reversed = applyCypherReverse(sel.text, lang.sheets);
    new Notice(`${sel.text}  →  ${reversed} (reverse cypher)`, 6000);
  }

  private async createEntryFromSelection(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    await this.createDictionaryEntryForText(sel.text);
  }

  /**
   * Open the lookup modal for the selected text or word under cursor.
   * Gathers ALL possible matches (direct conlang entry, inflected form,
   * English-direction matches, cypher transformation) and presents them.
   *
   * This is the multi-sense lookup the linguist tester asked for: the
   * plugin does not pick a "best" translation. The user picks.
   */
  private async lookupWord(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    const query = sel.text.trim();
    if (!query) return;
    const matches = this.collectLookupMatches(query);
    new LookupModal(this.app, query, matches).open();
  }

  /**
   * Build the full list of candidates for a given query, exploring every
   * direction the plugin understands. Returns matches in priority order:
   *   1. Direct conlang dictionary entry (highest confidence)
   *   2. Inflected form of a conlang entry
   *   3. English-direction matches (often multi-sense)
   *   4. Cypher transformation (lowest confidence, clearly labelled)
   */
  private collectLookupMatches(query: string): LookupMatch[] {
    const out: LookupMatch[] = [];
    // Strip everything except letters (any script), apostrophes, hyphens,
    // and whitespace. Whitespace stays for multi-word phrase queries.
    const cleaned = query.replace(/[^\p{L}'\s-]/gu, "").trim();
    const activeLangs = this.getActiveLanguages();
    const primary = this.getPrimaryLanguage();

    // 1. Direct conlang lookup across all active languages
    const directMatches = this.dictionary.lookupAll(cleaned);
    if (directMatches.length > 0) {
      out.push({ kind: "dictionary", candidates: directMatches });
    }

    // 2. Inflected form (only meaningful for single words) — try each language's rules
    if (!/\s/.test(cleaned)) {
      for (const lang of activeLangs) {
        const inflectionMatch = findInflection(cleaned, this.dictionary, lang.inflections);
        if (!inflectionMatch) continue;
        const alreadyShown = directMatches.some(
          (e) => e.path === inflectionMatch.lemma.path
        );
        if (alreadyShown) continue;
        out.push({
          kind: "inflected",
          candidates: [inflectionMatch.lemma],
          inflectionLabel: inflectionMatch.rule.label,
        });
        // Don't break — different languages might produce different inflection matches
        // for the same surface form, all worth showing.
      }
    }

    // 3. English-direction matches (whole input or single word)
    const englishHits = this.dictionary.lookupEnglish(cleaned);
    if (englishHits.length > 0) {
      // Filter out entries already shown as direct/inflected
      const shownPaths = new Set(
        out.flatMap((m) => (m.candidates ?? []).map((c) => c.path))
      );
      const fresh = englishHits.filter((e) => !shownPaths.has(e.path));
      if (fresh.length > 0) {
        const isPhrase = /\s/.test(cleaned);
        out.push({ kind: isPhrase ? "phrase" : "english", candidates: fresh });
      }
    }

    // 4. Cypher fallback (only for single words, only if nothing else hit).
    // Uses the PRIMARY language's cypher because cypher output can't be
    // honestly merged across languages.
    if (out.length === 0 && !/\s/.test(cleaned) && primary) {
      const cyphered = applyCypher(cleaned, primary.sheets);
      if (cyphered !== cleaned) {
        out.push({ kind: "cypher", cypherOutput: cyphered });
      }
    }

    if (out.length === 0) {
      out.push({ kind: "none" });
    }
    return out;
  }

  /**
   * Public so the panel button can call it.
   */
  async createDictionaryEntryForText(englishText: string) {
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const translated = this.translateToConlang(englishText);
    const folder = lang.dictionaryFolder;

    // If the entry already exists, just open it — don't prompt for POS again
    const safeName = translated.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${folder}/${safeName}.md`;
    await this.ensureFolder(folder);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      new Notice(`Conlang: opened existing entry "${translated}"`);
      return;
    }

    // Prompt for part of speech. The user can skip or cancel.
    const opts = await this.promptForEntryOptions(englishText, translated);
    if (opts === null) return; // user cancelled

    const content = [
      "---",
      `definition: ${englishText}`,
      `language: ${lang.name}`,
      `partOfSpeech: ${opts.partOfSpeech}`,
      "ipa: ",
      "etymology: ",
      "---",
      "",
      `# ${translated}`,
      "",
      `Translates *${englishText}*.`,
      "",
    ].join("\n");
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(false).openFile(file);

    // The metadata cache parses frontmatter asynchronously. If we reload
    // the dictionary right now, the new file's frontmatter won't be cached
    // yet and the entry will be silently skipped. Wait until the cache has
    // populated for this specific file before reloading.
    await this.waitForFrontmatter(file);
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.lastHoverWord = null; // force the next hover to re-resolve against the new index
    new Notice(`Conlang: created entry "${translated}"`);
  }

  private promptForEntryOptions(
    englishText: string,
    translated: string
  ): Promise<EntryCreationOptions | null> {
    return new Promise((resolve) => {
      new EntryCreationModal(this.app, englishText, translated, resolve).open();
    });
  }

  /**
   * Open the Word Creation modal — used by the panel's "+ Word" button
   * when there's no selected text to bootstrap from. Asks for English
   * meaning and conlang form (with optional cypher derivation).
   */
  async createWordFromPanel() {
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const result = await new Promise<WordCreationResult | null>((resolve) => {
      const cypherFn = (s: string) => this.translateToConlang(s);
      new WordCreationModal(this.app, cypherFn, resolve).open();
    });
    if (!result) return;

    const folder = lang.dictionaryFolder;
    await this.ensureFolder(folder);
    const safeName = result.conlangWord.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${folder}/${safeName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      new Notice(`Conlang: opened existing entry "${result.conlangWord}"`);
      return;
    }

    const fmLines = [
      "---",
      `definition: ${result.englishDefinition}`,
      `language: ${lang.name}`,
    ];
    if (result.partOfSpeech) {
      fmLines.push(`partOfSpeech: ${result.partOfSpeech}`);
    } else {
      fmLines.push("partOfSpeech: ");
    }
    fmLines.push("ipa: ", "etymology: ", "---", "", `# ${result.conlangWord}`, "", "");
    const content = fmLines.join("\n");

    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(false).openFile(file);
    await this.waitForFrontmatter(file);
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.lastHoverWord = null;
    new Notice(`Conlang: added "${result.conlangWord}"`);
  }

  /**
   * Open the Create Name modal and, on submit, create a proper-noun
   * dictionary entry for the new name. Called from a ribbon command and
   * from the panel.
   */
  async createName() {
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const result = await this.promptForName();
    if (!result) return;

    const folder = lang.dictionaryFolder;
    await this.ensureFolder(folder);
    const safeName = result.conlangForm.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${folder}/${safeName}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      new Notice(`Conlang: opened existing entry "${result.conlangForm}"`);
      return;
    }

    const referent = result.referent || result.conlangForm;
    const content = [
      "---",
      `definition: ${referent}`,
      `language: ${lang.name}`,
      "partOfSpeech: proper-noun",
      `nameCategory: ${result.category}`,
      "ipa: ",
      "etymology: ",
      "---",
      "",
      `# ${result.conlangForm}`,
      "",
      // Empty placeholder paragraph — the user fills this in to describe
      // who/what this name refers to in their world. Picked up as the
      // bodyPreview on hover.
      "",
    ].join("\n");
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(false).openFile(file);

    await this.waitForFrontmatter(file);
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.lastHoverWord = null;
    new Notice(`Conlang: created name "${result.conlangForm}"`);
  }

  private promptForName(): Promise<NameCreationResult | null> {
    return new Promise((resolve) => {
      const cypherFn = (s: string) => this.translateToConlang(s);
      new NameCreationModal(this.app, cypherFn, resolve).open();
    });
  }

  /**
   * Wait up to ~2 seconds for Obsidian's metadata cache to have parsed
   * frontmatter for the given file. Resolves immediately if it's already
   * there. The metadataCache fires a "changed" event for each file once
   * its cache is populated.
   */
  private waitForFrontmatter(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache && cache.frontmatter && cache.frontmatter.definition) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.app.metadataCache.offref(ref);
        window.clearTimeout(timer);
        resolve();
      };
      const ref = this.app.metadataCache.on("changed", (changed) => {
        if (changed.path !== file.path) return;
        const c = this.app.metadataCache.getFileCache(changed);
        if (c && c.frontmatter && c.frontmatter.definition) finish();
      });
      // Safety net: don't block forever if the cache never fires
      const timer = window.setTimeout(finish, 2000);
    });
  }

  private async ensureFolder(path: string) {
    const parts = path.split("/").filter((p) => p.length > 0);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        try {
          await this.app.vault.createFolder(current);
        } catch (e) {
          // ignore concurrent creation
        }
      }
    }
  }

  // === Hover tooltips ===
  // Tooltip shows dictionary definitions when available, falls back to
  // a cypher preview so every word gives feedback.

  private handleHover(evt: MouseEvent) {
    // Hover fires when at least one active language has hover enabled.
    // With multi-language, the answer to "should I show a tooltip" can't
    // depend on a single language anymore.
    const activeLangs = this.getActiveLanguages();
    const anyHoverEnabled = activeLangs.some((l) => l.hoverEnabled);
    if (!anyHoverEnabled) {
      this.hideTooltip();
      return;
    }

    // Check if the configured modifier key is held. "none" means always show
    // (the old behaviour); any other value requires the matching key.
    if (!this.modifierHeld(evt)) {
      this.hideTooltip();
      this.lastHoverWord = null;
      return;
    }

    const target = evt.target as HTMLElement | null;
    if (!target) {
      this.hideTooltip();
      return;
    }
    const inMarkdown =
      target.closest(".markdown-preview-view") ||
      target.closest(".markdown-source-view") ||
      target.closest(".cm-content");
    if (!inMarkdown) {
      this.hideTooltip();
      return;
    }
    if (target.closest(".conlang-panel")) {
      this.hideTooltip();
      return;
    }

    const ctx = this.getContextAtPoint(evt.clientX, evt.clientY);
    if (!ctx) {
      this.scheduleHideTooltip();
      this.lastHoverWord = null;
      return;
    }
    const word = ctx.word;
    const cleaned = cleanWord(word);
    if (!cleaned) {
      this.scheduleHideTooltip();
      this.lastHoverWord = null;
      return;
    }

    if (
      cleaned === this.lastHoverWord &&
      this.tooltipEl &&
      this.tooltipEl.style.display !== "none"
    ) {
      this.positionTooltip(evt.clientX, evt.clientY);
      return;
    }
    this.lastHoverWord = cleaned;

    // Phrase check FIRST: if the hovered word is part of a known phrase,
    // show the phrase entry rather than the single-word lookup. We scan
    // backward from the cursor looking for phrase starts.
    const phrases = this.dictionary.allPhrases();
    if (phrases.length > 0) {
      const phraseHit = this.findPhraseAroundCursor(ctx, phrases);
      if (phraseHit) {
        this.showDictionaryTooltip(evt.clientX, evt.clientY, phraseHit);
        return;
      }
    }

    // Try the dictionary in both directions, plus inflection lookup:
    // 1. Hovered word is a conlang word (in any active language) -> show its definition
    // 2. Hovered word is an inflected form (in any active language) -> show lemma + label
    // 3. Hovered word is English text matching a definition (any language) -> show all
    // 4. Fall back to forward cypher preview (using primary language's cypher)
    const dictEntries = this.dictionary.lookupAll(cleaned);
    if (dictEntries.length > 0) {
      if (dictEntries.length === 1) {
        this.showDictionaryTooltip(evt.clientX, evt.clientY, dictEntries[0]);
      } else {
        // Multiple languages share this spelling — show them all with language tags
        this.showMultiSenseTooltip(evt.clientX, evt.clientY, cleaned, dictEntries);
      }
      return;
    }

    // Try inflection rules from each active language. First match wins.
    const activeLanguages = this.getActiveLanguages();
    for (const activeLang of activeLanguages) {
      const inflectionMatch = findInflection(cleaned, this.dictionary, activeLang.inflections);
      if (inflectionMatch) {
        this.showInflectionTooltip(evt.clientX, evt.clientY, inflectionMatch);
        return;
      }
    }

    const englishHits = this.dictionary.lookupEnglish(cleaned);
    if (englishHits.length > 0) {
      if (englishHits.length === 1) {
        this.showDictionaryTooltip(evt.clientX, evt.clientY, englishHits[0]);
      } else {
        this.showMultiSenseTooltip(evt.clientX, evt.clientY, cleaned, englishHits);
      }
      return;
    }

    // No dictionary match. Respect the user's setting for what to show as
    // a fallback — cypher preview (default) or nothing (less noise).
    if (this.settings.hoverFallback === "nothing") {
      this.scheduleHideTooltip();
      return;
    }
    // Cypher fallback uses the PRIMARY language's rules. With multi-language,
    // there's no honest way to cypher into multiple languages at once.
    const primary = this.getPrimaryLanguage();
    if (!primary) {
      this.scheduleHideTooltip();
      return;
    }
    const cyphered = applyCypher(cleaned, primary.sheets);
    if (cyphered === cleaned) {
      this.scheduleHideTooltip();
      return;
    }
    this.showCypherTooltip(evt.clientX, evt.clientY, cleaned, cyphered);
  }

  /**
   * Returns true if the configured hover modifier key is held during the
   * given mouse event. "none" always returns true (always-on hover).
   */
  private modifierHeld(evt: MouseEvent): boolean {
    switch (this.settings.hoverModifier) {
      case "none":
        return true;
      case "shift":
        return evt.shiftKey;
      case "alt":
        return evt.altKey;
      case "ctrl":
        // Treat Cmd on Mac the same as Ctrl elsewhere
        return evt.ctrlKey || evt.metaKey;
      default:
        return true;
    }
  }

  /**
   * Check if the word under the cursor is part of any phrase entry.
   * Scans the backward context to find candidate phrase starts, then tries
   * each one to see if it forms a phrase that includes the cursor's word.
   */
  private findPhraseAroundCursor(
    ctx: { word: string; forwardContext: string; backwardContext: string },
    phrases: DictionaryEntry[]
  ): DictionaryEntry | null {
    // Take all words in the backward+forward context, then for each starting
    // position try the phrase matcher. The matcher's longest-first guarantee
    // means we'll catch the right phrase.
    const fullContext = ctx.backwardContext + ctx.forwardContext.slice(ctx.word.length);
    // Where in fullContext does the hovered word START?
    const cursorWordStart = ctx.backwardContext.length - ctx.word.length;

    // Find all word boundaries up to and including the cursor word's start
    const wordRe = new RegExp(WORD_RE.source, "gu");
    const wordPositions: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(fullContext)) !== null) {
      if (m.index > cursorWordStart) break;
      wordPositions.push(m.index);
    }

    // Try starting a phrase match at each candidate position (closest to the
    // cursor first; that way the match that *includes* the cursor wins)
    for (let i = wordPositions.length - 1; i >= 0; i--) {
      const startPos = wordPositions[i];
      const candidate = fullContext.slice(startPos);
      const hit = matchPhraseAtStart(candidate, phrases);
      if (!hit) continue;
      // Does the matched span actually cover the cursor's word?
      const matchEnd = startPos + hit.matchedText.length;
      if (matchEnd > cursorWordStart) {
        return hit.entry;
      }
    }
    return null;
  }


  /**
   * Like getWordAtPoint, but also returns text on either side of the cursor
   * up to nearby word boundaries — enough to run phrase matching against.
   *
   * Returns:
   *   word: the word directly under the cursor
   *   forwardContext: text from the start of `word` to the next ~50 chars
   *   backwardContext: text from ~50 chars before `word` to the end of `word`
   */
  private getContextAtPoint(
    x: number,
    y: number
  ): { word: string; forwardContext: string; backwardContext: string } | null {
    const doc: any = document;
    let textNode: Node | null = null;
    let offset = 0;
    if (typeof doc.caretRangeFromPoint === "function") {
      const range: Range | null = doc.caretRangeFromPoint(x, y);
      if (!range) return null;
      textNode = range.startContainer;
      offset = range.startOffset;
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(x, y);
      if (!pos) return null;
      textNode = pos.offsetNode;
      offset = pos.offset;
    }
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
    const text = textNode.textContent ?? "";
    if (!text) return null;
    let start = offset;
    let end = offset;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    if (start === end) return null;
    const word = text.substring(start, end);
    // Grab ~50 chars on either side for phrase context. We can't see across
    // text nodes from a single hover, but phrases are short enough that
    // a single text node usually contains them.
    const forwardContext = text.substring(start, Math.min(text.length, end + 50));
    const backwardContext = text.substring(Math.max(0, start - 50), end);
    return { word, forwardContext, backwardContext };
  }

  private ensureTooltipEl(): HTMLDivElement {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div");
      this.tooltipEl.addClass("conlang-tooltip");
      document.body.appendChild(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  private showDictionaryTooltip(x: number, y: number, entry: DictionaryEntry) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.innerHTML = Dictionary.formatTooltip(entry);
    el.style.display = "block";
    this.positionTooltip(x, y);
  }

  private showInflectionTooltip(x: number, y: number, match: InflectionMatch) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    // Render the dictionary entry as normal, then add a banner line noting
    // that this is an inflected form.
    el.innerHTML =
      Dictionary.formatTooltip(match.lemma) +
      `<div class="conlang-tooltip-inflection">` +
      `${escapeHtml(match.inflectedForm)} = ${escapeHtml(match.rule.label)} of ${escapeHtml(match.lemma.word)}` +
      `</div>`;
    el.style.display = "block";
    this.positionTooltip(x, y);
  }

  /**
   * Show multiple candidates when an English word matches several conlang
   * entries with different senses. This is the multi-sense lookup the tester
   * asked for: the plugin doesn't guess which sense is intended.
   */
  private showMultiSenseTooltip(
    x: number,
    y: number,
    sourceWord: string,
    entries: DictionaryEntry[]
  ) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    const parts: string[] = [];
    // Header changes depending on whether matches come from multiple languages.
    const languages = new Set(entries.map((e) => e.language).filter(Boolean));
    const headerSummary =
      languages.size > 1
        ? `${entries.length} matches across ${languages.size} languages`
        : `${entries.length} senses`;
    parts.push(
      `<div class="conlang-tooltip-multisense-header"><strong>${escapeHtml(sourceWord)}</strong> — ${headerSummary}</div>`
    );
    for (const entry of entries) {
      const senseParts: string[] = [];
      senseParts.push(`<strong>${escapeHtml(entry.word)}</strong>`);
      // Show source language when there are multiple languages in play.
      // Hidden when all entries are from the same language to avoid noise.
      if (languages.size > 1 && entry.language) {
        senseParts.push(
          `<span class="conlang-tooltip-lang">${escapeHtml(entry.language)}</span>`
        );
      }
      if (entry.partOfSpeech) {
        senseParts.push(`<em>${escapeHtml(entry.partOfSpeech)}</em>`);
      }
      senseParts.push(`<span class="conlang-tooltip-sense-def">${escapeHtml(entry.definition)}</span>`);
      parts.push(`<div class="conlang-tooltip-sense">${senseParts.join(" ")}</div>`);
    }
    el.innerHTML = parts.join("");
    el.style.display = "block";
    this.positionTooltip(x, y);
  }

  private showCypherTooltip(x: number, y: number, original: string, translated: string) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.innerHTML = `
      <div class="conlang-tooltip-cypher">
        <span class="conlang-tooltip-original">${escapeHtml(original)}</span>
        <span class="conlang-tooltip-arrow-inline">→</span>
        <span class="conlang-tooltip-translation">${escapeHtml(translated)}</span>
      </div>
      <div class="conlang-tooltip-hint">cypher only — not in dictionary</div>
    `;
    el.style.display = "block";
    this.positionTooltip(x, y);
  }

  private positionTooltip(x: number, y: number) {
    if (!this.tooltipEl) return;
    const pad = 12;
    const rect = this.tooltipEl.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight) {
      top = y - rect.height - pad;
    }
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }

  private scheduleHideTooltip() {
    if (this.tooltipHideTimer !== null) return;
    this.tooltipHideTimer = window.setTimeout(() => {
      this.hideTooltip();
      this.tooltipHideTimer = null;
    }, 150);
  }

  private hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = "none";
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
