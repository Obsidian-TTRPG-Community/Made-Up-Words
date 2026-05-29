// Settings tab: manage languages, dictionary folders, and cypher sheets.

import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import type ConlangPlugin from "./main";
import { CypherSheet, CypherRule, HashType, LanguageConfig, InflectionRule } from "./types";
import { INFLECTION_PRESETS, findPreset } from "./presets";

export class ConlangSettingTab extends PluginSettingTab {
  plugin: ConlangPlugin;

  constructor(app: App, plugin: ConlangPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Made Up Words" });

    // Active language selector
    // Multi-active language selector: which languages contribute to hover,
    // lookup, and dictionary queries. Primary language is the target for
    // English→conlang translation and the default save target.
    new Setting(containerEl)
      .setName("Active languages")
      .setDesc(
        "Choose which languages are 'live': hover, lookup, and dictionary " +
          "browsing include all active languages. Toggle each one on or off."
      );
    const activeListEl = containerEl.createDiv({ cls: "conlang-active-list" });
    for (const lang of this.plugin.settings.languages) {
      const row = activeListEl.createDiv({ cls: "conlang-active-row" });
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = this.plugin.settings.activeLanguages.includes(lang.name);
      cb.addEventListener("change", async () => {
        const set = new Set(this.plugin.settings.activeLanguages);
        if (cb.checked) set.add(lang.name);
        else set.delete(lang.name);
        this.plugin.settings.activeLanguages = Array.from(set);
        // Ensure primary stays valid: if we just disabled the primary, fall back.
        if (
          !this.plugin.settings.activeLanguages.includes(
            this.plugin.settings.primaryLanguage
          )
        ) {
          this.plugin.settings.primaryLanguage =
            this.plugin.settings.activeLanguages[0] ?? "";
        }
        // Empty active list isn't allowed; re-add this language if so.
        if (this.plugin.settings.activeLanguages.length === 0) {
          this.plugin.settings.activeLanguages = [lang.name];
          this.plugin.settings.primaryLanguage = lang.name;
          cb.checked = true;
          new Notice("Made Up Words: at least one language must be active.");
        }
        await this.plugin.saveSettings();
        await this.plugin.reloadActiveLanguage();
        this.display();
      });
      const label = row.createEl("label", { text: lang.name });
      label.addEventListener("click", () => cb.click());
    }

    new Setting(containerEl)
      .setName("Primary language")
      .setDesc(
        "Used as the target for English→conlang translation and as the default " +
          "save folder for new entries. Must be one of the active languages."
      )
      .addDropdown((dd) => {
        const active = this.plugin.settings.activeLanguages;
        for (const name of active) {
          dd.addOption(name, name);
        }
        dd.setValue(this.plugin.settings.primaryLanguage);
        dd.onChange(async (value) => {
          this.plugin.settings.primaryLanguage = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Commit wrapper")
      .setDesc(
        "How committed translations are stored in the note. HTML tooltip is recommended (uses native <abbr> tags)."
      )
      .addDropdown((dd) => {
        dd.addOption("html-tooltip", "HTML tooltip (<abbr>)");
        dd.addOption("footnote-style", "Footnote with original");
        dd.addOption("wikilink", "Wikilink to dictionary entry");
        dd.setValue(this.plugin.settings.commitWrapper);
        dd.onChange(async (value) => {
          this.plugin.settings.commitWrapper = value as any;
          await this.plugin.saveSettings();
        });
      });

    // Hover behaviour. Default "shift" keeps the tooltip out of the way
    // unless explicitly requested — testers found always-on intrusive.
    new Setting(containerEl)
      .setName("Hover modifier key")
      .setDesc(
        "Hold this key while hovering to see translation tooltips. " +
          "Use 'None' to show tooltips on any hover (the old behaviour)."
      )
      .addDropdown((dd) => {
        dd.addOption("none", "None (always show)");
        dd.addOption("shift", "Shift");
        dd.addOption("alt", "Alt / Option");
        dd.addOption("ctrl", "Ctrl / Cmd");
        dd.setValue(this.plugin.settings.hoverModifier);
        dd.onChange(async (value) => {
          this.plugin.settings.hoverModifier = value as any;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Hover fallback for unknown words")
      .setDesc(
        "What to show when you hover a word that isn't in the dictionary. " +
          "'Cypher preview' shows a phonological placeholder; 'Nothing' shows no tooltip at all."
      )
      .addDropdown((dd) => {
        dd.addOption("cypher", "Cypher preview");
        dd.addOption("nothing", "Nothing");
        dd.setValue(this.plugin.settings.hoverFallback);
        dd.onChange(async (value) => {
          this.plugin.settings.hoverFallback = value as any;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Add new language")
      .addButton((btn) =>
        btn
          .setButtonText("Add language")
          .setCta()
          .onClick(async () => {
            const newName = `Language ${this.plugin.settings.languages.length + 1}`;
            this.plugin.settings.languages.push({
              name: newName,
              dictionaryFolder: `Made Up Words/${newName}`,
              hoverEnabled: true,
              sheets: [],
            });
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Per-language panels
    for (let i = 0; i < this.plugin.settings.languages.length; i++) {
      this.renderLanguage(containerEl, this.plugin.settings.languages[i], i);
    }
  }

  private renderLanguage(
    parent: HTMLElement,
    lang: LanguageConfig,
    index: number
  ): void {
    const wrap = parent.createDiv({ cls: "conlang-language-panel" });
    wrap.createEl("h3", { text: lang.name });

    new Setting(wrap)
      .setName("Name")
      .addText((t) =>
        t.setValue(lang.name).onChange(async (v) => {
          lang.name = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(wrap)
      .setName("Dictionary folder")
      .setDesc("Folder containing one .md file per word, with frontmatter `definition:` set.")
      .addText((t) =>
        t.setValue(lang.dictionaryFolder).onChange(async (v) => {
          lang.dictionaryFolder = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(wrap)
      .setName("Enable hover tooltips")
      .addToggle((tg) =>
        tg.setValue(lang.hoverEnabled).onChange(async (v) => {
          lang.hoverEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(wrap)
      .setName("Reload dictionary")
      .setDesc("Re-scan the dictionary folder. Run this after adding new word entries.")
      .addButton((b) =>
        b.setButtonText("Reload").onClick(async () => {
          if (lang.name === this.plugin.settings.activeLanguage) {
            await this.plugin.reloadActiveLanguage();
            new Notice(`Reloaded dictionary for ${lang.name}`);
          } else {
            new Notice(`Set ${lang.name} as active to reload its dictionary.`);
          }
        })
      );

    new Setting(wrap)
      .setName("Remove language")
      .addButton((b) =>
        b
          .setButtonText("Remove")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.languages.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    // Sheets
    wrap.createEl("h4", { text: "Cypher sheets" });
    wrap
      .createEl("p", {
        cls: "conlang-help",
        text:
          "Sheets run top to bottom. The output of each sheet is the input of the next. " +
          "Rule types: word (no letter before or after), prefix (no letter before), " +
          "suffix (no letter after), default (anywhere).",
      });

    for (let s = 0; s < lang.sheets.length; s++) {
      this.renderSheet(wrap, lang, s);
    }

    new Setting(wrap).addButton((b) =>
      b
        .setButtonText("Add sheet")
        .setCta()
        .onClick(async () => {
          lang.sheets.push({
            name: `Sheet ${lang.sheets.length + 1}`,
            enabled: true,
            rules: [],
          });
          await this.plugin.saveSettings();
          this.display();
        })
    );

    // Inflection rules
    wrap.createEl("h4", { text: "Inflection rules" });
    wrap
      .createEl("p", {
        cls: "conlang-help",
        text:
          "When a word isn't in the dictionary, these rules attempt to find its lemma. " +
          "Strip removes characters from the end (suffix) or start (prefix); add then attaches " +
          "characters to reconstruct the lemma. Most rules just chop a suffix off — leave add empty for that. " +
          "Use add for respellings like English -ies → -y (strip 'ies', add 'y'). " +
          "Optional POS filter: comma-separated, e.g. 'noun' or 'noun,proper-noun'. Rules without a POS apply to all words. " +
          "Optional description shown as a hover tooltip in the panel (overrides built-in explanations for common labels). " +
          "Rules are tried in order; the first whose reconstructed stem exists in the dictionary wins.",
      });

    // Preset selector — lets the user load a curated starter kit.
    // We render preset selection separately so it never accidentally
    // overwrites the current rules without an explicit confirm.
    let pendingPresetId = "";
    new Setting(wrap)
      .setName("Apply preset")
      .setDesc(
        "Load a curated starter set. Replaces any existing inflection rules for this language."
      )
      .addDropdown((dd) => {
        dd.addOption("", "— pick a preset —");
        for (const preset of INFLECTION_PRESETS) {
          dd.addOption(preset.id, preset.name);
        }
        dd.onChange((v) => {
          pendingPresetId = v;
        });
      })
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(async () => {
            if (!pendingPresetId) {
              new Notice("Made Up Words: pick a preset first");
              return;
            }
            const preset = findPreset(pendingPresetId);
            if (!preset) return;
            const existingCount = lang.inflections?.length ?? 0;
            const confirmed = await this.confirmPreset(preset, existingCount);
            if (!confirmed) return;
            // Deep-copy rules so editing one doesn't mutate the preset definition
            lang.inflections = preset.rules.map((r) => ({ ...r }));
            await this.plugin.saveSettings();
            this.display();
            new Notice(`Made Up Words: applied preset "${preset.name}"`);
          })
      );

    if (!lang.inflections) lang.inflections = [];
    this.renderInflectionTable(wrap, lang);

    new Setting(wrap).addButton((b) =>
      b
        .setButtonText("Add inflection rule")
        .onClick(async () => {
          (lang.inflections ??= []).push({
            label: "plural",
            pattern: "",
            position: "suffix",
            strip: "",
            add: "",
            enabled: true,
          });
          await this.plugin.saveSettings();
          this.display();
        })
    );
  }

  /**
   * Show a small modal confirming a preset replacement.
   * Returns true if the user confirmed, false if they cancelled.
   * If there are no existing rules, we don't bother prompting.
   */
  private async confirmPreset(preset: { name: string; description: string }, existingCount: number): Promise<boolean> {
    if (existingCount === 0) return true;
    return new Promise<boolean>((resolve) => {
      const modal = new PresetConfirmModal(this.app, preset.name, preset.description, existingCount, resolve);
      modal.open();
    });
  }

  private renderSheet(
    parent: HTMLElement,
    lang: LanguageConfig,
    sheetIndex: number
  ): void {
    const sheet = lang.sheets[sheetIndex];
    const box = parent.createDiv({ cls: "conlang-sheet" });

    const header = new Setting(box)
      .setName(sheet.name)
      .addToggle((t) =>
        t
          .setTooltip("Enable sheet")
          .setValue(sheet.enabled)
          .onChange(async (v) => {
            sheet.enabled = v;
            await this.plugin.saveSettings();
          })
      )
      .addButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Delete sheet")
          .onClick(async () => {
            lang.sheets.splice(sheetIndex, 1);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(box)
      .setName("Sheet name")
      .addText((t) =>
        t.setValue(sheet.name).onChange(async (v) => {
          sheet.name = v;
          await this.plugin.saveSettings();
        })
      );

    // Rules table
    const tableWrap = box.createDiv({ cls: "conlang-rules-wrap" });
    const table = tableWrap.createEl("table", { cls: "conlang-rules-table" });
    const thead = table.createEl("thead").createEl("tr");
    ["Input", "Output", "Type", "On", ""].forEach((h) =>
      thead.createEl("th", { text: h })
    );
    const tbody = table.createEl("tbody");

    for (let r = 0; r < sheet.rules.length; r++) {
      this.renderRuleRow(tbody, sheet, r);
    }

    new Setting(box).addButton((b) =>
      b
        .setButtonText("Add rule")
        .onClick(async () => {
          sheet.rules.push({
            input: "",
            output: "",
            type: "default",
            enabled: true,
          });
          await this.plugin.saveSettings();
          this.display();
        })
    );
  }

  private renderRuleRow(
    tbody: HTMLElement,
    sheet: CypherSheet,
    ruleIndex: number
  ): void {
    const rule = sheet.rules[ruleIndex];
    const tr = tbody.createEl("tr");

    const inputTd = tr.createEl("td");
    const inputEl = inputTd.createEl("input", { type: "text", value: rule.input });
    inputEl.addEventListener("change", async () => {
      rule.input = inputEl.value;
      await this.plugin.saveSettings();
    });

    const outputTd = tr.createEl("td");
    const outputEl = outputTd.createEl("input", { type: "text", value: rule.output });
    outputEl.addEventListener("change", async () => {
      rule.output = outputEl.value;
      await this.plugin.saveSettings();
    });

    const typeTd = tr.createEl("td");
    const typeEl = typeTd.createEl("select");
    (["word", "prefix", "suffix", "default"] as HashType[]).forEach((t) => {
      const opt = typeEl.createEl("option", { text: t, value: t });
      if (t === rule.type) opt.selected = true;
    });
    typeEl.addEventListener("change", async () => {
      rule.type = typeEl.value as HashType;
      await this.plugin.saveSettings();
    });

    const enabledTd = tr.createEl("td");
    const enabledEl = enabledTd.createEl("input", { type: "checkbox" });
    enabledEl.checked = rule.enabled;
    enabledEl.addEventListener("change", async () => {
      rule.enabled = enabledEl.checked;
      await this.plugin.saveSettings();
    });

    const deleteTd = tr.createEl("td");
    const deleteBtn = deleteTd.createEl("button", { text: "×" });
    deleteBtn.addEventListener("click", async () => {
      sheet.rules.splice(ruleIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    });
  }

  private renderInflectionTable(parent: HTMLElement, lang: LanguageConfig): void {
    const rules = lang.inflections ?? [];
    const tableWrap = parent.createDiv({ cls: "conlang-rules-wrap" });
    const table = tableWrap.createEl("table", { cls: "conlang-rules-table" });
    const thead = table.createEl("thead").createEl("tr");
    ["Label", "Position", "Pattern", "Strip", "Add", "POS filter", "Description", "On", ""].forEach(
      (h) => thead.createEl("th", { text: h })
    );
    const tbody = table.createEl("tbody");
    for (let i = 0; i < rules.length; i++) {
      this.renderInflectionRow(tbody, lang, i);
    }
  }

  private renderInflectionRow(
    tbody: HTMLElement,
    lang: LanguageConfig,
    ruleIndex: number
  ): void {
    const rules = lang.inflections!;
    const rule = rules[ruleIndex];
    const tr = tbody.createEl("tr");

    const mkText = (value: string, onChange: (v: string) => void) => {
      const td = tr.createEl("td");
      const el = td.createEl("input", { type: "text", value });
      el.addEventListener("change", async () => {
        onChange(el.value);
        await this.plugin.saveSettings();
      });
    };

    mkText(rule.label, (v) => (rule.label = v));

    const posTd = tr.createEl("td");
    const posEl = posTd.createEl("select");
    (["suffix", "prefix"] as const).forEach((p) => {
      const opt = posEl.createEl("option", { text: p, value: p });
      if (p === rule.position) opt.selected = true;
    });
    posEl.addEventListener("change", async () => {
      rule.position = posEl.value as "suffix" | "prefix";
      await this.plugin.saveSettings();
    });

    mkText(rule.pattern, (v) => {
      rule.pattern = v;
      // Convenience: if strip is empty, default it to whatever pattern is.
      // This matches the common case where the user just wants to chop a suffix.
      if (!rule.strip) rule.strip = v;
    });
    mkText(rule.strip, (v) => (rule.strip = v));
    mkText(rule.add, (v) => (rule.add = v));
    mkText(rule.pos ?? "", (v) => (rule.pos = v.trim() === "" ? undefined : v));
    mkText(rule.description ?? "", (v) => (rule.description = v.trim() === "" ? undefined : v));

    const enabledTd = tr.createEl("td");
    const enabledEl = enabledTd.createEl("input", { type: "checkbox" });
    enabledEl.checked = rule.enabled;
    enabledEl.addEventListener("change", async () => {
      rule.enabled = enabledEl.checked;
      await this.plugin.saveSettings();
    });

    const deleteTd = tr.createEl("td");
    const deleteBtn = deleteTd.createEl("button", { text: "×" });
    deleteBtn.addEventListener("click", async () => {
      rules.splice(ruleIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    });
  }
}

/**
 * Small confirmation modal shown before applying a preset that would
 * replace existing inflection rules.
 */
class PresetConfirmModal extends Modal {
  private presetName: string;
  private description: string;
  private existingCount: number;
  private resolve: (confirmed: boolean) => void;
  private decided = false;

  constructor(
    app: App,
    presetName: string,
    description: string,
    existingCount: number,
    resolve: (confirmed: boolean) => void
  ) {
    super(app);
    this.presetName = presetName;
    this.description = description;
    this.existingCount = existingCount;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Apply preset "${this.presetName}"?` });
    contentEl.createEl("p", { text: this.description });
    contentEl.createEl("p", {
      cls: "mod-warning",
      text: `This will replace your ${this.existingCount} existing inflection rule${
        this.existingCount === 1 ? "" : "s"
      } for this language. This cannot be undone from inside the settings.`,
    });
    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.decided = true;
      this.resolve(false);
      this.close();
    });
    const ok = btnRow.createEl("button", { text: "Replace rules", cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.decided = true;
      this.resolve(true);
      this.close();
    });
  }

  onClose() {
    // If the user dismissed via the X button without choosing, treat as cancel
    if (!this.decided) this.resolve(false);
    this.contentEl.empty();
  }
}
