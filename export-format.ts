// Pure dictionary-export formatters. No Obsidian dependencies, so the output
// formats can be unit-tested outside the plugin (see test-export.ts).
//
// Three formats, each aimed at a different kind of sharing:
//   - Markdown: a readable word list — paste into a forum, publish, print to
//     PDF, or drop into another vault as a single note.
//   - CSV: open in Excel / Google Sheets / LibreOffice, or import into other
//     conlang tools that accept a spreadsheet.
//   - JSON: a lossless dump of every field, for backups, scripts, and a
//     future import command.

import type { DictionaryEntry, InflectionRule } from "./types";

export type ExportFormat = "markdown" | "csv" | "json";

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  markdown: "md",
  csv: "csv",
  json: "json",
};

/** One language's worth of entries, ready to format. */
export interface ExportLanguage {
  name: string;
  entries: DictionaryEntry[];
  /** Body text per entry path (only filled when the body option is on). */
  bodies?: Map<string, string>;
  inflections?: InflectionRule[];
}

export interface ExportOptions {
  /** Markdown only: append an English → conlang index per language. */
  englishIndex: boolean;
  /** Date stamp shown in the export header, e.g. "2026-11-16". */
  date: string;
  /** Plugin version, recorded in the JSON header. */
  pluginVersion: string;
}

// ===== Shared helpers =====

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Alphabetical by headword, then by definition so homographs are stable. */
export function sortEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  return entries
    .slice()
    .sort(
      (a, b) =>
        collator.compare(a.word, b.word) || collator.compare(a.definition, b.definition)
    );
}

export function isNameEntry(entry: DictionaryEntry): boolean {
  const pos = entry.partOfSpeech?.toLowerCase().replace(/[\s_-]/g, "") ?? "";
  return pos === "propernoun";
}

/**
 * Extract the freeform part of an entry note: strip frontmatter, the
 * template's `# word` heading, and the auto-generated "Translates *x*." line.
 * Unlike extractBodyPreview this keeps every paragraph, untruncated.
 */
export function extractExportBody(content: string, word: string): string {
  let body = content.replace(/^\uFEFF/, "");
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) {
      const after = body.indexOf("\n", end + 4);
      body = after === -1 ? "" : body.slice(after + 1);
    }
  }
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  let skippedTitle = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!skippedTitle && line.length > 0) {
      // Drop the first heading only when it is just the headword — a heading
      // the user wrote themselves ("# Usage") is content worth keeping.
      const m = /^#\s+(.+)$/.exec(line);
      if (m && m[1].trim().toLowerCase() === word.trim().toLowerCase()) {
        skippedTitle = true;
        continue;
      }
      skippedTitle = true;
    }
    if (/^Translates \*[^*]+\*\.?$/.test(line)) continue;
    kept.push(raw.replace(/\s+$/, ""));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formsText(entry: DictionaryEntry): string {
  return (entry.forms ?? []).map((f) => `${f.label}: ${f.form}`).join("; ");
}

// ===== Markdown =====

