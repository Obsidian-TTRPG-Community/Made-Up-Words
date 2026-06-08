// "Save to dictionary" prompt modals.
//
// EntryCreationModal: simple POS prompt (used by the panel's quick add).
// MultiEntryModal: pick one or more languages to add the word to, each with an
// editable (cypher-seeded) conlang form, plus a shared part of speech. Used by
// the "Add selection to dictionary" command and the editor right-click menu.

import { App, Modal, Notice } from "obsidian";

export interface EntryCreationOptions {
  partOfSpeech: string; // "" if user skipped
}

/**
 * Common parts of speech, used to populate quick-pick buttons. Each has a short
 * definition shown as a hover tooltip. Users can still type a custom value.
 */
const COMMON_POS: { label: string; description: string }[] = [
  { label: "noun", description: "A person, place, thing, or idea. e.g. cat, river, freedom." },
  { label: "verb", description: "An action or state of being. e.g. run, become, exist." },
  { label: "adjective", description: "Describes a noun. e.g. red, tall, ancient." },
  { label: "adverb", description: "Describes a verb, adjective, or other adverb. e.g. quickly, often." },
  { label: "pronoun", description: "Stands in for a noun. e.g. she, they, it, this." },
  { label: "proper-noun", description: "A specific name, capitalised in English. e.g. Alice, London." },
  { label: "preposition", description: "Shows a relationship between words. e.g. in, on, before, with." },
  { label: "conjunction", description: "Joins words, phrases, or clauses. e.g. and, but, because." },
  { label: "interjection", description: "An exclamation expressing emotion. e.g. oh!, wow, alas." },
];

function buildPosChips(parent: HTMLElement, onPick: (value: string) => void): void {
  const chips = parent.createDiv({ cls: "conlang-modal-chips" });
  for (const pos of COMMON_POS) {
    const chip = chips.createEl("button", { text: pos.label, cls: "conlang-modal-chip" });
    chip.title = pos.description;
    chip.addEventListener("click", () => onPick(pos.label));
  }
}

// ===== Simple POS prompt (panel quick-add) =====

export class EntryCreationModal extends Modal {
  private englishText: string;
  private translatedText: string;
  private resolve: (opts: EntryCreationOptions | null) => void;
  private decided = false;
  private posInput!: HTMLInputElement;

  constructor(
    app: App,
    englishText: string,
    translatedText: string,
    resolve: (opts: EntryCreationOptions | null) => void
  ) {
    super(app);
    this.englishText = englishText;
    this.translatedText = translatedText;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Save to dictionary" });

    const preview = contentEl.createDiv({ cls: "conlang-modal-preview" });
    preview.createSpan({ text: this.englishText, cls: "conlang-modal-source" });
    preview.createSpan({ text: " → ", cls: "conlang-modal-arrow" });
    preview.createSpan({ text: this.translatedText, cls: "conlang-modal-target" });

    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Part of speech (optional). This lets inflection rules know which words they apply to — " +
        "so a noun-plural rule won't accidentally trigger on a verb. Pick one or type your own.",
    });

    this.posInput = contentEl.createEl("input", { type: "text" });
    this.posInput.placeholder = "e.g. noun, verb, adjective…";
    this.posInput.addClass("conlang-modal-input");
    setTimeout(() => this.posInput.focus(), 0);

    this.posInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    buildPosChips(contentEl, (value) => {
      this.posInput.value = value;
      this.posInput.focus();
    });

    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    btnRow.createEl("button", { text: "Skip" }).addEventListener("click", () => this.submitSkip());
    btnRow
      .createEl("button", { text: "Save", cls: "mod-cta" })
      .addEventListener("click", () => this.submit());
  }

  private submit() {
    this.decided = true;
    this.resolve({ partOfSpeech: this.posInput.value.trim() });
    this.close();
  }
  private submitSkip() {
    this.decided = true;
    this.resolve({ partOfSpeech: "" });
    this.close();
  }
  private cancel() {
    this.decided = true;
    this.resolve(null);
    this.close();
  }
  onClose() {
    if (!this.decided) this.resolve(null);
    this.contentEl.empty();
  }
}

