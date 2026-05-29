// "Create name" modal.
//
// Names are proper nouns in the dictionary, distinguished by partOfSpeech =
// "proper-noun". They can be created two ways:
//
//   1. Free-form: the user types the conlang form directly. The English text
//      is just a referent / definition. Use this when you've made up a name
//      that *feels right* and isn't a literal translation.
//
//   2. Derived: run an English word through the cypher engine and use the
//      result as the conlang form. Use this when the name "really is" the
//      conlang word for something (e.g. a river literally called "long-water").
//
// In both cases, the conlang form is stored verbatim — even if cypher rules
// change later, the name is locked.

import { App, Modal, Notice } from "obsidian";

export interface NameCreationResult {
  // The final conlang form (locked at creation time)
  conlangForm: string;
  // What this name refers to in your world
  referent: string;
  // The category (character, place, faction, etc.)
  category: string;
}

const NAME_CATEGORIES: { label: string; description: string }[] = [
  { label: "character", description: "A person — protagonist, antagonist, supporting figure. Includes the names of gods and personified forces." },
  { label: "place", description: "A geographic location — city, region, mountain, river, building. Anything with coordinates in your world." },
  { label: "faction", description: "An organised group — kingdom, guild, religion, conspiracy, military unit. Things that have agency but aren't individuals." },
  { label: "artifact", description: "A unique object — a named sword, a specific tome, a relic. Common-noun objects (like 'a sword') aren't names." },
  { label: "event", description: "A specific historical event — battle, treaty, disaster. 'The Burning Year', not 'a fire'." },
  { label: "title", description: "A specific role or rank that's treated as a proper noun — 'the High King', 'the Dawnspeaker'. Often capitalised in prose." },
  { label: "other", description: "Anything else that gets its own proper-noun treatment." },
];

export class NameCreationModal extends Modal {
  private resolve: (result: NameCreationResult | null) => void;
  private decided = false;

  // Form state
  private conlangForm = "";
  private referent = "";
  private category = "character";

  // Derive-from-English helper (optional, drives the cypher button)
  private deriveFromEnglish = "";
  private cypherFn: (s: string) => string;

  // DOM refs
  private conlangInput!: HTMLInputElement;
  private referentInput!: HTMLInputElement;
  private deriveInput!: HTMLInputElement;

  constructor(
    app: App,
    cypherFn: (englishText: string) => string,
    resolve: (result: NameCreationResult | null) => void
  ) {
    super(app);
    this.cypherFn = cypherFn;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Create a name" });
    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Names are proper nouns — character names, places, factions, artifacts. " +
        "They're locked at creation: even if you change cypher rules later, the name stays the same.",
    });

    // === Conlang form (the actual name) ===
    contentEl.createEl("div", { cls: "conlang-modal-label", text: "Name (in conlang)" });
    this.conlangInput = contentEl.createEl("input", { type: "text" });
    this.conlangInput.placeholder = "Type the name directly, or derive one below…";
    this.conlangInput.addClass("conlang-modal-input");
    this.conlangInput.addEventListener("input", () => {
      this.conlangForm = this.conlangInput.value;
    });
    setTimeout(() => this.conlangInput.focus(), 0);

    // === Derive option ===
    const deriveBlock = contentEl.createDiv({ cls: "conlang-modal-derive" });
    const deriveLabel = deriveBlock.createDiv({ cls: "conlang-modal-derive-label" });
    deriveLabel.setText("…or derive from an English word:");

    const deriveRow = deriveBlock.createDiv({ cls: "conlang-modal-derive-row" });
    this.deriveInput = deriveRow.createEl("input", { type: "text" });
    this.deriveInput.placeholder = "e.g. darkness, river, oath";
    this.deriveInput.addClass("conlang-modal-input");
    this.deriveInput.addEventListener("input", () => {
      this.deriveFromEnglish = this.deriveInput.value;
    });
    this.deriveInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.applyCypher();
      }
    });

    const deriveBtn = deriveRow.createEl("button", { text: "Cypher", cls: "conlang-panel-btn" });
    deriveBtn.title = "Run the English word through your active cypher rules and copy the result into the Name field.";
    deriveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.applyCypher();
    });

    // === Referent (English description of what this name refers to) ===
    contentEl.createEl("div", { cls: "conlang-modal-label", text: "Refers to" });
    this.referentInput = contentEl.createEl("input", { type: "text" });
    this.referentInput.placeholder = "e.g. the inland sea, Princess of the Five Kingdoms…";
    this.referentInput.addClass("conlang-modal-input");
    this.referentInput.addEventListener("input", () => {
      this.referent = this.referentInput.value;
    });

    // === Category: free-form text plus quick-pick chips ===
    contentEl.createEl("div", { cls: "conlang-modal-label", text: "Category" });
    const categoryInput = contentEl.createEl("input", { type: "text" });
    categoryInput.placeholder = "e.g. character, place, faction, or your own term";
    categoryInput.value = this.category;
    categoryInput.addClass("conlang-modal-input");
    categoryInput.addEventListener("input", () => {
      this.category = categoryInput.value;
      this.updateChipSelection(chips);
    });

    const chips = contentEl.createDiv({ cls: "conlang-modal-chips" });
    for (const cat of NAME_CATEGORIES) {
      const chip = chips.createEl("button", { text: cat.label, cls: "conlang-modal-chip" });
      chip.title = cat.description;
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        this.category = cat.label;
        categoryInput.value = cat.label;
        this.updateChipSelection(chips);
      });
    }
    this.updateChipSelection(chips);

    // === Buttons ===
    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.cancel());
    const saveBtn = btnRow.createEl("button", { text: "Create name", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.submit());
  }

  private applyCypher() {
    const src = this.deriveFromEnglish.trim();
    if (!src) {
      new Notice("Made Up Words: type an English word to derive from first");
      return;
    }
    const out = this.cypherFn(src);
    this.conlangInput.value = out;
    this.conlangForm = out;
    this.conlangInput.focus();
    this.conlangInput.select();
  }

  private updateChipSelection(chips: HTMLElement) {
    const all = chips.querySelectorAll(".conlang-modal-chip");
    all.forEach((el) => {
      const btn = el as HTMLButtonElement;
      if (btn.textContent === this.category) btn.addClass("selected");
      else btn.removeClass("selected");
    });
  }

  private submit() {
    const conlang = this.conlangForm.trim();
    if (!conlang) {
      new Notice("Made Up Words: give the name a conlang form (type it or derive it)");
      this.conlangInput.focus();
      return;
    }
    this.decided = true;
    this.resolve({
      conlangForm: conlang,
      referent: this.referent.trim(),
      category: this.category,
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