/** Escape characters that would turn user text into Markdown/HTML syntax. */
export function escapeMd(s: string): string {
  return s.replace(/([\\*_`[\]<>|~])/g, "\\$1");
}

function groupKey(word: string): string {
  const first = Array.from(word.trim())[0] ?? "";
  const upper = first.toLocaleUpperCase();
  // Anything that isn't a letter (digits, apostrophes, glottal-stop marks…)
  // goes in one bucket rather than producing a heading per symbol.
  return /\p{L}/u.test(upper) ? upper : "#";
}

function renderMarkdownEntry(entry: DictionaryEntry, body: string | undefined): string[] {
  let head = `**${escapeMd(entry.word)}**`;
  if (entry.ipa) {
    const ipa = entry.ipa.trim();
    head += ` ${/^[/[]/.test(ipa) ? escapeMd(ipa) : `/${escapeMd(ipa)}/`}`;
  }
  if (entry.partOfSpeech) head += ` *${escapeMd(entry.partOfSpeech)}*`;
  head += ` — ${escapeMd(entry.definition)}`;

  const details: string[] = [];
  if (entry.forms && entry.forms.length > 0) {
    details.push(
      "Forms: " +
        entry.forms.map((f) => `${escapeMd(f.label)} *${escapeMd(f.form)}*`).join(", ")
    );
  }
  if (entry.aliases && entry.aliases.length > 0) {
    details.push("Also: " + entry.aliases.map((a) => `*${escapeMd(a)}*`).join(", "));
  }
  if (entry.parts && entry.parts.length > 0) {
    details.push("From: " + entry.parts.map((p) => `*${escapeMd(p)}*`).join(" + "));
  }
  if (entry.etymology) details.push(`Etymology: ${escapeMd(entry.etymology)}`);
  if (entry.nameCategory) details.push(`Category: ${escapeMd(entry.nameCategory)}`);
  if (entry.notes) details.push(`Notes: ${escapeMd(entry.notes)}`);

  const out = [head];
  // Two trailing spaces = a CommonMark hard break. Obsidian shows single
  // newlines as breaks anyway, but GitHub, Publish, and pandoc would otherwise
  // run the detail lines together into one paragraph.
  details.forEach((d, i) => out.push(`> ${d}${i < details.length - 1 ? "  " : ""}`));
  if (body) {
    if (details.length > 0) out.push(">");
    for (const line of body.split("\n")) out.push(line ? `> ${line}` : ">");
  }
  // Markdown needs a blank line before a blockquote, so put the headline on
  // its own paragraph when details follow.
  if (out.length > 1) out.splice(1, 0, "");
  return out;
}

function renderEnglishIndex(entries: DictionaryEntry[], language: string): string[] {
  const index = new Map<string, { display: string; words: string[] }>();
  for (const entry of entries) {
    for (const sense of entry.definition.split(/[,;]/)) {
      const display = sense.trim();
      if (!display) continue;
      const key = display.toLowerCase();
      const slot = index.get(key) ?? { display, words: [] };
      if (!slot.words.includes(entry.word)) slot.words.push(entry.word);
      index.set(key, slot);
    }
  }
  const rows = Array.from(index.values()).sort((a, b) =>
    collator.compare(a.display, b.display)
  );
  if (rows.length === 0) return [];
  const out = [`## English → ${escapeMd(language)}`, ""];
  for (const row of rows) {
    out.push(
      `- ${escapeMd(row.display)} — ${row.words.map((w) => `**${escapeMd(w)}**`).join(", ")}`
    );
  }
  out.push("");
  return out;
}

export function toMarkdown(languages: ExportLanguage[], opts: ExportOptions): string {
  const total = languages.reduce((n, l) => n + l.entries.length, 0);
  const single = languages.length === 1;
  const title = single ? `${languages[0].name} dictionary` : "Dictionary";
  const out: string[] = [
    `# ${escapeMd(title)}`,
    "",
    `*${total} ${total === 1 ? "entry" : "entries"} · exported ${opts.date} with Made Up Words*`,
    "",
  ];
  // With one language its sections sit at H2; with several, each language
  // gets an H2 and its letters drop to H3.
  const letterLevel = single ? "##" : "###";
  for (const lang of languages) {
    if (!single) out.push(`## ${escapeMd(lang.name)}`, "");
    let current = "";
    for (const entry of sortEntries(lang.entries)) {
      const key = groupKey(entry.word);
      if (key !== current) {
        current = key;
        out.push(`${letterLevel} ${key}`, "");
      }
      out.push(...renderMarkdownEntry(entry, lang.bodies?.get(entry.path)), "");
    }
    if (opts.englishIndex) {
      const idx = renderEnglishIndex(lang.entries, lang.name);
      // Nest the index under the language heading in multi-language exports.
      if (!single && idx.length > 0) idx[0] = "#" + idx[0];
      out.push(...idx);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ===== CSV =====

export const CSV_COLUMNS = [
  "word",
  "definition",
  "partOfSpeech",
  "ipa",
  "etymology",
  "notes",
  "aliases",
  "forms",
  "inflectAs",
  "parts",
  "nameCategory",
  "language",
  "body",
] as const;

/** RFC 4180 field quoting, plus a guard against spreadsheet formula injection. */
export function csvField(value: string): string {
  let v = value;
  // A cell starting with = + - @ is executed as a formula by Excel/Sheets.
  // Prefix an apostrophe — the standard neutraliser — except for things that
  // are plainly data, like a leading hyphen on an affix ("-ath") or a number.
  if (/^[=+@]/.test(v) || /^-(?![\p{L}\d])/u.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(languages: ExportLanguage[], includeBody: boolean): string {
  const cols = CSV_COLUMNS.filter((c) => includeBody || c !== "body");
  const rows: string[] = [cols.join(",")];
  for (const lang of languages) {
    for (const entry of sortEntries(lang.entries)) {
      const values: Record<(typeof CSV_COLUMNS)[number], string> = {
        word: entry.word,
        definition: entry.definition,
        partOfSpeech: entry.partOfSpeech ?? "",
        ipa: entry.ipa ?? "",
        etymology: entry.etymology ?? "",
        notes: entry.notes ?? "",
        aliases: (entry.aliases ?? []).join("; "),
        forms: formsText(entry),
        inflectAs: entry.inflectAs ?? "",
        parts: (entry.parts ?? []).join("; "),
        nameCategory: entry.nameCategory ?? "",
        language: entry.language ?? lang.name,
        body: lang.bodies?.get(entry.path) ?? "",
      };
      rows.push(cols.map((c) => csvField(values[c])).join(","));
    }
  }
  // BOM so Excel opens the file as UTF-8 — without it IPA and diacritics
  // turn into mojibake. CRLF line endings per RFC 4180.
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

// ===== JSON =====

export const JSON_FORMAT_ID = "made-up-words-export";
export const JSON_FORMAT_VERSION = 1;

export function toJson(languages: ExportLanguage[], opts: ExportOptions): string {
  const doc = {
    format: JSON_FORMAT_ID,
    version: JSON_FORMAT_VERSION,
    exportedAt: opts.date,
    pluginVersion: opts.pluginVersion,
    languages: languages.map((lang) => ({
      name: lang.name,
      inflections: lang.inflections && lang.inflections.length > 0 ? lang.inflections : undefined,
      entries: sortEntries(lang.entries).map((e) => ({
        word: e.word,
        definition: e.definition,
        partOfSpeech: e.partOfSpeech,
        ipa: e.ipa,
        etymology: e.etymology,
        notes: e.notes,
        aliases: e.aliases,
        forms: e.forms,
        inflectAs: e.inflectAs,
        parts: e.parts,
        nameCategory: e.nameCategory,
        body: lang.bodies?.get(e.path) || undefined,
        // Vault-relative path of the source note, so a script can trace an
        // entry back to its file.
        source: e.path,
      })),
    })),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

export function formatExport(
  format: ExportFormat,
  languages: ExportLanguage[],
  opts: ExportOptions,
  includeBody: boolean
): string {
  switch (format) {
    case "markdown":
      return toMarkdown(languages, opts);
    case "csv":
      return toCsv(languages, includeBody);
    case "json":
      return toJson(languages, opts);
  }
}
