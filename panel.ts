// Translation panel: a side-panel view with two tabs.
//
// Tab 1 ("Translate"): updates live whenever the user's selection changes,
// translates in both directions, surfaces matching dictionary entries.
//
// Tab 2 ("Dictionary"): browsable, searchable, sortable list of every
// dictionary entry for the active language.

import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice } from "obsidian";
import type ConlangPlugin from "./main";
import { DictionaryEntry } from "./types";
import { applyCypherReverse } from "./cypher";
import { findInflection, generateInflections, GeneratedForm } from "./inflection";
import { explainInflection } from "./explanations";
import { tokeniseWithPhrases, matchPhraseAtStart } from "./phrases";
import { WORD_RE, cleanWord, applyCasing, firstSense } from "./word-tokens";
import {
  glossEnglishToConlang,
  glossConlangToEnglish,
  renderTransliterationString,
  GlossToken,
} from "./gloss";

export const VIEW_TYPE_PANEL = "made-up-words-panel";

type TabId = "translate" | "dictionary" | "translator";
type SortKey = "alphabetical" | "recent" | "partOfSpeech";
type TranslatorDirection = "english-to-conlang" | "conlang-to-english";

export class TranslationPanelView extends ItemView {
  private plugin: ConlangPlugin;
  private activeTab: TabId = "translate";
  private lastRenderedText: string = "";
  private pollHandle: number | null = null;

  // Browser state (persisted across re-renders within a session)
  private searchQuery: string = "";
  private posFilter: string = ""; // empty string = all
  private nameFilter: "all" | "names-only" | "hide-names" = "all";
  private languageFilter: string = ""; // empty = all active languages
  private sortKey: SortKey = "alphabetical";

  // Translator-tab state. Persists while the panel stays open so the user
  // can switch tabs and come back without losing their work.
  private translatorDirection: TranslatorDirection = "english-to-conlang";
  private translatorMode: "gloss" | "transliterate" = "gloss";
  private translatorInput: string = "";
  private translatorDebounceTimer: number | null = null;

  // Cached DOM refs
  private headerEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private tabContentEl!: HTMLElement;

  // Translate-tab refs
  private translateEmptyEl!: HTMLElement;
  private translateBodyEl!: HTMLElement;
  private sourceLabel!: HTMLElement;
  private sourceText!: HTMLElement;
  private translationLabel!: HTMLElement;
  private translationText!: HTMLElement;
  private actionsEl!: HTMLElement;
  private entriesEl!: HTMLElement;

  // Dictionary-tab refs
  private browserEl!: HTMLElement;
  private browserToolbarEl!: HTMLElement;
  private browserStatsEl!: HTMLElement;
  private browserListEl!: HTMLElement;
  private browserEmptyEl!: HTMLElement;

