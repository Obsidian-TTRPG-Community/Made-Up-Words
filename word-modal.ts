// "Add word" modal — used when creating a dictionary entry from the panel
// without a pre-selected piece of text. Asks for the conlang form, the
// English meaning, and the part of speech in one flow.
//
// Distinct from EntryCreationModal which assumes English is already known
// (from selection) and only asks for POS.

import { App, Modal, Notice } from "obsidian";

export interface WordCreationResult {
  conlangWord: string;
  englishDefinition: string;
  partOfSpeech: string;
}

const COMMON_POS: { label: string; description: string }[] = [
  { label: "noun", description: "A person, place, thing, or idea. e.g. cat, river, freedom." },
  { label: "verb", description: "An action or state of being. e.g. run, become, exist." },
  { label: "adjective", description: "Describes a noun. e.g. red, tall, ancient." },
  { label: "adverb", description: "Describes a verb, adjective, or other adverb. e.g. quickly, often, here." },
  { label: "pronoun", description: "Stands in for a noun. e.g. she, they, it, this." },
  { label: "preposition", description: "Shows a relationship between words. e.g. in, on, before, with." },
  { label: "conjunction", description: "Joins words, phrases, or clauses. e.g. and, but, because." },
  { label: "interjection", description: "An exclamation expressing emotion or reaction. e.g. oh!, wow, alas." },
];

export class WordCreationModal extends Modal {
  private resolve: (result: WordCreationResult | null) => void;
  private decided = false;

  // Form state
  private conlangWord = "";
  private englishDefinition = "";
  private partOfSpeech = "";

  // Optional: a "derive conlang from English using cypher" helper
  private cypherFn: (s: string) => string;

  // DOM refs
  private conlangInput!: HTMLInputElement;
  private englishInput!: HTMLInputElement;
  private posInput!: HTMLInputElement;

  constructor(
    app: App,
    cypherFn: (englishText: string) => string,
    resolve: (result: WordCreationResult | null) => void
  ) {
    super(app);
    this.cypherFn = cypherFn;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add a word" });

    contentEl.createEl("div", { cls: "conlang-modal-label", text: "English meaning" });
    this.englishInput = contentEl.createEl("input", { type: "text" });
    this.englishInput.placeholder = "e.g. water, to walk, red";
    this.englishInput.addClass("conlang-modal-input");
    this.englishInput.addEventListener("input", () => {
      this.englishDefinition = this.englishInput.value;
    });
    setTimeout(() => this.englishInput.focus(), 0);

    contentEl.createEl("div", { cls: "conlang-modal-label", text: "Made-up word" });
    const conlangRow = contentEl.createDiv({ cls: "conlang-modal-derive-row" });
    this.conlangInput = conlangRow.createEl("input", { type: "text" });
    this.conlangInput.placeholder = "Type your invented word, or derive it from English";
    this.conlangInput.addClass("conlang-modal-input");
    this.conlangInput.addEventListener("input", () => {
      this.conlangWord = this.conlangInput.value;
    });
    const deriveBtn = conlangRow.createEl("button", { text: "Cypher", cls: "conlang-panel-btn" });
    deriveBtn.title = "Run the English meaning through your cypher rules and use the result. You can edit it afterwards.";
    deriveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.deriveFromEnglish();
    });

    contentEl.createEl("div", { cls: "conlang-modal-label", text: "Part of speech (optional)" });
    this.posInput = contentEl.createEl("input", { type: "text" });
    this.posInput.placeholder = "e.g. noun, verb, adjective…";
    this.posInput.addClass("conlang-modal-input");
    this.posInput.addEventListener("input", () => {
      this.partOfSpeech = this.posInput.value;
    });
    this.posInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    const chips = contentEl.createDiv({ cls: "conlang-modal-chips" });
    for (const pos of COMMON_POS) {
      const chip = chips.createEl("button", { text: pos.label, cls: "conlang-modal-chip" });
      chip.title = pos.description;
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        this.posInput.value = pos.label;
        this.partOfSpeech = pos.label;
      });
    }

    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.cancel());
    const saveBtn = btnRow.createEl("button", { text: "Add word", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.submit());
  }

  private deriveFromEnglish() {
    const src = this.englishDefinition.trim();
    if (!src) {
      new Notice("Made Up Words: type an English meaning first");
      this.englishInput.focus();
      return;
    }
    const out = this.cypherFn(src);
    this.conlangInput.value = out;
    this.conlangWord = out;
    this.conlangInput.focus();
    this.conlangInput.select();
  }

  private submit() {
    const c = this.conlangWord.trim();
    const e = this.englishDefinition.trim();
    if (!c) {
      new Notice("Made Up Words: give the word a conlang form");
      this.conlangInput.focus();
      return;
    }
    if (!e) {
      new Notice("Made Up Words: give the word an English meaning");
      this.englishInput.focus();
      return;
    }
    this.decided = true;
    this.resolve({
      conlangWord: c,
      englishDefinition: e,
      partOfSpeech: this.partOfSpeech.trim(),
    });
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
