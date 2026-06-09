// Conlang plugin main entry.

import {
  Editor,
  EditorPosition,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
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
import {
  EntryCreationModal,
  EntryCreationOptions,
  MultiEntryModal,
  MultiEntryResult,
  MultiEntryLanguageInit,
} from "./entry-modal";
import { NameCreationModal, NameCreationResult } from "./name-modal";
import { LookupModal, LookupMatch } from "./lookup-modal";
import { WordCreationModal, WordCreationResult } from "./word-modal";
import {
  makeHighlightExtension,
  highlightElement,
  refreshHighlightEffect,
} from "./highlight";
import { EditorView } from "@codemirror/view";

export default class ConlangPlugin extends Plugin {
  settings: ConlangSettings = DEFAULT_SETTINGS;
  dictionary: Dictionary = new Dictionary(this.app);

  private tooltipEl: HTMLDivElement | null = null;
  private tooltipHideTimer: number | null = null;
  private lastHoverWord: string | null = null;
  // Hover throttling: mousemove fires very frequently, and resolving the word
  // under the cursor calls caretRangeFromPoint (a layout query). We cap this
  // to one resolve per HOVER_THROTTLE_MS, with a trailing call so the cursor's
  // final resting position is always resolved.
  private static readonly HOVER_THROTTLE_MS = 50;
  private hoverLastRun = 0;
  private hoverPendingTimer: number | null = null;
  private lastMouseEvent: MouseEvent | null = null;
  // Cached "does any active language want hover tooltips" — recomputed on
  // settings change so the mousemove fast-path is a single boolean check.
  private hoverActive = false;

  async onload() {
    await this.loadSettings();
    this.dictionary = new Dictionary(this.app);

    this.app.workspace.onLayoutReady(async () => {
      await this.reloadActiveLanguage();
      this.updateHoverActive();
      this.refreshPanel();
      this.refreshHighlights();
      this.maybeShowWelcome();
    });

    // Known-word highlighting: a CM6 editor extension for Live Preview /
    // Source mode, plus a post-processor for Reading view. Both read the
    // live dictionary, so they stay in sync as entries change.
    this.registerEditorExtension(makeHighlightExtension(this));
    this.registerMarkdownPostProcessor((el) => highlightElement(this, el));
    this.applyHighlightStyleClass();

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.maybeReloadForPath(file.path);
      })
    );
    // Also react to dictionary files being deleted or renamed so removed words
    // stop (and renamed words start) highlighting without a manual reload.
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.maybeReloadForPath(file.path))
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.maybeReloadForPath(file.path);
        this.maybeReloadForPath(oldPath);
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
      void this.openPanel();
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
        this.refreshHighlights();
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

    this.addCommand({
      id: "toggle-highlighting",
      name: "Toggle known-word highlighting",
      callback: async () => {
        this.settings.highlightKnownWords = !this.settings.highlightKnownWords;
        await this.saveSettings();
        new Notice(
          `Made Up Words: highlighting ${
            this.settings.highlightKnownWords ? "on" : "off"
          }`
        );
      },
    });

    // Right-click (editor context menu) entry point for adding the selected
    // word/selection to a dictionary — more discoverable than the palette.
    // Opens the language chooser (which auto-skips when only one language).
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const sel = this.getSelectionOrWord(editor);
        if (!sel) return;
        menu.addItem((item) =>
          item
            .setTitle("Add to Made Up Words dictionary…")
            .setIcon("plus")
            .onClick(() => this.createEntryFromSelection(editor))
        );
      })
    );

    // Hover tooltip handler (throttled — see onMouseMove)
    this.registerDomEvent(activeDocument, "mousemove", (evt) => {
      this.onMouseMove(evt);
    });
  }

  onunload() {
    this.hideTooltip();
    if (this.hoverPendingTimer !== null) {
      window.clearTimeout(this.hoverPendingTimer);
      this.hoverPendingTimer = null;
    }
    if (this.tooltipEl && this.tooltipEl.parentElement) {
      this.tooltipEl.parentElement.removeChild(this.tooltipEl);
    }
    activeDocument.body.removeClass(
      "conlang-hl-underline",
      "conlang-hl-italic",
      "conlang-hl-background"
    );
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<ConlangSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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
    this.updateHoverActive();
    this.refreshPanel();
    this.refreshHighlights();
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
    void this.saveData(this.settings);

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
        await this.app.workspace.revealLeaf(existing[0]);
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
      await this.app.workspace.revealLeaf(leaf);
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

  /**
   * Set the body-level class that drives the highlight appearance. CSS keys
   * off "conlang-hl-<style>" so the underline/italic/background variants are
   * pure styling with no inline styles. Cleared entirely when highlighting
   * is off so no stray rules apply.
   */
  applyHighlightStyleClass() {
    activeDocument.body.removeClass(
      "conlang-hl-underline",
      "conlang-hl-italic",
      "conlang-hl-background"
    );
    if (this.settings.highlightKnownWords) {
      activeDocument.body.addClass(`conlang-hl-${this.settings.highlightStyle}`);
    }
  }

  /**
   * Recompute highlighting everywhere after the dictionary or settings
   * change. Editors are nudged with a refresh effect so the CM6 ViewPlugin
   * rebuilds its decorations; Reading views are re-rendered so the
   * post-processor runs again.
   */
  /**
   * If `path` falls inside ANY active language's dictionary folder, reload the
   * dictionary and refresh the panel + highlights. Used by the metadata and
   * vault watchers so added/edited/deleted/renamed entries take effect live.
   *
   * Previously this only watched the *primary* language's folder, so words kept
   * in another active language's folder never triggered a live refresh.
   */
  private maybeReloadForPath(path: string) {
    const inDict = this.getActiveLanguages().some(
      (l) => l.dictionaryFolder && path.startsWith(l.dictionaryFolder)
    );
    if (!inDict) return;
    void this.reloadActiveLanguage().then(() => {
      this.refreshPanel();
      this.refreshHighlights();
    });
  }

  refreshHighlights() {
    this.applyHighlightStyleClass();
    // Primary mechanism: re-apply registered editor extensions across every
    // editor. This re-instantiates our ViewPlugin and re-runs its build()
    // against the current dictionary, and works even when an individual
    // EditorView handle isn't reachable (e.g. Reading mode or cached panes).
    try {
      this.app.workspace.updateOptions();
    } catch (e) {
      console.error("[Made Up Words] updateOptions failed:", e);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      // Secondary: nudge the live editor directly, in case updateOptions
      // didn't recreate the ViewPlugin for this pane.
      const cm = (view.editor as Editor & { cm?: EditorView }).cm;
      if (cm) {
        try {
          cm.dispatch({ effects: refreshHighlightEffect.of(null) });
        } catch {
          /* non-fatal */
        }
      }
      // Re-render Reading-view panes so the markdown post-processor re-runs.
      const preview = (
        view as MarkdownView & { previewMode?: { rerender?(full: boolean): void } }
      ).previewMode;
      if (preview && typeof preview.rerender === "function") {
        try {
          preview.rerender(true);
        } catch {
          /* non-fatal */
        }
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
    return this.translateToConlangWith(text, lang);
  }

  /** Translate English text using a specific language's cypher sheets. */
  private translateToConlangWith(text: string, lang: LanguageConfig): string {
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

  private getSelectionOrWord(
    editor: Editor
  ): { text: string; from: EditorPosition; to: EditorPosition } | null {
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
    await this.openMultiLangEntries(sel.text);
  }

  /**
   * Open the multi-language "Save to dictionary" modal: pick one or more
   * languages, tweak each cypher-seeded form, set a shared part of speech,
   * then create one entry per chosen language (each in its own folder).
   */
  private async openMultiLangEntries(englishText: string) {
    const langs = this.settings.languages;
    if (langs.length === 0) {
      new Notice("Made Up Words: no languages configured");
      return;
    }
    const primary = this.settings.primaryLanguage;
    const inits: MultiEntryLanguageInit[] = langs.map((l) => ({
      languageName: l.name,
      folder: l.dictionaryFolder,
      form: this.translateToConlangWith(englishText, l),
      checked: l.name === primary,
    }));
    const result = await new Promise<MultiEntryResult | null>((resolve) => {
      new MultiEntryModal(this.app, englishText, inits, resolve).open();
    });
    if (!result) return;

    const created: string[] = [];
    const errors: string[] = [];
    let firstPath: string | null = null;
    for (const target of result.targets) {
      const lang = langs.find((l) => l.name === target.languageName);
      if (!lang) continue;
      const r = await this.createOneEntry({
        englishText,
        lang,
        conlangForm: target.form,
        partOfSpeech: result.partOfSpeech,
      });
      if (r.ok) {
        created.push(`${target.form} (${lang.name}${r.created ? "" : ", existing"})`);
        if (!firstPath) firstPath = r.path;
      } else {
        errors.push(`${lang.name}: ${r.error}`);
      }
    }
    await this.afterEntriesChanged();
    if (firstPath) {
      const f = this.app.vault.getAbstractFileByPath(firstPath);
      if (f instanceof TFile) await this.app.workspace.getLeaf(false).openFile(f);
    }
    if (errors.length > 0) {
      new Notice(
        `Made Up Words: ${created.length} saved, ${errors.length} failed — ${errors.join("; ")}`,
        9000
      );
    } else {
      new Notice(
        `Made Up Words: saved ${created.length} ${created.length === 1 ? "entry" : "entries"}`,
        5000
      );
    }
  }

  /**
   * Create one dictionary entry file. Robustly ensures the target folder
   * exists and reports failures instead of throwing. Returns created=false
   * when an entry with that form already exists.
   */
  private async createOneEntry(p: {
    englishText: string;
    lang: LanguageConfig;
    conlangForm: string;
    partOfSpeech: string;
  }): Promise<
    { ok: true; created: boolean; path: string } | { ok: false; error: string }
  > {
    const form = p.conlangForm.trim();
    if (!form) return { ok: false, error: "empty conlang form" };
    const folder = p.lang.dictionaryFolder;
    const safeName = form.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${folder}/${safeName}.md`;
    try {
      await this.ensureFolderStrict(folder);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `couldn't create folder "${folder}": ${msg}` };
    }
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return { ok: true, created: false, path };
    const content = [
      "---",
      `definition: ${p.englishText}`,
      `language: ${p.lang.name}`,
      `partOfSpeech: ${p.partOfSpeech}`,
      "ipa: ",
      "etymology: ",
      "---",
      "",
      `# ${form}`,
      "",
      `Translates *${p.englishText}*.`,
      "",
    ].join("\n");
    try {
      const file = await this.app.vault.create(path, content);
      await this.waitForFrontmatter(file);
      return { ok: true, created: true, path };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `couldn't create "${path}": ${msg}` };
    }
  }

  /** Reload the dictionary + refresh UI after entries were added/changed. */
  private async afterEntriesChanged() {
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;
  }

  /**
   * Ensure a (possibly nested) folder exists, creating each missing level.
   * Throws on a real failure (unlike ensureFolder, which is best-effort) so
   * callers can surface the error to the user.
   */
  private async ensureFolderStrict(path: string): Promise<void> {
    const parts = path.split("/").filter((p) => p.length > 0);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`"${current}" exists but is not a folder`);
      try {
        await this.app.vault.createFolder(current);
      } catch (e) {
        // Tolerate a race where the folder appeared between check and create.
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
          throw e;
        }
      }
    }
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
  async createDictionaryEntryForText(
    englishText: string,
    targetLang?: LanguageConfig
  ) {
    const lang = targetLang ?? this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const translated = this.translateToConlangWith(englishText, lang);
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
    this.refreshHighlights();
    this.lastHoverWord = null; // force the next hover to re-resolve against the new index
    const isActive = this.settings.activeLanguages.includes(lang.name);
    new Notice(
      isActive
        ? `Made Up Words: created "${translated}" in ${lang.name}`
        : `Made Up Words: created "${translated}" in ${lang.name} (inactive — activate it to see hover/highlight)`
    );
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
    this.refreshHighlights();
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
    this.refreshHighlights();
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
        } catch {
          // ignore concurrent creation
        }
      }
    }
  }

  // === Hover tooltips ===
  // Tooltip shows dictionary definitions when available, falls back to
  // a cypher preview so every word gives feedback.

  /**
   * Recompute whether any active language wants hover tooltips. Called on load
   * and whenever settings change, so the mousemove handler can bail out with a
   * single boolean check instead of scanning languages on every event.
   */
  private updateHoverActive() {
    this.hoverActive = this.getActiveLanguages().some((l) => l.hoverEnabled);
  }

  /**
   * Throttled entry point for mousemove. Resolving the word under the cursor
   * uses caretRangeFromPoint, which forces a layout flush, so we cap how often
   * handleHover runs. A leading call keeps the tooltip responsive; a single
   * trailing timer guarantees the cursor's final resting position resolves.
   */
  private onMouseMove(evt: MouseEvent) {
    if (!this.hoverActive) return;
    this.lastMouseEvent = evt;
    const now = Date.now();
    const since = now - this.hoverLastRun;
    if (since >= ConlangPlugin.HOVER_THROTTLE_MS) {
      this.hoverLastRun = now;
      this.handleHover(evt);
    } else if (this.hoverPendingTimer === null) {
      this.hoverPendingTimer = window.setTimeout(() => {
        this.hoverPendingTimer = null;
        this.hoverLastRun = Date.now();
        if (this.lastMouseEvent) this.handleHover(this.lastMouseEvent);
      }, ConlangPlugin.HOVER_THROTTLE_MS - since);
    }
  }

  private handleHover(evt: MouseEvent) {
    // Fast-path guard: if no active language wants hover tooltips, do nothing.
    // (Cached via updateHoverActive so this stays a single boolean check.)
    if (!this.hoverActive) {
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
      this.tooltipEl.hasClass("conlang-tooltip-visible")
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
    // Combine matches from BOTH directions across all active languages:
    //   - conlang direction: the hovered word IS a dictionary headword
    //   - English direction: the hovered word is a definition of entries
    // De-duplicated by file path. This way a word that exists in several
    // languages (e.g. "looked" -> luukid in one language, looked in another)
    // shows every language's entry in a single tooltip rather than just one.
    const dictEntries = this.dictionary.lookupAll(cleaned);
    const englishHits = this.dictionary.lookupEnglish(cleaned);
    const combined: DictionaryEntry[] = [...dictEntries];
    for (const e of englishHits) {
      if (!combined.some((c) => c.path === e.path)) combined.push(e);
    }
    // Expand to cross-language siblings: other entries that share a definition
    // with any match. So hovering one language's form (e.g. "Traenslaetis")
    // also surfaces the same concept in other active languages
    // (e.g. "Translateees"), since they share the English definition.
    const seenDefs = new Set<string>();
    for (const e of [...combined]) {
      for (const sense of e.definition.split(/[,;]/)) {
        const key = sense.trim().toLowerCase();
        if (!key || seenDefs.has(key)) continue;
        seenDefs.add(key);
        for (const sib of this.dictionary.lookupEnglish(key)) {
          if (!combined.some((c) => c.path === sib.path)) combined.push(sib);
        }
      }
    }
    if (combined.length === 1) {
      this.showDictionaryTooltip(evt.clientX, evt.clientY, combined[0]);
      return;
    }
    if (combined.length > 1) {
      this.showMultiSenseTooltip(evt.clientX, evt.clientY, cleaned, combined);
      return;
    }

    // No direct/English match — try inflection rules from each active language.
    const activeLanguages = this.getActiveLanguages();
    for (const activeLang of activeLanguages) {
      const inflectionMatch = findInflection(cleaned, this.dictionary, activeLang.inflections);
      if (inflectionMatch) {
        this.showInflectionTooltip(evt.clientX, evt.clientY, inflectionMatch);
        return;
      }
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
    // `caretPositionFromPoint` / `caretRangeFromPoint` are non-standard across
    // browsers, so type just the two methods we probe for rather than using any.
    const doc = activeDocument as Document & {
      caretRangeFromPoint?(x: number, y: number): Range | null;
      caretPositionFromPoint?(
        x: number,
        y: number
      ): { offsetNode: Node; offset: number } | null;
    };
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
      activeDocument.body.appendChild(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  private showDictionaryTooltip(x: number, y: number, entry: DictionaryEntry) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    Dictionary.renderTooltip(entry, el);
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  private showInflectionTooltip(x: number, y: number, match: InflectionMatch) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    // Render the dictionary entry as normal, then add a banner line noting
    // that this is an inflected form.
    Dictionary.renderTooltip(match.lemma, el);
    el.createDiv({
      cls: "conlang-tooltip-inflection",
      text: `${match.inflectedForm} = ${match.rule.label} of ${match.lemma.word}`,
    });
    el.addClass("conlang-tooltip-visible");
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
    el.empty();
    // Header changes depending on whether matches come from multiple languages.
    const languages = new Set(entries.map((e) => e.language).filter(Boolean));
    const headerSummary =
      languages.size > 1
        ? `${entries.length} matches across ${languages.size} languages`
        : `${entries.length} senses`;
    const header = el.createDiv({ cls: "conlang-tooltip-multisense-header" });
    header.createEl("strong", { text: sourceWord });
    header.appendText(` — ${headerSummary}`);
    for (const entry of entries) {
      const sense = el.createDiv({ cls: "conlang-tooltip-sense" });
      sense.createEl("strong", { text: entry.word });
      // Show source language when there are multiple languages in play.
      // Hidden when all entries are from the same language to avoid noise.
      if (languages.size > 1 && entry.language) {
        sense.appendText(" ");
        sense.createSpan({ cls: "conlang-tooltip-lang", text: entry.language });
      }
      if (entry.partOfSpeech) {
        sense.appendText(" ");
        sense.createEl("em", { text: entry.partOfSpeech });
      }
      sense.appendText(" ");
      sense.createSpan({
        cls: "conlang-tooltip-sense-def",
        text: entry.definition,
      });
    }
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  private showCypherTooltip(x: number, y: number, original: string, translated: string) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    const cypher = el.createDiv({ cls: "conlang-tooltip-cypher" });
    cypher.createSpan({ cls: "conlang-tooltip-original", text: original });
    cypher.createSpan({ cls: "conlang-tooltip-arrow-inline", text: "→" });
    cypher.createSpan({ cls: "conlang-tooltip-translation", text: translated });
    el.createDiv({
      cls: "conlang-tooltip-hint",
      text: "cypher only — not in dictionary",
    });
    el.addClass("conlang-tooltip-visible");
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
      this.tooltipEl.removeClass("conlang-tooltip-visible");
    }
  }
}
