// "Save to dictionary" prompt modal.
//
// Shown when the user creates a new dictionary entry from the panel.
// Asks for the part of speech so the entry can be properly POS-tagged,
// which lets inflection rules know which entries they apply to.
//
// The user can skip (leave POS empty) — POS-less entries still work,
// they just won't benefit from POS-conditioned inflection rules.

import { App, Modal } from "obsidian";

export interface EntryCreationOptions {
  partOfSpeech: string; // "" if user skipped
}

/**
 * Common parts of speech, used to populate quick-pick buttons.
 * Each has a short definition shown as a hover tooltip — handy for users
 * who don't remember the precise grammatical distinctions.
 * Users can still type a custom value in the text field.
 */
const COMMON_POS: { label: string; description: string }[] = [
  {
    label: "noun",
    description: "A person, place, thing, or idea. e.g. cat, river, freedom.",
  },
  {
    label: "verb",
    description: "An action or state of being. e.g. run, become, exist.",
  },
  {
    label: "adjective",
    description: "Describes a noun. e.g. red, tall, ancient.",
  },
  {
    label: "adverb",
    description: "Describes a verb, adjective, or other adverb — usually how, when, where. e.g. quickly, often, here.",
  },
  {
    label: "pronoun",
    description: "Stands in for a noun. e.g. she, they, it, this.",
  },
  {
    label: "proper-noun",
    description: "A specific name. Capitalised in English. e.g. Alice, London, Mars.",
  },
  {
    label: "preposition",
    description: "Shows a relationship between words — usually spatial, temporal, or logical. e.g. in, on, before, with.",
  },
  {
    label: "conjunction",
    description: "Joins words, phrases, or clauses. e.g. and, but, because.",
  },
  {
    label: "interjection",
    description: "An exclamation expressing emotion or reaction. e.g. oh!, wow, alas.",
  },
];

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

    // Text input for the POS, with auto-focus
    this.posInput = contentEl.createEl("input", { type: "text" });
    this.posInput.placeholder = "e.g. noun, verb, adjective…";
    this.posInput.addClass("conlang-modal-input");
    setTimeout(() => this.posInput.focus(), 0);

    // Submit on Enter
    this.posInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    // Quick-pick chips for common POS values
    const chips = contentEl.createDiv({ cls: "conlang-modal-chips" });
    for (const pos of COMMON_POS) {
      const chip = chips.createEl("button", { text: pos.label, cls: "conlang-modal-chip" });
      // Native browser tooltip — appears after a short hover pause.
      // Screen readers read the title attribute automatically.
      chip.title = pos.description;
      chip.addEventListener("click", () => {
        this.posInput.value = pos.label;
        this.posInput.focus();
      });
    }

    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    const skipBtn = btnRow.createEl("button", { text: "Skip" });
    skipBtn.addEventListener("click", () => this.submitSkip());

    const saveBtn = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.submit());
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
    // Dismissed via X button or Esc -> treat as cancel
    if (!this.decided) this.resolve(null);
    this.contentEl.empty();
  }
}
