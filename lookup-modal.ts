// Dictionary lookup modal.
//
// Shows all dictionary entries that could match a given word. This is the
// honest "the plugin doesn't decide for you" interface — the user picks
// which sense they want based on context.
//
// Invoked by:
//   - The "Look up word" command (with selected text or word under cursor)
//   - Clicking a multi-sense token in the Translator panel
//   - Optionally bound to a hotkey by the user

import { App, Modal, TFile } from "obsidian";
import { DictionaryEntry } from "./types";

export interface LookupMatch {
  kind: "dictionary" | "inflected" | "english" | "phrase" | "cypher" | "none";
  // For all kinds with concrete entries: the candidates
  candidates?: DictionaryEntry[];
  // For inflected: the inflection label
  inflectionLabel?: string;
  // For cypher: what the cypher produced
  cypherOutput?: string;
}

export class LookupModal extends Modal {
  private query: string;
  private matches: LookupMatch[];

  constructor(app: App, query: string, matches: LookupMatch[]) {
    super(app);
    this.query = query;
    this.matches = matches;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Look up: "${this.query}"` });

    // If no matches at all, say so explicitly
    if (this.matches.length === 0 || this.matches.every((m) => m.kind === "none")) {
      contentEl.createEl("p", {
        cls: "conlang-help",
        text:
          "No matches found in the dictionary. This word isn't recognised by your inflection rules either. " +
          "Consider adding it as a new entry, or check your active language.",
      });
      return;
    }

    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "The plugin doesn't pick a 'best' translation for you — language doesn't work that way. " +
        "Each row below is a candidate; pick the one that fits your context. " +
        "Click a row to open its dictionary entry.",
    });

    const list = contentEl.createDiv({ cls: "conlang-lookup-list" });
    for (const m of this.matches) {
      this.renderMatch(list, m);
    }
  }

  private renderMatch(parent: HTMLElement, match: LookupMatch) {
    if (match.kind === "none") return;

    if (match.kind === "cypher") {
      const row = parent.createDiv({ cls: "conlang-lookup-row conlang-lookup-cypher" });
      const head = row.createDiv({ cls: "conlang-lookup-row-head" });
      head.createSpan({ cls: "conlang-lookup-tag", text: "cypher only" });
      const word = head.createSpan({ cls: "conlang-lookup-word" });
      word.setText(match.cypherOutput ?? "");
      const note = row.createDiv({ cls: "conlang-lookup-note" });
      note.setText(
        "No dictionary entry. This is a phonological placeholder from your cypher rules — not a translation, just sound."
      );
      return;
    }

    if (match.kind === "inflected" && match.candidates?.[0]) {
      const entry = match.candidates[0];
      const row = parent.createDiv({ cls: "conlang-lookup-row conlang-lookup-inflected" });
      const head = row.createDiv({ cls: "conlang-lookup-row-head" });
      head.createSpan({ cls: "conlang-lookup-tag", text: match.inflectionLabel ?? "inflected" });
      const word = head.createSpan({ cls: "conlang-lookup-word" });
      word.setText(entry.word);
      if (entry.partOfSpeech) {
        head.createSpan({ cls: "conlang-lookup-pos", text: entry.partOfSpeech });
      }
      const def = row.createDiv({ cls: "conlang-lookup-def" });
      def.setText(entry.definition);
      this.wireOpenEntry(row, entry);
      return;
    }

    // dictionary / english / phrase: list each candidate
    if (match.candidates) {
      for (const entry of match.candidates) {
        const row = parent.createDiv({ cls: "conlang-lookup-row" });
        if (match.kind === "phrase") row.addClass("conlang-lookup-phrase");
        const head = row.createDiv({ cls: "conlang-lookup-row-head" });
        const word = head.createSpan({ cls: "conlang-lookup-word" });
        word.setText(entry.word);
        // Source language tag — important when multiple languages are active
        if (entry.language) {
          head.createSpan({ cls: "conlang-lookup-lang", text: entry.language });
        }
        if (entry.partOfSpeech) {
          head.createSpan({ cls: "conlang-lookup-pos", text: entry.partOfSpeech });
        }
        if (entry.ipa) {
          head.createSpan({ cls: "conlang-lookup-ipa", text: entry.ipa });
        }
        if (match.kind === "phrase") {
          head.createSpan({ cls: "conlang-lookup-tag", text: "phrase" });
        }
        const def = row.createDiv({ cls: "conlang-lookup-def" });
        def.setText(entry.definition);
        if (entry.etymology) {
          const etym = row.createDiv({ cls: "conlang-lookup-etym" });
          etym.setText(`Etymology: ${entry.etymology}`);
        }
        this.wireOpenEntry(row, entry);
      }
    }
  }

  private wireOpenEntry(row: HTMLElement, entry: DictionaryEntry) {
    row.addClass("conlang-clickable");
    row.addEventListener("click", async () => {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
        this.close();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
