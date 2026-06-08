// Settings tab: manage languages, dictionary folders, cypher sheets, and
// inflection rules, plus global hover / highlighting / translation behaviour.
//
// Layout (v0.16): global behaviour is grouped into labelled sections, and each
// language is a collapsible card (with its cypher sheets and inflection rules
// as nested collapsibles) so the page stays manageable with many languages.
// Expand/collapse state is preserved across the full-tab re-renders that most
// edits trigger.

import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import type ConlangPlugin from "./main";
import { CypherSheet, CypherRule, HashType, LanguageConfig, InflectionRule } from "./types";
import { INFLECTION_PRESETS, findPreset } from "./presets";

export class ConlangSettingTab extends PluginSettingTab {
  plugin: ConlangPlugin;

  // Persist expand/collapse state across re-renders, keyed by language name.
  private openCards = new Set<string>();
  private openSheets = new Set<string>();
  private openInflections = new Set<string>();

  constructor(app: App, plugin: ConlangPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("conlang-settings");
    containerEl.createEl("h2", { text: "Made Up Words" });

    this.renderLanguageOverview(containerEl);
    this.renderHoverSection(containerEl);
    this.renderHighlightSection(containerEl);
    this.renderTranslationSection(containerEl);

    containerEl.createEl("h3", { text: "Per-language settings" });
    containerEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Each language is a card below. Expand one to edit its dictionary " +
        "folder, cypher sheets, and inflection rules.",
    });
    for (let i = 0; i < this.plugin.settings.languages.length; i++) {
      this.renderLanguageCard(containerEl, this.plugin.settings.languages[i], i);
    }
  }

  // ===== Top overview =====

  private renderLanguageOverview(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Languages" });
    new Setting(containerEl)
      .setName("Active languages")
      .setDesc(
        "Active languages contribute to hover, lookup, dictionary browsing, " +
          "and highlighting. Tick to activate; click the star to set the primary."
      );

    const list = containerEl.createDiv({ cls: "conlang-lang-overview" });
    for (const lang of this.plugin.settings.languages) {
      const isActive = this.plugin.settings.activeLanguages.includes(lang.name);
      const isPrimary = this.plugin.settings.primaryLanguage === lang.name;
      const row = list.createDiv({ cls: "conlang-lang-overview-row" });

      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = isActive;
      cb.addEventListener("change", async () => {
        await this.toggleActive(lang.name, cb.checked);
        this.display();
      });

      const star = row.createSpan({
        cls: "conlang-lang-overview-star" + (isPrimary ? " is-primary" : ""),
        text: isPrimary ? "★" : "☆",
      });
      star.setAttribute("aria-label", "Set as primary language");
      star.addEventListener("click", async () => {
        if (!this.plugin.settings.activeLanguages.includes(lang.name)) {
          await this.toggleActive(lang.name, true);
        }
        this.plugin.settings.primaryLanguage = lang.name;
        await this.plugin.saveSettings();
        this.display();
      });

      const name = row.createSpan({ cls: "conlang-lang-overview-name", text: lang.name });
      name.addEventListener("click", () => cb.click());

      if (isPrimary) {
        row.createSpan({ cls: "conlang-badge conlang-badge-primary", text: "primary" });
      } else if (isActive) {
        row.createSpan({ cls: "conlang-badge conlang-badge-active", text: "active" });
      } else {
        row.createSpan({ cls: "conlang-badge", text: "inactive" });
      }
    }

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText("Add language")
          .setCta()
          .onClick(async () => {
            const newName = this.uniqueLanguageName();
            this.plugin.settings.languages.push({
              name: newName,
              dictionaryFolder: `Made Up Words/${newName}`,
              hoverEnabled: true,
              sheets: [],
            });
            this.openCards.add(newName);
            await this.plugin.saveSettings();
            this.display();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Reload dictionaries").onClick(async () => {
          const n = await this.plugin.reloadActiveLanguage();
          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
          new Notice(`Made Up Words: loaded ${n} dictionary entries`);
        })
      );
  }

  private uniqueLanguageName(): string {
    const names = new Set(this.plugin.settings.languages.map((l) => l.name));
    let i = this.plugin.settings.languages.length + 1;
    let name = `Language ${i}`;
    while (names.has(name)) name = `Language ${++i}`;
    return name;
  }

  /** Toggle a language's active state, keeping primary valid and reloading. */
  private async toggleActive(name: string, active: boolean): Promise<void> {
    const set = new Set(this.plugin.settings.activeLanguages);
    if (active) set.add(name);
    else set.delete(name);
    let listed = Array.from(set);
    if (listed.length === 0) {
      listed = [name];
      new Notice("Made Up Words: at least one language must stay active.");
    }
    this.plugin.settings.activeLanguages = listed;
    if (!listed.includes(this.plugin.settings.primaryLanguage)) {
      this.plugin.settings.primaryLanguage = listed[0];
    }
    await this.plugin.saveSettings();
    await this.plugin.reloadActiveLanguage();
    this.plugin.refreshPanel();
    this.plugin.refreshHighlights();
  }

  // ===== Behaviour sections =====

  private renderHoverSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Hover tooltips" });
    new Setting(containerEl)
      .setName("Hover modifier key")
      .setDesc(
        "Hold this key while hovering to see translation tooltips. " +
          "'None' shows a tooltip on any hover. Hover can also be turned off " +
          "per language in each card below."
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
      .setName("Fallback for unknown words")
      .setDesc(
        "What to show when you hover a word that isn't in the dictionary. " +
          "'Cypher preview' shows a phonological placeholder; 'Nothing' shows no tooltip."
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
  }

  private renderHighlightSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Highlighting" });
    new Setting(containerEl)
      .setName("Highlight known words in notes")
      .setDesc(
        "Visually mark recognised words in both the editor and Reading view."
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.highlightKnownWords).onChange(async (v) => {
          this.plugin.settings.highlightKnownWords = v;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (!this.plugin.settings.highlightKnownWords) return;

    new Setting(containerEl)
      .setName("Highlight style")
      .setDesc(
        "How highlighted words look. Themeable via the .conlang-known-word CSS class."
      )
      .addDropdown((dd) => {
        dd.addOption("underline", "Dotted underline + colour");
        dd.addOption("italic", "Italics");
        dd.addOption("background", "Background highlight");
        dd.setValue(this.plugin.settings.highlightStyle);
        dd.onChange(async (value) => {
          this.plugin.settings.highlightStyle = value as any;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Highlight conlang words")
      .setDesc(
        "Mark words that exist as dictionary entries (including inflected forms and phrases)."
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.highlightConlang).onChange(async (v) => {
          this.plugin.settings.highlightConlang = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Highlight translatable English words")
      .setDesc(
        "Mark English words the dictionary can translate. Handy for spotting " +
          "coverage, but noisier in English-heavy notes."
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.highlightEnglish).onChange(async (v) => {
          this.plugin.settings.highlightEnglish = v;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderTranslationSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Translation" });
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
  }

  // ===== Collapsible helper =====

  private collapsible(
    parent: HTMLElement,
    opts: { title: string; key: string; store: Set<string>; badge?: string }
  ): HTMLElement {
    const details = parent.createEl("details", { cls: "conlang-subcollapse" });
    if (opts.store.has(opts.key)) details.open = true;
    details.addEventListener("toggle", () => {
      if (details.open) opts.store.add(opts.key);
      else opts.store.delete(opts.key);
    });
    const summary = details.createEl("summary", { cls: "conlang-subcollapse-summary" });
    summary.createSpan({ cls: "conlang-subcollapse-title", text: opts.title });
    if (opts.badge != null) {
      summary.createSpan({ cls: "conlang-badge", text: opts.badge });
    }
    return details.createDiv({ cls: "conlang-subcollapse-body" });
  }

  // ===== Per-language card =====

  private renderLanguageCard(parent: HTMLElement, lang: LanguageConfig, index: number): void {
    const isActive = this.plugin.settings.activeLanguages.includes(lang.name);
    const isPrimary = this.plugin.settings.primaryLanguage === lang.name;

    const card = parent.createEl("details", { cls: "conlang-card" });
    if (this.openCards.has(lang.name)) card.open = true;
    card.addEventListener("toggle", () => {
      if (card.open) this.openCards.add(lang.name);
      else this.openCards.delete(lang.name);
    });

    const summary = card.createEl("summary", { cls: "conlang-card-summary" });
    summary.createSpan({ cls: "conlang-card-title", text: lang.name });
    if (isPrimary) {
      summary.createSpan({ cls: "conlang-badge conlang-badge-primary", text: "primary" });
    } else if (isActive) {
      summary.createSpan({ cls: "conlang-badge conlang-badge-active", text: "active" });
    } else {
      summary.createSpan({ cls: "conlang-badge", text: "inactive" });
    }
    if (isActive) {
      const count = this.plugin.dictionary
        .allEntries()
        .filter((e) => e.language === lang.name).length;
      summary.createSpan({
        cls: "conlang-card-count",
        text: `${count} ${count === 1 ? "entry" : "entries"}`,
      });
    }

    const body = card.createDiv({ cls: "conlang-card-body" });

    new Setting(body).setName("Name").addText((t) =>
      t.setValue(lang.name).onChange(async (v) => {
        lang.name = v;
        await this.plugin.saveSettings();
      })
    );

    new Setting(body)
      .setName("Dictionary folder")
      .setDesc("Folder of one .md file per word, each with frontmatter `definition:` set.")
      .addText((t) =>
        t.setValue(lang.dictionaryFolder).onChange(async (v) => {
          lang.dictionaryFolder = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(body)
      .setName("Active")
      .setDesc("Include this language in hover, lookup, browsing, and highlighting.")
      .addToggle((tg) =>
        tg.setValue(isActive).onChange(async (v) => {
          await this.toggleActive(lang.name, v);
          this.display();
        })
      );

    if (isActive && !isPrimary) {
      new Setting(body)
        .setName("Primary language")
        .setDesc("Target for English-to-conlang translation and default save folder for new entries.")
        .addButton((b) =>
          b.setButtonText("Make primary").onClick(async () => {
            this.plugin.settings.primaryLanguage = lang.name;
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }

    new Setting(body)
      .setName("Enable hover tooltips")
      .setDesc("Show translation tooltips when hovering this language's words.")
      .addToggle((tg) =>
        tg.setValue(lang.hoverEnabled).onChange(async (v) => {
          lang.hoverEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(body)
      .addButton((b) =>
        b.setButtonText("Reload dictionary").onClick(async () => {
          const n = await this.plugin.reloadActiveLanguage();
          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
          new Notice(
            isActive
              ? `Reloaded — ${n} entries across active languages`
              : `${lang.name} is inactive; activate it to load its dictionary.`
          );
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Remove language")
          .setWarning()
          .onClick(async () => {
            this.removeLanguage(index, lang.name);
          })
      );

    // --- Cypher sheets (nested collapsible) ---
    const sheetsBody = this.collapsible(body, {
      title: "Cypher sheets",
      key: lang.name,
      store: this.openSheets,
      badge: String(lang.sheets.length),
    });
    sheetsBody.createEl("p", {
      cls: "conlang-help",
      text:
        "Sheets run top to bottom; each sheet's output feeds the next. " +
        "Rule types: word (whole word), prefix, suffix, default (anywhere).",
    });
    for (let s = 0; s < lang.sheets.length; s++) {
      this.renderSheet(sheetsBody, lang, s);
    }
    new Setting(sheetsBody).addButton((b) =>
      b
        .setButtonText("Add sheet")
        .setCta()
        .onClick(async () => {
          lang.sheets.push({
            name: `Sheet ${lang.sheets.length + 1}`,
            enabled: true,
            rules: [],
          });
          this.openSheets.add(lang.name);
          await this.plugin.saveSettings();
          this.display();
        })
    );

    // --- Inflection rules (nested collapsible) ---
    if (!lang.inflections) lang.inflections = [];
    const inflBody = this.collapsible(body, {
      title: "Inflection rules",
      key: lang.name,
      store: this.openInflections,
      badge: String(lang.inflections.length),
    });
    inflBody.createEl("p", {
      cls: "conlang-help",
      text:
        "When a word isn't in the dictionary, these rules try to find its lemma. " +
        "Strip removes characters from the end (suffix) or start (prefix); add then " +
        "attaches characters to reconstruct the lemma. Most rules just chop a suffix " +
        "off — leave add empty for that. Use add for respellings (strip 'ies', add 'y'). " +
        "Optional POS filter: comma-separated, e.g. 'noun' or 'noun,proper-noun'. " +
        "Rules are tried in order; the first whose reconstructed stem exists wins.",
    });

    let pendingPresetId = "";
    new Setting(inflBody)
      .setName("Apply preset")
      .setDesc("Load a curated starter set. Replaces existing inflection rules for this language.")
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
            lang.inflections = preset.rules.map((r) => ({ ...r }));
            this.openInflections.add(lang.name);
            await this.plugin.saveSettings();
            this.display();
            new Notice(`Made Up Words: applied preset "${preset.name}"`);
          })
      );

    this.renderInflectionTable(inflBody, lang);

    new Setting(inflBody).addButton((b) =>
      b.setButtonText("Add inflection rule").onClick(async () => {
        (lang.inflections ??= []).push({
          label: "plural",
          pattern: "",
          position: "suffix",
          strip: "",
          add: "",
          enabled: true,
        });
        this.openInflections.add(lang.name);
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }

  /** Remove a language and keep active/primary references valid. */
  private async removeLanguage(index: number, name: string): Promise<void> {
    this.plugin.settings.languages.splice(index, 1);
    this.plugin.settings.activeLanguages = this.plugin.settings.activeLanguages.filter(
      (n) => n !== name
    );
    if (
      this.plugin.settings.languages.length > 0 &&
      this.plugin.settings.activeLanguages.length === 0
    ) {
      this.plugin.settings.activeLanguages = [this.plugin.settings.languages[0].name];
    }
    if (this.plugin.settings.primaryLanguage === name) {
      this.plugin.settings.primaryLanguage =
        this.plugin.settings.activeLanguages[0] ??
        this.plugin.settings.languages[0]?.name ??
        "";
    }
    this.openCards.delete(name);
    this.openSheets.delete(name);
    this.openInflections.delete(name);
    await this.plugin.saveSettings();
    await this.plugin.reloadActiveLanguage();
    this.plugin.refreshPanel();
    this.plugin.refreshHighlights();
    this.display();
  }

  /**
   * Show a small modal confirming a preset replacement.
   * Returns true if confirmed. Skips the prompt when there are no existing rules.
   */
  private async confirmPreset(
    preset: { name: string; description: string },
    existingCount: number
  ): Promise<boolean> {
    if (existingCount === 0) return true;
    return new Promise<boolean>((resolve) => {
      const modal = new PresetConfirmModal(
        this.app,
        preset.name,
        preset.description,
        existingCount,
        resolve
      );
      modal.open();
    });
  }

  private renderSheet(parent: HTMLElement, lang: LanguageConfig, sheetIndex: number): void {
    const sheet = lang.sheets[sheetIndex];
    const box = parent.createDiv({ cls: "conlang-sheet" });

    new Setting(box)
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

    new Setting(box).setName("Sheet name").addText((t) =>
      t.setValue(sheet.name).onChange(async (v) => {
        sheet.name = v;
        await this.plugin.saveSettings();
      })
    );

    const tableWrap = box.createDiv({ cls: "conlang-rules-wrap" });
    const table = tableWrap.createEl("table", { cls: "conlang-rules-table" });
    const thead = table.createEl("thead").createEl("tr");
    ["Input", "Output", "Type", "On", ""].forEach((h) => thead.createEl("th", { text: h }));
    const tbody = table.createEl("tbody");
    for (let r = 0; r < sheet.rules.length; r++) {
      this.renderRuleRow(tbody, sheet, r);
    }

    new Setting(box).addButton((b) =>
      b.setButtonText("Add rule").onClick(async () => {
        sheet.rules.push({ input: "", output: "", type: "default", enabled: true });
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }

  private renderRuleRow(tbody: HTMLElement, sheet: CypherSheet, ruleIndex: number): void {
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

  private renderInflectionRow(tbody: HTMLElement, lang: LanguageConfig, ruleIndex: number): void {
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
 * Small confirmation modal shown before applying a preset that would replace
 * existing inflection rules.
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
    if (!this.decided) this.resolve(false);
    this.contentEl.empty();
  }
}