  // Translator-tab refs
  private translatorEl!: HTMLElement;
  private translatorSourceLabel!: HTMLElement;
  private translatorInputEl!: HTMLTextAreaElement;
  private translatorTargetLabel!: HTMLElement;
  private translatorOutputEl!: HTMLElement;
  private translatorSwapBtn!: HTMLButtonElement;
  private translatorCopyBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: ConlangPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_PANEL;
  }

  getDisplayText(): string {
    return "Made Up Words";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("conlang-panel");

    // Header
    this.headerEl = root.createDiv({ cls: "conlang-panel-header" });
    this.renderHeader();

    // Tabs
    this.tabsEl = root.createDiv({ cls: "conlang-panel-tabs" });
    this.renderTabs();

    // Content
    this.tabContentEl = root.createDiv({ cls: "conlang-panel-content" });
    this.buildTranslateTab();
    this.buildTranslatorTab();
    this.buildDictionaryTab();
    this.showActiveTab();

    // Update Translate tab on selection change
    this.registerDomEvent(document, "selectionchange", () => {
      this.scheduleTranslateUpdate();
    });

    // Periodic refresh so header reflects settings/dictionary changes
    this.pollHandle = window.setInterval(() => {
      this.renderHeader();
    }, 1500);

    this.updateTranslate();
    this.renderBrowser();
  }

  async onClose() {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.translatorDebounceTimer !== null) {
      window.clearTimeout(this.translatorDebounceTimer);
      this.translatorDebounceTimer = null;
    }
  }

  /** Called by the plugin after dictionary reload or settings change. */
  refresh() {
    this.lastRenderedText = "";
    this.renderHeader();
    this.updateTranslate();
    this.renderBrowser();
    // Update translator labels in case the active language name changed,
    // and re-translate in case the dictionary changed.
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
  }

  // ===== Header =====

  private renderHeader() {
    this.headerEl.empty();
    const allLangs = this.plugin.settings.languages;
    const activeLangs = this.plugin.getActiveLanguages();
    const activeNames = new Set(activeLangs.map((l) => l.name));
    const primary = this.plugin.getPrimaryLanguage();

    const title = this.headerEl.createDiv({ cls: "conlang-panel-title" });
    if (activeLangs.length === 0) {
      title.setText("No active language");
    } else if (activeLangs.length === 1) {
      title.setText(`Language: ${activeLangs[0].name}`);
    } else {
      title.setText(`${activeLangs.length} languages active`);
    }

    const subtitle = this.headerEl.createDiv({ cls: "conlang-panel-subtitle" });
    if (activeLangs.length > 0) {
      const count = this.plugin.dictionary.allEntries().length;
      subtitle.setText(`${count} dictionary ${count === 1 ? "entry" : "entries"}`);
    }

    // Language chips — only shown when there's more than one configured
    // language. With a single language, chips are noise.
    if (allLangs.length > 1) {
      const chipRow = this.headerEl.createDiv({ cls: "conlang-lang-chips" });
      for (const lang of allLangs) {
        const isActive = activeNames.has(lang.name);
        const isPrimary = lang.name === primary?.name;
        const chip = chipRow.createDiv({
          cls: `conlang-lang-chip${isActive ? " is-active" : ""}${isPrimary ? " is-primary" : ""}`,
        });
        // The chip body: toggle active on click
        const body = chip.createSpan({ cls: "conlang-lang-chip-body" });
        body.setText(lang.name);
        body.title = isActive
          ? `${lang.name} is active. Click to deactivate.`
          : `${lang.name} is inactive. Click to activate.`;
        body.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleLanguageActive(lang.name);
        });

        // The star: indicates primary, click to set primary
        const star = chip.createSpan({ cls: "conlang-lang-chip-star" });
        star.setText(isPrimary ? "★" : "☆");
        star.title = isPrimary
          ? `${lang.name} is the primary language. New entries go here and English→conlang targets this language.`
          : isActive
            ? `Click the star to make ${lang.name} the primary language.`
            : "Activate this language first to make it primary.";
        if (isActive) {
          star.addEventListener("click", (e) => {
            e.stopPropagation();
            this.setPrimaryLanguage(lang.name);
          });
        } else {
          star.addClass("is-disabled");
        }
      }
    }

    // Quick-action row: buttons to add dictionary entries.
    if (primary) {
      const actions = this.headerEl.createDiv({ cls: "conlang-panel-header-actions" });

      const wordBtn = actions.createEl("button", {
        text: "+ Word",
        cls: "conlang-panel-btn",
      });
      wordBtn.title = `Add a new word to ${primary.name} (the primary language). Click a star above to change the primary.`;
      wordBtn.addEventListener("click", () => this.plugin.createWordFromPanel());

      const nameBtn = actions.createEl("button", {
        text: "+ Name",
        cls: "conlang-panel-btn",
      });
      nameBtn.title = `Add a proper noun to ${primary.name}. Locked at creation so cypher changes don't affect it.`;
      nameBtn.addEventListener("click", () => this.plugin.createName());
    }
  }

  /**
   * Toggle whether a language is in the active list. Updates settings,
   * reloads the dictionary, and re-renders the header. Refuses to deactivate
   * the last active language (one must always be active).
   */
  private async toggleLanguageActive(name: string) {
    const settings = this.plugin.settings;
    const current = new Set(settings.activeLanguages);
    if (current.has(name)) {
      // Don't allow turning off the only active language
      if (current.size <= 1) {
        new Notice("Made Up Words: at least one language must be active.");
        return;
      }
      current.delete(name);
      // If we just deactivated the primary, reassign
      if (settings.primaryLanguage === name) {
        settings.primaryLanguage = Array.from(current)[0];
      }
    } else {
      current.add(name);
    }
    settings.activeLanguages = Array.from(current);
    await this.plugin.saveSettings();
    await this.plugin.reloadActiveLanguage();
    this.renderHeader();
    this.renderBrowser();
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
  }

  /**
   * Set the primary language. The chosen language must already be active
   * (the UI prevents calling this otherwise).
   */
  private async setPrimaryLanguage(name: string) {
    const settings = this.plugin.settings;
    if (!settings.activeLanguages.includes(name)) return;
    if (settings.primaryLanguage === name) return;
    settings.primaryLanguage = name;
    await this.plugin.saveSettings();
    this.renderHeader();
    this.updateTranslatorLabels();
  }

  // ===== Tabs =====

  private renderTabs() {
    this.tabsEl.empty();
    const mkTab = (id: TabId, label: string) => {
      const tab = this.tabsEl.createDiv({ cls: "conlang-tab" });
      tab.setText(label);
      if (id === this.activeTab) tab.addClass("active");
      tab.addEventListener("click", () => {
        if (this.activeTab === id) return;
        this.activeTab = id;
        this.renderTabs();
        this.showActiveTab();
        // Re-render the tab we just switched into so it reflects current state
        if (id === "translate") this.updateTranslate();
        else if (id === "dictionary") this.renderBrowser();
        else if (id === "translator") this.runTranslatorTranslation();
      });
      return tab;
    };
    mkTab("translate", "Selection");
    mkTab("translator", "Translator");
    mkTab("dictionary", "Dictionary");
  }

  private showActiveTab() {
    this.translateEmptyEl.style.display = "none";
    this.translateBodyEl.style.display = "none";
    this.browserEl.style.display = "none";
    this.translatorEl.style.display = "none";

    if (this.activeTab === "translate") {
      // The updateTranslate method decides between empty and body visibility
      // based on whether there's a selection. Default to empty until it runs.
      this.translateEmptyEl.style.display = "block";
    } else if (this.activeTab === "dictionary") {
      this.browserEl.style.display = "block";
    } else if (this.activeTab === "translator") {
      this.translatorEl.style.display = "block";
      // Focus the input so the user can start typing immediately
      setTimeout(() => this.translatorInputEl?.focus(), 0);
    }
  }

  // ===== Translate tab =====

  private buildTranslateTab() {
    this.translateEmptyEl = this.tabContentEl.createDiv({ cls: "conlang-panel-empty" });
    this.translateEmptyEl.createDiv({
      text: "Highlight text in a note.",
      cls: "conlang-empty-headline",
    });
    const hint = this.translateEmptyEl.createDiv({ cls: "conlang-empty-hint" });
    hint.setText(
      "This tab updates automatically as you select text. Select English to see how it translates, or select a conlang word to see its dictionary entry. For free-form typing, use the Translator tab instead."
    );

    this.translateBodyEl = this.tabContentEl.createDiv({ cls: "conlang-panel-body" });

    const translationBlock = this.translateBodyEl.createDiv({ cls: "conlang-panel-block" });
    this.sourceLabel = translationBlock.createDiv({ cls: "conlang-panel-label" });
    this.sourceText = translationBlock.createDiv({
      cls: "conlang-panel-text conlang-panel-source",
    });
    const arrow = translationBlock.createDiv({ cls: "conlang-panel-arrow" });
    arrow.setText("↓");
    this.translationLabel = translationBlock.createDiv({ cls: "conlang-panel-label" });
    this.translationText = translationBlock.createDiv({
      cls: "conlang-panel-text conlang-panel-translation",
    });

    this.actionsEl = this.translateBodyEl.createDiv({ cls: "conlang-panel-actions" });
    this.entriesEl = this.translateBodyEl.createDiv({ cls: "conlang-panel-entries" });
  }

  private updateScheduled: boolean = false;
  private scheduleTranslateUpdate() {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    window.requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.updateTranslate();
    });
  }

  private updateTranslate() {
    if (this.activeTab !== "translate") return;

    const text = this.readSelection();
    if (text === this.lastRenderedText) return;
    this.lastRenderedText = text;

    if (!text || text.trim().length === 0) {
      this.translateBodyEl.style.display = "none";
      this.translateEmptyEl.style.display = "block";
      return;
    }

    this.translateEmptyEl.style.display = "none";
    this.translateBodyEl.style.display = "block";

    // If the selection is a single word AND that word resolves to a dictionary
    // entry (directly or via inflection), render the "word details" view
    // instead of the standard translation. This is the learning-tool mode.
    const wordMatch = this.detectSingleWord(text);
    if (wordMatch) {
      this.renderWordDetails(text, wordMatch.entry, wordMatch.viaInflection);
      return;
    }

    const conlangWords = this.findConlangWords(text);
    const direction: "english-to-conlang" | "conlang-to-english" =
      conlangWords.length > 0 ? "conlang-to-english" : "english-to-conlang";

    this.renderTranslation(text, direction, conlangWords);
  }

  /**
   * If the selection looks like a single dictionary-resolvable word, return
   * the matched entry and whether we matched via inflection (so we can
   * label the originating form on screen). Returns null otherwise.
   */
  private detectSingleWord(text: string): {
    entry: DictionaryEntry;
    viaInflection: { form: string; label: string } | null;
  } | null {
    const trimmed = text.trim();

    // Phrase case: selection is multiple words. Try a phrase match.
    // Allow letters (any script), apostrophes, hyphens, and whitespace.
    if (/^[\p{L}'\s-]+$/u.test(trimmed) && /\s/.test(trimmed)) {
      const phrases = this.plugin.dictionary.allPhrases();
      const phraseMatch = matchPhraseAtStart(trimmed, phrases);
      // For phrase matches, only enter word-details mode if the ENTIRE selection
      // is one phrase. Partial phrase matches fall through to the standard
      // translation view.
      if (phraseMatch && phraseMatch.matchedText.toLowerCase() === trimmed.toLowerCase()) {
        return { entry: phraseMatch.entry, viaInflection: null };
      }
      return null;
    }

    // Single-word case: letters (any script), apostrophes, hyphens
    if (!/^[\p{L}'-]+$/u.test(trimmed)) return null;

    const cleaned = cleanWord(trimmed);
    if (!cleaned) return null;

    // Direct lookup (conlang word)
    const direct = this.plugin.dictionary.lookup(cleaned);
    if (direct) {
      return { entry: direct, viaInflection: null };
    }

    // Inflected form
    const lang = this.plugin.getActiveLanguage();
    if (lang) {
      const m = findInflection(cleaned, this.plugin.dictionary, lang.inflections);
      if (m) {
        return {
          entry: m.lemma,
          viaInflection: { form: m.inflectedForm, label: m.rule.label },
        };
      }
    }

    // English word that matches a definition
    const englishHits = this.plugin.dictionary.lookupEnglish(cleaned);
    if (englishHits.length > 0) {
      return { entry: englishHits[0], viaInflection: null };
    }

    return null;
  }

  private readSelection(): string {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const editorSel = view.editor.getSelection();
      if (editorSel && editorSel.length > 0) return editorSel;
    }
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      const anchor = sel.anchorNode;
      if (anchor instanceof Node) {
        const el =
          anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
        if (el && el.closest(".conlang-panel")) return "";
      }
      return sel.toString();
    }
    return "";
  }

  private findConlangWords(text: string): DictionaryEntry[] {
    const found: DictionaryEntry[] = [];
    const seen = new Set<string>();
    const lang = this.plugin.getActiveLanguage();
    const phrases = this.plugin.dictionary.allPhrases();
    // Use the phrase tokeniser so we recognise multi-word entries
    const tokens = tokeniseWithPhrases(text, phrases);
    for (const t of tokens) {
      if (t.kind === "separator") continue;
      let entry: DictionaryEntry | undefined;
      if (t.kind === "phrase") {
        entry = t.entry;
      } else {
        // word token
        entry = this.plugin.dictionary.lookup(t.text);
        if (!entry && lang) {
          const m = findInflection(t.text, this.plugin.dictionary, lang.inflections);
          if (m) entry = m.lemma;
        }
      }
      if (entry && !seen.has(entry.word.toLowerCase())) {
        seen.add(entry.word.toLowerCase());
        found.push(entry);
      }
    }
    return found;
  }

  private renderTranslation(
    text: string,
    direction: "english-to-conlang" | "conlang-to-english",
    conlangWords: DictionaryEntry[]
  ) {
    // Make sure the translation block is visible (might have been hidden
    // by a previous word-details render).
    this.setTranslationBlockVisible(true);

    const lang = this.plugin.getActiveLanguage();

    if (direction === "english-to-conlang") {
      this.sourceLabel.setText("English");
      this.translationLabel.setText(lang ? lang.name : "Language");
      this.sourceText.setText(text);
      this.translationText.setText(this.plugin.translateToConlang(text));
    } else {
      this.sourceLabel.setText(lang ? lang.name : "Language");
      this.translationLabel.setText("English");
      this.sourceText.setText(text);
      this.translationText.setText(this.translateConlangToEnglish(text));
    }

    this.renderActions(text, direction);
    this.renderEntries(conlangWords, text, direction);
  }

  /**
   * Hide or show the translation block (source/arrow/translation lines).
   * Used by renderWordDetails to take over the space.
   */
  private setTranslationBlockVisible(visible: boolean) {
    const block = this.sourceLabel.parentElement; // the .conlang-panel-block wrapping it
    if (block) block.style.display = visible ? "" : "none";
    this.actionsEl.style.display = visible ? "" : "none";
  }

  /**
   * The "word details" view: rich card for a single dictionary entry.
   * Shows definition, POS, IPA, etymology, and all generated inflected forms
   * grouped by inflection label.
   */
  private renderWordDetails(
    selectedText: string,
    entry: DictionaryEntry,
    viaInflection: { form: string; label: string } | null
  ) {
    // The translation block is hidden; the entries container holds everything.
    this.setTranslationBlockVisible(false);
    this.entriesEl.empty();

    const lang = this.plugin.getActiveLanguage();

    // === Top card: the dictionary entry itself ===
    const card = this.entriesEl.createDiv({ cls: "conlang-word-card" });

    const head = card.createDiv({ cls: "conlang-word-card-head" });
    const wordEl = head.createSpan({ cls: "conlang-word-card-word" });
    wordEl.setText(entry.word);
    if (entry.partOfSpeech) {
      const pos = head.createSpan({ cls: "conlang-word-card-pos" });
      pos.setText(entry.partOfSpeech);
    }
    if (entry.ipa) {
      const ipa = head.createSpan({ cls: "conlang-word-card-ipa" });
      ipa.setText(entry.ipa);
    }

    const def = card.createDiv({ cls: "conlang-word-card-def" });
    def.setText(entry.definition);

    if (entry.etymology) {
      const etym = card.createDiv({ cls: "conlang-word-card-etym" });
      etym.setText(`Etymology: ${entry.etymology}`);
    }

    // If we arrived here via an inflected form, surface that fact.
    if (viaInflection) {
      const note = card.createDiv({ cls: "conlang-word-card-note" });
      note.setText(
        `"${viaInflection.form}" is the ${viaInflection.label} form of ${entry.word}`
      );
      const explanation = explainInflection(viaInflection.label);
      if (explanation) {
        note.title = explanation;
        note.addClass("has-explanation");
      }
    }

    // Click the card to open the entry note
    card.style.cursor = "pointer";
    card.addEventListener("click", async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });

    // === Compound decomposition: show parts if this is a compound ===
    if (entry.parts && entry.parts.length > 0) {
      this.renderPartsDecomposition(entry.parts);
    }

    // === Generated forms ===
    const generated: GeneratedForm[] = lang
      ? generateInflections(entry, lang.inflections)
      : [];

    if (generated.length === 0) {
      const empty = this.entriesEl.createDiv({ cls: "conlang-forms-empty" });
      if (!entry.partOfSpeech) {
        empty.setText(
          "No inflected forms predicted — this entry has no part of speech, so POS-filtered rules don't apply. " +
            "Edit the entry's frontmatter to add a partOfSpeech."
        );
      } else {
        empty.setText(
          `No inflection rules apply to ${entry.partOfSpeech}s. Add rules in Settings → Conlang → Inflection rules.`
        );
      }
      return;
    }

    const header = this.entriesEl.createDiv({ cls: "conlang-panel-section-header" });
    header.setText("Predicted forms");

    // Group by inflection label so e.g. two "plural" rules show side-by-side
    const groups = new Map<string, GeneratedForm[]>();
    for (const g of generated) {
      const list = groups.get(g.rule.label) ?? [];
      list.push(g);
      groups.set(g.rule.label, list);
    }

    const formsList = this.entriesEl.createDiv({ cls: "conlang-forms-list" });
    for (const [label, items] of groups) {
      const row = formsList.createDiv({ cls: "conlang-form-row" });
      const labelEl = row.createDiv({ cls: "conlang-form-label" });
      labelEl.setText(label);

      // Add a hover tooltip explaining what this category means.
      // Priority: user's own description on the rule > built-in explanation > nothing.
      // We check description on the first rule in the group (they share a label).
      const customDescription = items[0]?.rule.description;
      const explanation = customDescription || explainInflection(label);
      if (explanation) {
        labelEl.title = explanation;
        labelEl.addClass("has-explanation");
      }

      const formsEl = row.createDiv({ cls: "conlang-form-values" });
      for (const item of items) {
        const formEl = formsEl.createSpan({ cls: "conlang-form-value" });
        formEl.setText(item.form);
      }
    }

    // Helpful hint at the bottom
    const hint = this.entriesEl.createDiv({ cls: "conlang-forms-hint" });
    hint.setText(
      "Forms are predicted from your inflection rules. Hover any of them in a note to see this entry."
    );
  }

  /**
   * Render a compound entry's parts as clickable chips. Each part is looked
   * up in the dictionary; if found, the chip shows its meaning and clicking
   * navigates to that part's entry. Unknown parts are shown greyed out.
   */
  private renderPartsDecomposition(parts: string[]) {
    const section = this.entriesEl.createDiv({ cls: "conlang-parts-section" });
    const header = section.createDiv({ cls: "conlang-panel-section-header" });
    header.setText("Parts");
    const list = section.createDiv({ cls: "conlang-parts-list" });
    for (const part of parts) {
      const chip = list.createDiv({ cls: "conlang-part-chip" });
      const wordEl = chip.createSpan({ cls: "conlang-part-word" });
      wordEl.setText(part);
      const entry = this.plugin.dictionary.lookup(part);
      if (entry) {
        const sep = chip.createSpan({ cls: "conlang-part-sep" });
        sep.setText("→");
        const meaningEl = chip.createSpan({ cls: "conlang-part-meaning" });
        const sense = firstSense(entry.definition);
        meaningEl.setText(sense || entry.definition);
        chip.style.cursor = "pointer";
        chip.addEventListener("click", async () => {
          const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
          if (file instanceof TFile) {
            await this.plugin.app.workspace.getLeaf(false).openFile(file);
          }
        });
      } else {
        chip.addClass("unknown");
        chip.title = "This part isn't in the dictionary.";
      }
    }
  }

  private translateConlangToEnglish(text: string): string {
    const lang = this.plugin.getActiveLanguage();
    const phrases = this.plugin.dictionary.allPhrases();
    const tokens = tokeniseWithPhrases(text, phrases);
    const out: string[] = [];
    for (const t of tokens) {
      if (t.kind === "separator") {
        out.push(t.text);
        continue;
      }
      if (t.kind === "phrase" && t.entry) {
        // Use the first English sense as a quick gloss for the phrase
        const sense = firstSense(t.entry.definition);
        out.push(sense || t.text);
        continue;
      }
      // Single-word token: try direct lookup, then inflection, then reverse cypher
      const word = t.text;
      const entry = this.plugin.dictionary.lookup(word);
      if (entry) {
        const sense = firstSense(entry.definition);
        out.push(sense || word);
        continue;
      }
      if (lang) {
        const m = findInflection(word, this.plugin.dictionary, lang.inflections);
        if (m) {
          const sense = firstSense(m.lemma.definition) || m.lemma.word;
          out.push(`${sense}.${m.rule.label.toUpperCase()}`);
          continue;
        }
        out.push(applyCypherReverse(word, lang.sheets));
        continue;
      }
      out.push(word);
    }
    return out.join("");
  }

  private renderActions(
    text: string,
    direction: "english-to-conlang" | "conlang-to-english"
  ) {
    this.actionsEl.empty();
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const hasEditor = view !== null && view.editor.getSelection() === text;

    if (direction === "english-to-conlang") {
      const replaceBtn = this.actionsEl.createEl("button", {
        text: "Replace in note",
        cls: "conlang-panel-btn conlang-panel-btn-primary",
      });
      replaceBtn.disabled = !hasEditor;
      if (!hasEditor) replaceBtn.title = "Make a selection in an editor to enable.";
      replaceBtn.addEventListener("click", () => {
        if (view) this.plugin.commitSelectionToConlang(view.editor);
      });

      const createBtn = this.actionsEl.createEl("button", {
        text: "Save to dictionary",
        cls: "conlang-panel-btn",
      });
      createBtn.title =
        "Create a dictionary entry mapping this English text to its cyphered form.";
      createBtn.addEventListener("click", () => {
        this.plugin.createDictionaryEntryForText(text);
      });
    }
  }

  private renderEntries(
    entries: DictionaryEntry[],
    text: string,
    direction: "english-to-conlang" | "conlang-to-english"
  ) {
    this.entriesEl.empty();

    if (direction === "english-to-conlang") {
      const matched: DictionaryEntry[] = [];
      const words = text.match(WORD_RE) ?? [];
      const seen = new Set<string>();
      for (const w of words) {
        const hits = this.plugin.dictionary.lookupEnglish(w);
        for (const e of hits) {
          if (!seen.has(e.word.toLowerCase())) {
            seen.add(e.word.toLowerCase());
            matched.push(e);
          }
        }
      }
      if (matched.length > 0) {
        const header = this.entriesEl.createDiv({ cls: "conlang-panel-section-header" });
        header.setText("Matched dictionary entries");
        for (const entry of matched) this.renderEntryCard(this.entriesEl, entry);
      }
      return;
    }

    if (entries.length === 0) return;
    const header = this.entriesEl.createDiv({ cls: "conlang-panel-section-header" });
    header.setText("Dictionary entries");
    for (const entry of entries) this.renderEntryCard(this.entriesEl, entry);
  }

  private renderEntryCard(parent: HTMLElement, entry: DictionaryEntry) {
    const card = parent.createDiv({ cls: "conlang-panel-entry" });

    const top = card.createDiv({ cls: "conlang-panel-entry-top" });
    const word = top.createSpan({ cls: "conlang-panel-entry-word" });
    word.setText(entry.word);
    if (entry.partOfSpeech) {
      const pos = top.createSpan({ cls: "conlang-panel-entry-pos" });
      pos.setText(entry.partOfSpeech);
    }
    if (entry.ipa) {
      const ipa = top.createSpan({ cls: "conlang-panel-entry-ipa" });
      ipa.setText(entry.ipa);
    }

    const def = card.createDiv({ cls: "conlang-panel-entry-def" });
    def.setText(entry.definition);

    if (entry.etymology) {
      const etym = card.createDiv({ cls: "conlang-panel-entry-etym" });
      etym.setText(`Etymology: ${entry.etymology}`);
    }

    card.style.cursor = "pointer";
    card.addEventListener("click", async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });
  }

  // ===== Translator tab (free-form text input) =====

  private buildTranslatorTab() {
    this.translatorEl = this.tabContentEl.createDiv({ cls: "conlang-translator" });

    // Source row: label
    const sourceRow = this.translatorEl.createDiv({ cls: "conlang-translator-row" });
    this.translatorSourceLabel = sourceRow.createDiv({ cls: "conlang-translator-label" });

    this.translatorInputEl = this.translatorEl.createEl("textarea", {
      cls: "conlang-translator-input",
    });
    this.translatorInputEl.placeholder = "Type something to look up…";
    this.translatorInputEl.rows = 4;
    this.translatorInputEl.value = this.translatorInput;
    this.translatorInputEl.addEventListener("input", () => {
      this.translatorInput = this.translatorInputEl.value;
      this.scheduleTranslatorTranslation();
    });

    // Swap button between input and output
    const swapRow = this.translatorEl.createDiv({ cls: "conlang-translator-swap-row" });
    this.translatorSwapBtn = swapRow.createEl("button", {
      text: "↑↓ Swap direction",
      cls: "conlang-panel-btn conlang-translator-swap",
    });
    this.translatorSwapBtn.title = "Swap which language is the source and which is the target.";
    this.translatorSwapBtn.addEventListener("click", () => this.swapTranslatorDirection());

    // Mode toggle: Gloss (default, per-word breakdown) vs Transliterate (flat output)
    const modeRow = this.translatorEl.createDiv({ cls: "conlang-translator-mode-row" });
    const modeLabel = modeRow.createSpan({ cls: "conlang-browser-control-label" });
    modeLabel.setText("Mode");
    const modeGroup = modeRow.createDiv({ cls: "conlang-browser-segmented" });
    const modes: { value: typeof this.translatorMode; label: string; tooltip: string }[] = [
      {
        value: "gloss",
        label: "Gloss",
        tooltip:
          "Word-by-word breakdown. Each word shows its dictionary candidates. Words with no dictionary match are clearly flagged. This is what the plugin actually knows — not a fluent translation.",
      },
      {
        value: "transliterate",
        label: "Transliterate",
        tooltip:
          "Flat output: dictionary words substituted, unknown words run through the cypher as placeholders. Useful for the 'English with different sounds' use case, but not real translation — cypher output is not real conlang grammar.",
      },
    ];
    for (const m of modes) {
      const btn = modeGroup.createEl("button", { text: m.label, cls: "conlang-browser-segment" });
      btn.title = m.tooltip;
      if (m.value === this.translatorMode) btn.addClass("active");
      btn.addEventListener("click", () => {
        this.translatorMode = m.value;
        modeGroup.querySelectorAll(".conlang-browser-segment").forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        this.runTranslatorTranslation();
      });
    }

    // Target row: label
    const targetRow = this.translatorEl.createDiv({ cls: "conlang-translator-row" });
    this.translatorTargetLabel = targetRow.createDiv({ cls: "conlang-translator-label" });
    this.translatorCopyBtn = targetRow.createEl("button", {
      text: "Copy",
      cls: "conlang-translator-copy-btn",
    });
    this.translatorCopyBtn.title = "Copy the transliteration output to your clipboard. (Gloss mode is rich content and isn't copyable as plain text.)";
    this.translatorCopyBtn.addEventListener("click", () => this.copyTranslation());

    // Output area: either a gloss render (rich token list) or a flat string
    this.translatorOutputEl = this.translatorEl.createDiv({
      cls: "conlang-translator-output",
    });

    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
  }

  /**
   * Update the source/target language labels based on the current direction.
   */
  private updateTranslatorLabels() {
    const primary = this.plugin.getPrimaryLanguage();
    const activeLangs = this.plugin.getActiveLanguages();
    const primaryName = primary?.name ?? "Language";

    if (this.translatorDirection === "english-to-conlang") {
      this.translatorSourceLabel?.setText("English");
      // English → conlang always targets the primary (cypher can only output
      // one language). When there are multiple actives, make this explicit
      // so users know what's happening.
      if (activeLangs.length > 1) {
        this.translatorTargetLabel?.setText(`${primaryName} (primary)`);
      } else {
        this.translatorTargetLabel?.setText(primaryName);
      }
    } else {
      // Conlang → English queries ALL active languages. Show the source as
      // a combined list when more than one is active.
      if (activeLangs.length > 1) {
        this.translatorSourceLabel?.setText(
          activeLangs.map((l) => l.name).join(" / ")
        );
      } else {
        this.translatorSourceLabel?.setText(primaryName);
      }
      this.translatorTargetLabel?.setText("English");
    }
  }

  private scheduleTranslatorTranslation() {
    if (this.translatorDebounceTimer !== null) {
      window.clearTimeout(this.translatorDebounceTimer);
    }
    this.translatorDebounceTimer = window.setTimeout(() => {
      this.translatorDebounceTimer = null;
      this.runTranslatorTranslation();
    }, 200);
  }

  /**
   * Run the lookup and render the output according to the current mode.
   */
  private runTranslatorTranslation() {
    if (!this.translatorOutputEl) return;
    const input = this.translatorInput;
    this.translatorOutputEl.empty();
    this.translatorOutputEl.removeClass("is-empty");

    if (!input || input.trim().length === 0) {
      this.translatorOutputEl.addClass("is-empty");
      this.translatorOutputEl.setText(
        this.translatorMode === "gloss"
          ? "Type to see a word-by-word breakdown."
          : "Translation will appear here."
      );
      return;
    }

    const lang = this.plugin.getActiveLanguage();
    const tokens =
      this.translatorDirection === "english-to-conlang"
        ? glossEnglishToConlang(input, this.plugin.dictionary, lang)
        : glossConlangToEnglish(input, this.plugin.dictionary, lang);

    if (this.translatorMode === "gloss") {
      this.renderGloss(tokens);
    } else {
      this.renderTransliteration(tokens);
    }
  }

  /**
   * Render the gloss as a list of word-by-word cards. Each card shows the
   * source word, the kind of match, and any candidates. This is the honest
   * representation: it does NOT pretend to assemble fluent translation.
   */
  private renderGloss(tokens: GlossToken[]) {
    const list = this.translatorOutputEl.createDiv({ cls: "conlang-gloss-list" });
    const visibleTokens = tokens.filter((t) => t.kind !== "separator");
    if (visibleTokens.length === 0) {
      this.translatorOutputEl.addClass("is-empty");
      this.translatorOutputEl.setText("Nothing to look up.");
      return;
    }
    for (const t of visibleTokens) {
      this.renderGlossToken(list, t);
    }
    // Honest footer: explain what the user is looking at
    const footer = this.translatorOutputEl.createDiv({ cls: "conlang-gloss-footer" });
    footer.setText(
      "This is a per-word lookup — not a fluent translation. Real translation requires grammar your dictionary entries don't encode."
    );
  }

  private renderGlossToken(parent: HTMLElement, t: GlossToken) {
    const card = parent.createDiv({ cls: `conlang-gloss-token kind-${t.kind}` });

    const head = card.createDiv({ cls: "conlang-gloss-token-head" });
    const source = head.createSpan({ cls: "conlang-gloss-token-source" });
    source.setText(t.source);

    switch (t.kind) {
      case "dictionary": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        const candidates = t.candidates ?? [];
        if (candidates.length === 1) {
          const single = head.createSpan({ cls: "conlang-gloss-token-target" });
          single.setText(candidates[0].word);
          this.renderTokenMeta(card, candidates[0]);
        } else {
          const note = head.createSpan({ cls: "conlang-gloss-multi-note" });
          note.setText(`${candidates.length} senses`);
          this.renderCandidates(card, candidates);
        }
        break;
      }
      case "phrase": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        const c = t.candidates?.[0];
        if (c) {
          const target = head.createSpan({ cls: "conlang-gloss-token-target" });
          target.setText(c.word);
          const tag = head.createSpan({ cls: "conlang-gloss-token-tag" });
          tag.setText("phrase");
          this.renderTokenMeta(card, c);
        }
        break;
      }
      case "inflected": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        if (t.inflection) {
          const target = head.createSpan({ cls: "conlang-gloss-token-target" });
          const sense = firstSense(t.inflection.lemma.definition);
          target.setText(sense || t.inflection.lemma.word);
          const tag = head.createSpan({ cls: "conlang-gloss-token-tag" });
          tag.setText(t.inflection.label);
          const expl = explainInflection(t.inflection.label);
          if (expl) tag.title = expl;
          // Show the lemma underneath
          const meta = card.createDiv({ cls: "conlang-gloss-token-meta" });
          meta.setText(`lemma: ${t.inflection.lemma.word}`);
        }
        break;
      }
      case "cypher-fallback": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("≈");
        const target = head.createSpan({ cls: "conlang-gloss-token-target" });
        target.setText(t.cypherOutput ?? "");
        const tag = head.createSpan({ cls: "conlang-gloss-token-tag conlang-gloss-warn" });
        tag.setText("cypher only");
        tag.title = "No dictionary entry — this is a phonological placeholder from the cypher rules, not a real translation.";
        break;
      }
      case "no-match": {
        const tag = head.createSpan({ cls: "conlang-gloss-token-tag conlang-gloss-warn" });
        tag.setText("no match");
        tag.title = "No dictionary entry and the cypher rules don't apply. Consider adding this to the dictionary.";
        break;
      }
    }
  }

  /** Render small metadata line (POS, IPA) under a token. */
  private renderTokenMeta(card: HTMLElement, entry: DictionaryEntry) {
    const meta = card.createDiv({ cls: "conlang-gloss-token-meta" });
    const parts: string[] = [];
    if (entry.partOfSpeech) parts.push(entry.partOfSpeech);
    if (entry.ipa) parts.push(entry.ipa);
    const sense = firstSense(entry.definition);
    if (sense && sense.toLowerCase() !== entry.word.toLowerCase()) {
      parts.push(`"${sense}"`);
    }
    meta.setText(parts.join(" · "));
    card.style.cursor = "pointer";
    card.addEventListener("click", async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });
  }

  /** Render multiple candidates as a list when an English word has multiple senses. */
  private renderCandidates(card: HTMLElement, candidates: DictionaryEntry[]) {
    const list = card.createDiv({ cls: "conlang-gloss-candidates" });
    // Only show language tags when more than one language is active —
    // otherwise it's just visual noise.
    const showLang = this.plugin.getActiveLanguages().length > 1;
    for (const entry of candidates) {
      const row = list.createDiv({ cls: "conlang-gloss-candidate" });
      const word = row.createSpan({ cls: "conlang-gloss-candidate-word" });
      word.setText(entry.word);
      if (showLang && entry.language) {
        const lang = row.createSpan({ cls: "conlang-gloss-candidate-lang" });
        lang.setText(entry.language);
      }
      if (entry.partOfSpeech) {
        const pos = row.createSpan({ cls: "conlang-gloss-candidate-pos" });
        pos.setText(entry.partOfSpeech);
      }
      const def = row.createSpan({ cls: "conlang-gloss-candidate-def" });
      def.setText(entry.definition);
      row.style.cursor = "pointer";
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
        if (file instanceof TFile) {
          await this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      });
    }
  }

  /**
   * Render flat transliteration output with cypher fallbacks visually marked.
   * The output is still text-based, but we wrap cypher-fallback words in a
   * span so the user can see at a glance which words are placeholders.
   */
  private renderTransliteration(tokens: GlossToken[]) {
    const container = this.translatorOutputEl.createDiv({ cls: "conlang-translit" });
    for (const t of tokens) {
      switch (t.kind) {
        case "separator":
          container.appendText(t.source);
          break;
        case "dictionary":
        case "phrase":
          if (t.candidates && t.candidates.length > 0) {
            const span = container.createSpan({ cls: "conlang-translit-dict" });
            span.setText(applyCasing(t.source, t.candidates[0].word));
            if (t.candidates.length > 1) {
              span.title = `${t.candidates.length} senses: ${t.candidates.map((c) => c.word).join(", ")}`;
              span.addClass("multi-sense");
            }
          } else {
            container.appendText(t.source);
          }
          break;
        case "inflected":
          if (t.inflection) {
            const span = container.createSpan({ cls: "conlang-translit-dict" });
            const sense = firstSense(t.inflection.lemma.definition);
            span.setText(`${sense || t.inflection.lemma.word}.${t.inflection.label.toUpperCase()}`);
          }
          break;
        case "cypher-fallback":
          const cspan = container.createSpan({ cls: "conlang-translit-cypher" });
          cspan.setText(t.cypherOutput ?? t.source);
          cspan.title = "Cypher placeholder — no dictionary entry exists for this word.";
          break;
        case "no-match":
          const nspan = container.createSpan({ cls: "conlang-translit-nomatch" });
          nspan.setText(t.source);
          nspan.title = "No dictionary entry and no cypher transformation. Original word unchanged.";
          break;
      }
    }

    const footer = this.translatorOutputEl.createDiv({ cls: "conlang-gloss-footer" });
    footer.setText(
      "Words from your dictionary are in plain text. Italicised words are cypher placeholders — they preserve sound but don't carry conlang grammar."
    );
  }

  /**
   * Swap the translation direction. The current source text stays as input,
   * we just flip the direction. (We don't move output→input as before because
   * gloss output isn't plain text.)
   */
  private swapTranslatorDirection() {
    this.translatorDirection =
      this.translatorDirection === "english-to-conlang"
        ? "conlang-to-english"
        : "english-to-conlang";
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
    this.translatorInputEl?.focus();
  }

  /**
   * Copy current transliteration output (only works in transliterate mode;
   * gloss mode is rich and not copyable as plain text).
   */
  private async copyTranslation() {
    if (this.translatorMode !== "transliterate") {
      // Build the flat string from current tokens
      const input = this.translatorInput;
      if (!input.trim()) return;
      const lang = this.plugin.getActiveLanguage();
      const tokens =
        this.translatorDirection === "english-to-conlang"
          ? glossEnglishToConlang(input, this.plugin.dictionary, lang)
          : glossConlangToEnglish(input, this.plugin.dictionary, lang);
      const text = renderTransliterationString(tokens);
      try {
        await navigator.clipboard.writeText(text);
        const original = this.translatorCopyBtn.textContent ?? "Copy";
        this.translatorCopyBtn.setText("Copied!");
        this.translatorCopyBtn.disabled = true;
        window.setTimeout(() => {
          this.translatorCopyBtn.setText(original);
          this.translatorCopyBtn.disabled = false;
        }, 1200);
      } catch (e) {
        // clipboard unavailable
      }
      return;
    }
    const text = this.translatorOutputEl?.textContent ?? "";
    if (!text || this.translatorOutputEl?.hasClass("is-empty")) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = this.translatorCopyBtn.textContent ?? "Copy";
      this.translatorCopyBtn.setText("Copied!");
      this.translatorCopyBtn.disabled = true;
      window.setTimeout(() => {
        this.translatorCopyBtn.setText(original);
        this.translatorCopyBtn.disabled = false;
      }, 1200);
    } catch (e) {
      // ignore
    }
  }

  // ===== Dictionary tab (browser) =====

  private buildDictionaryTab() {
    this.browserEl = this.tabContentEl.createDiv({ cls: "conlang-browser" });

    // Toolbar: search + filter + sort
    this.browserToolbarEl = this.browserEl.createDiv({ cls: "conlang-browser-toolbar" });

    const searchInput = this.browserToolbarEl.createEl("input", {
      type: "search",
      cls: "conlang-browser-search",
      placeholder: "Search words or definitions…",
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderBrowserList();
    });

    const controlsRow = this.browserEl.createDiv({ cls: "conlang-browser-controls" });

    const sortLabel = controlsRow.createSpan({ cls: "conlang-browser-control-label" });
    sortLabel.setText("Sort");
    const sortSelect = controlsRow.createEl("select", { cls: "conlang-browser-select" });
    const sortOptions: { value: SortKey; label: string }[] = [
      { value: "alphabetical", label: "Alphabetical" },
      { value: "recent", label: "Recently added" },
      { value: "partOfSpeech", label: "Part of speech" },
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === this.sortKey) o.selected = true;
    }
    sortSelect.addEventListener("change", () => {
      this.sortKey = sortSelect.value as SortKey;
      this.renderBrowserList();
    });

    const posLabel = controlsRow.createSpan({ cls: "conlang-browser-control-label" });
    posLabel.setText("Type");
    const posSelect = controlsRow.createEl("select", { cls: "conlang-browser-select" });
    // The "all" option is always present; specific POS values are filled in
    // dynamically by renderBrowser() based on what's actually in the dictionary.
    posSelect.addEventListener("change", () => {
      this.posFilter = posSelect.value;
      this.renderBrowserList();
    });
    // Tag the element so we can find and refill it later
    posSelect.addClass("conlang-pos-select");

    // Names filter: a 3-way segmented control. Toggle to focus on (or hide)
    // proper nouns without re-typing them into the search box.
    const namesLabel = controlsRow.createSpan({ cls: "conlang-browser-control-label" });
    namesLabel.setText("Names");
    const namesGroup = controlsRow.createDiv({ cls: "conlang-browser-segmented" });
    const namesOptions: { value: typeof this.nameFilter; label: string; tooltip: string }[] = [
      { value: "all", label: "All", tooltip: "Show all entries, including proper nouns." },
      { value: "names-only", label: "Only", tooltip: "Show only proper nouns (characters, places, factions, etc.)." },
      { value: "hide-names", label: "Hide", tooltip: "Hide all proper nouns from the list." },
    ];
    for (const opt of namesOptions) {
      const btn = namesGroup.createEl("button", {
        text: opt.label,
        cls: "conlang-browser-segment",
      });
      btn.title = opt.tooltip;
      if (opt.value === this.nameFilter) btn.addClass("active");
      btn.addEventListener("click", () => {
        this.nameFilter = opt.value;
        namesGroup.querySelectorAll(".conlang-browser-segment").forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        this.renderBrowserList();
      });
    }

    // Language filter — only meaningful when multiple languages are active.
    // Empty string = show all active languages.
    const activeLangs = this.plugin.getActiveLanguages();
    if (activeLangs.length > 1) {
      const langLabel = controlsRow.createSpan({ cls: "conlang-browser-control-label" });
      langLabel.setText("Language");
      const langSelect = controlsRow.createEl("select", { cls: "conlang-browser-select" });
      langSelect.createEl("option", { text: "all", value: "" });
      for (const l of activeLangs) {
        langSelect.createEl("option", { text: l.name, value: l.name });
      }
      langSelect.value = this.languageFilter;
      langSelect.addEventListener("change", () => {
        this.languageFilter = langSelect.value;
        this.renderBrowserList();
      });
    }

    // Stats line
    this.browserStatsEl = this.browserEl.createDiv({ cls: "conlang-browser-stats" });

    // List + empty state. The text gets swapped depending on whether the
    // dictionary is genuinely empty or just hidden by filters.
    this.browserListEl = this.browserEl.createDiv({ cls: "conlang-browser-list" });
    this.browserEmptyEl = this.browserEl.createDiv({ cls: "conlang-browser-empty" });
  }

  private renderBrowser() {
    // Re-populate the POS dropdown to reflect the current dictionary's
    // actual parts of speech. This handles the case where the user adds
    // a word with a new POS we've not seen before.
    const posSelect = this.browserToolbarEl.parentElement?.querySelector(
      ".conlang-pos-select"
    ) as HTMLSelectElement | null;
    if (posSelect) {
      const previous = this.posFilter;
      posSelect.empty();
      posSelect.createEl("option", { text: "All", value: "" });
      const posSet = new Set<string>();
      for (const entry of this.plugin.dictionary.allEntries()) {
        if (entry.partOfSpeech) posSet.add(entry.partOfSpeech);
      }
      const sortedPos = Array.from(posSet).sort();
      for (const pos of sortedPos) {
        const opt = posSelect.createEl("option", { text: pos, value: pos });
        if (pos === previous) opt.selected = true;
      }
      // If the previously selected POS no longer exists, fall back to "All"
      if (previous && !posSet.has(previous)) {
        this.posFilter = "";
      }
    }

    this.renderBrowserList();
  }

  /** True if the entry's partOfSpeech indicates it's a proper noun. */
  private isProperNoun(entry: DictionaryEntry): boolean {
    const p = entry.partOfSpeech?.toLowerCase() ?? "";
    return p === "proper-noun" || p === "proper noun" || p === "propernoun";
  }

  private renderBrowserList() {
    this.browserListEl.empty();
    const all = this.plugin.dictionary.allEntries();

    // Filter
    const q = this.searchQuery.trim().toLowerCase();
    let filtered = all.filter((entry) => {
      // Names filter (proper-noun gating)
      const isName = this.isProperNoun(entry);
      if (this.nameFilter === "names-only" && !isName) return false;
      if (this.nameFilter === "hide-names" && isName) return false;

      // Language filter (only meaningful when multiple languages active)
      if (this.languageFilter && entry.language !== this.languageFilter) return false;

      if (this.posFilter && entry.partOfSpeech !== this.posFilter) return false;
      if (!q) return true;
      if (entry.word.toLowerCase().includes(q)) return true;
      if (entry.definition.toLowerCase().includes(q)) return true;
      // For names, also search by category (e.g. "place" finds all places)
      if (entry.nameCategory && entry.nameCategory.toLowerCase().includes(q)) return true;
      return false;
    });

    // Sort
    filtered = filtered.slice().sort((a, b) => {
      if (this.sortKey === "recent") {
        return (b.mtime ?? 0) - (a.mtime ?? 0);
      }
      if (this.sortKey === "partOfSpeech") {
        const pa = a.partOfSpeech ?? "~"; // ~ sorts after letters, so "no POS" ends up last
        const pb = b.partOfSpeech ?? "~";
        const c = pa.localeCompare(pb);
        if (c !== 0) return c;
      }
      return a.word.localeCompare(b.word);
    });

    // Stats
    this.renderStats(all, filtered);

    if (filtered.length === 0) {
      this.browserListEl.style.display = "none";
      this.browserEmptyEl.style.display = "block";
      this.browserEmptyEl.empty();
      if (all.length > 0) {
        // Entries exist but filters hide them all
        this.browserEmptyEl.createDiv({
          text: "No entries match your filters.",
          cls: "conlang-empty-headline",
        });
        const hint = this.browserEmptyEl.createDiv({ cls: "conlang-empty-hint" });
        hint.setText(
          "Try clearing the search box, changing the type filter, or switching the Names filter to 'All'."
        );
      } else {
        // Genuinely empty dictionary — first-time onboarding hint
        const primary = this.plugin.getPrimaryLanguage();
        this.browserEmptyEl.createDiv({
          text: "Your dictionary is empty.",
          cls: "conlang-empty-headline",
        });
        const hint = this.browserEmptyEl.createDiv({ cls: "conlang-empty-hint" });
        hint.setText(
          primary
            ? `Add your first word by clicking + Word at the top, or highlight any English text in a note and use the "Create dictionary entry from selection" command. Words are saved as markdown files in ${primary.dictionaryFolder}.`
            : "Activate at least one language in Settings → Conlang to start adding entries."
        );
      }
      return;
    }
    this.browserListEl.style.display = "block";
    this.browserEmptyEl.style.display = "none";

    for (const entry of filtered) {
      this.renderBrowserRow(entry);
    }
  }

  private renderStats(all: DictionaryEntry[], filtered: DictionaryEntry[]) {
    this.browserStatsEl.empty();

    const total = all.length;
    const shown = filtered.length;

    const summary = this.browserStatsEl.createSpan({ cls: "conlang-browser-stats-summary" });
    if (shown === total) {
      summary.setText(`${total} ${total === 1 ? "entry" : "entries"}`);
    } else {
      summary.setText(`${shown} of ${total} shown`);
    }

    // Per-POS breakdown of the FULL dictionary, not the filtered view
    const counts = new Map<string, number>();
    for (const entry of all) {
      const key = entry.partOfSpeech ?? "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size > 0 && counts.size <= 8) {
      const breakdown = this.browserStatsEl.createSpan({ cls: "conlang-browser-stats-breakdown" });
      const parts: string[] = [];
      const sortedKeys = Array.from(counts.keys()).sort();
      for (const k of sortedKeys) {
        parts.push(`${counts.get(k)} ${k}`);
      }
      breakdown.setText(`(${parts.join(", ")})`);
    }
  }

  private renderBrowserRow(entry: DictionaryEntry) {
    const row = this.browserListEl.createDiv({ cls: "conlang-browser-row" });
    if (this.isProperNoun(entry)) row.addClass("is-name");
    if (entry.isPhrase) row.addClass("is-phrase");

    const word = row.createDiv({ cls: "conlang-browser-row-word" });
    word.setText(entry.word);
    if (entry.isPhrase) {
      // Small "phrase" badge so multi-word entries are visually distinct
      const phraseBadge = word.createSpan({ cls: "conlang-browser-row-badge" });
      phraseBadge.setText("phrase");
    }
    // Language label, only shown when multiple languages are active so users
    // can see which language each entry belongs to in the merged list.
    const activeCount = this.plugin.getActiveLanguages().length;
    if (activeCount > 1 && entry.language) {
      const langBadge = word.createSpan({ cls: "conlang-browser-row-lang" });
      langBadge.setText(entry.language);
    }
    if (entry.partOfSpeech) {
      const tag = word.createSpan({ cls: "conlang-browser-row-pos" });
      // For proper nouns, show the more specific category if available
      if (this.isProperNoun(entry) && entry.nameCategory) {
        tag.setText(entry.nameCategory);
      } else {
        tag.setText(entry.partOfSpeech);
      }
    }

    const def = row.createDiv({ cls: "conlang-browser-row-def" });
    def.setText(entry.definition);

    if (entry.ipa) {
      const ipa = row.createDiv({ cls: "conlang-browser-row-ipa" });
      ipa.setText(entry.ipa);
    }

    row.addEventListener("click", async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });
  }
}
