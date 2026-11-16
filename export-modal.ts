// "Export dictionary" modal — picks which languages to export, the output
// format, and what to include. The actual work happens in main.ts
// (exportDictionary); this only collects the choices.

import { App, Modal, Setting } from "obsidian";
import type { ExportFormat } from "./export-format";

export interface ExportRequest {
  languages: string[];
  format: ExportFormat;
  includeNames: boolean;
  includeBody: boolean;
  englishIndex: boolean;
  folder: string;
}

export class ExportModal extends Modal {
  private resolve: (result: ExportRequest | null) => void;
  private decided = false;
  private allLanguages: string[];
  private state: ExportRequest;

  constructor(
    app: App,
    allLanguages: string[],
    initial: ExportRequest,
    resolve: (result: ExportRequest | null) => void
  ) {
    super(app);
    this.allLanguages = allLanguages;
    this.state = { ...initial, languages: initial.languages.slice() };
    this.resolve = resolve;
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("conlang-export-modal");
    contentEl.createEl("h3", { text: "Export dictionary" });
    contentEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Writes your word list to a single file in this vault, ready to share. " +
        "Your entry notes are not changed.",
    });

    if (this.allLanguages.length > 1) {
      new Setting(contentEl).setName("Languages").setHeading();
      for (const name of this.allLanguages) {
        new Setting(contentEl).setName(name).addToggle((t) =>
          t.setValue(this.state.languages.includes(name)).onChange((v) => {
            const set = new Set(this.state.languages);
            if (v) set.add(name);
            else set.delete(name);
            // Keep the configured language order rather than click order.
            this.state.languages = this.allLanguages.filter((n) => set.has(n));
            this.updateButton();
          })
        );
      }
      new Setting(contentEl).setName("Options").setHeading();
    }

    new Setting(contentEl)
      .setName("Format")
      .setDesc(this.formatDescription())
      .addDropdown((d) =>
        d
          .addOption("markdown", "Markdown word list (.md)")
          .addOption("csv", "Spreadsheet (.csv)")
          .addOption("json", "Full data (.json)")
          .setValue(this.state.format)
          .onChange((v) => {
            this.state.format = v as ExportFormat;
            // Re-render so the description and the format-specific
            // options below follow the choice.
            this.render();
          })
      );

    new Setting(contentEl)
      .setName("Include names")
      .setDesc(
        "Proper nouns from the names registry. Turn off to share vocabulary " +
          "without spoiling people and places."
      )
      .addToggle((t) =>
        t.setValue(this.state.includeNames).onChange((v) => {
          this.state.includeNames = v;
        })
      );

    new Setting(contentEl)
      .setName("Include note text")
      .setDesc("The freeform text you wrote in each entry note, below the properties.")
      .addToggle((t) =>
        t.setValue(this.state.includeBody).onChange((v) => {
          this.state.includeBody = v;
        })
      );

    if (this.state.format === "markdown") {
      new Setting(contentEl)
        .setName("Add English index")
        .setDesc("A second list sorted by English meaning, for looking words up the other way.")
        .addToggle((t) =>
          t.setValue(this.state.englishIndex).onChange((v) => {
            this.state.englishIndex = v;
          })
        );
    }

    new Setting(contentEl)
      .setName("Save to folder")
      .setDesc("Created if it doesn't exist. Leave empty for the vault root.")
      .addText((t) =>
        t.setValue(this.state.folder).onChange((v) => {
          this.state.folder = v;
        })
      );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      )
      .addButton((b) => {
        this.exportBtn = b.buttonEl;
        b.setButtonText("Export")
          .setCta()
          .onClick(() => {
            if (this.state.languages.length === 0) return;
            this.decided = true;
            this.resolve({ ...this.state, folder: this.state.folder.trim() });
            this.close();
          });
      });
    this.updateButton();
  }

  private exportBtn: HTMLButtonElement | null = null;

  private updateButton() {
    if (this.exportBtn) this.exportBtn.disabled = this.state.languages.length === 0;
  }

  private formatDescription(): string {
    switch (this.state.format) {
      case "markdown":
        return "A readable, alphabetical list. Share it as a note, publish it, or print it to PDF.";
      case "csv":
        return "Opens in Excel, Google Sheets, or LibreOffice. One row per entry.";
      case "json":
        return "Every field, for backups and scripts.";
    }
  }

  onClose() {
    this.contentEl.empty();
    if (!this.decided) this.resolve(null);
  }
}