// ===== Multi-language entry modal =====

/** One language option presented in the multi-language modal. */
export interface MultiEntryLanguageInit {
  languageName: string;
  folder: string;
  /** Pre-filled (cypher-seeded) conlang form; editable by the user. */
  form: string;
  /** Whether this language starts ticked (the primary does). */
  checked: boolean;
}

export interface MultiEntryResult {
  partOfSpeech: string;
  /** One target per ticked language with a non-empty form. */
  targets: { languageName: string; form: string }[];
}

export class MultiEntryModal extends Modal {
  private englishText: string;
  private inits: MultiEntryLanguageInit[];
  private resolve: (result: MultiEntryResult | null) => void;
  private decided = false;

  private posInput!: HTMLInputElement;
  private rows: {
    init: MultiEntryLanguageInit;
    checkbox: HTMLInputElement;
    formInput: HTMLInputElement;
  }[] = [];

  constructor(
    app: App,
    englishText: string,
    inits: MultiEntryLanguageInit[],
    resolve: (result: MultiEntryResult | null) => void
  ) {
    super(app);
    this.englishText = englishText;
    this.inits = inits;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("conlang-multi-modal");
    contentEl.createEl("h3", { text: "Save to dictionary" });

    const preview = contentEl.createDiv({ cls: "conlang-modal-preview" });
    preview.createSpan({ text: this.englishText, cls: "conlang-modal-source" });

    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Part of speech (optional, shared across the languages you pick). Lets " +
        "inflection rules target the right words. Pick one or type your own.",
    });
    this.posInput = contentEl.createEl("input", { type: "text" });
    this.posInput.placeholder = "e.g. noun, verb, adjective…";
    this.posInput.addClass("conlang-modal-input");
    buildPosChips(contentEl, (value) => {
      this.posInput.value = value;
      this.posInput.focus();
    });

    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Tick each language to add this word to. Each form is seeded from that " +
        "language's cypher — edit it if you want a different spelling.",
    });
    const list = contentEl.createDiv({ cls: "conlang-modal-langs" });
    for (const init of this.inits) {
      const row = list.createDiv({ cls: "conlang-modal-lang-row" });

      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = init.checked;

      const labelWrap = row.createDiv({ cls: "conlang-modal-lang-label" });
      const name = labelWrap.createSpan({ cls: "conlang-modal-lang-name", text: init.languageName });
      name.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
      });
      labelWrap.createSpan({ cls: "conlang-modal-lang-folder", text: init.folder });

      const formInput = row.createEl("input", { type: "text", value: init.form });
      formInput.addClass("conlang-modal-lang-form");
      formInput.placeholder = "conlang form";
      formInput.addEventListener("input", () => {
        if (formInput.value.trim()) checkbox.checked = true;
      });

      this.rows.push({ init, checkbox, formInput });
    }

    setTimeout(() => this.posInput.focus(), 0);
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    btnRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.cancel());
    btnRow
      .createEl("button", { text: "Save", cls: "mod-cta" })
      .addEventListener("click", () => this.submit());
  }

  private submit() {
    const targets = this.rows
      .filter((r) => r.checkbox.checked && r.formInput.value.trim())
      .map((r) => ({ languageName: r.init.languageName, form: r.formInput.value.trim() }));
    if (targets.length === 0) {
      new Notice("Made Up Words: tick at least one language (with a form) to save.");
      return;
    }
    this.decided = true;
    this.resolve({ partOfSpeech: this.posInput.value.trim(), targets });
    this.close();
  }

  private cancel() {
    this.decided = true;
    this.resolve(null);
    this.close();
  }

  onClose() {
    if (!this.decided) this.resolve(null);
    this.contentEl.empty();
  }
}
