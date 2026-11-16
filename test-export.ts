// Dev-only checks for export-format.ts. Run:
//   npx esbuild test-export.ts --bundle --platform=node --outfile=/tmp/test-export.js && node /tmp/test-export.js
import { strict as assert } from "assert";
import type { DictionaryEntry } from "./types";
import {
  csvField,
  extractExportBody,
  isNameEntry,
  sortEntries,
  toCsv,
  toJson,
  toMarkdown,
  ExportLanguage,
} from "./export-format";

const e = (word: string, definition: string, extra: Partial<DictionaryEntry> = {}): DictionaryEntry => ({
  word,
  definition,
  path: `Dict/${word}.md`,
  language: "Elvish",
  ...extra,
});

const entries: DictionaryEntry[] = [
  e("zarn", "stone"),
  e("akal", "water, liquid", {
    partOfSpeech: "noun",
    ipa: "ˈa.kal",
    etymology: 'from *kal- "flow"',
    forms: [
      { label: "plural", form: "akalath" },
      { label: "genitive", form: "akalen" },
    ],
    aliases: ["akel"],
  }),
  e("Ébrin", "the capital city", { partOfSpeech: "proper-noun", nameCategory: "place" }),
  e("ka tor", "good morning", { isPhrase: true, wordCount: 2 }),
  e("'ul", "not", { ipa: "/ʔul/" }),
  e("=sum", "evil formula"),
  e("-ath", "plural suffix"),
  e("bel", "bright; light", { notes: "a | pipe *and* stars" }),
];
const bodies = new Map([["Dict/akal.md", "Used of rivers.\n\nAlso of tears."]]);
const lang: ExportLanguage = { name: "Elvish", entries, bodies };
const opts = { englishIndex: true, date: "2026-11-16", pluginVersion: "0.22.0" };

// Sorting: case/diacritic-insensitive alphabetical.
{
  const order = sortEntries(entries).map((x) => x.word);
  assert.deepEqual(order.slice(0, 3).sort(), ["'ul", "-ath", "=sum"], "symbols first");
  assert.deepEqual(order.slice(3), ["akal", "bel", "Ébrin", "ka tor", "zarn"]);
}
assert.equal(isNameEntry(entries[2]), true);
assert.equal(isNameEntry(e("x", "y", { partOfSpeech: "Proper Noun" })), true);
assert.equal(isNameEntry(entries[1]), false);

// CSV field quoting and formula neutralising.
assert.equal(csvField("plain"), "plain");
assert.equal(csvField("a, b"), '"a, b"');
assert.equal(csvField('say "hi"'), '"say ""hi"""');
assert.equal(csvField("line\nbreak"), '"line\nbreak"');
assert.equal(csvField("=SUM(A1)"), "'=SUM(A1)");
assert.equal(csvField("@cmd"), "'@cmd");
assert.equal(csvField("-ath"), "-ath", "affix hyphen is data, not a formula");
assert.equal(csvField("-1+2"), "-1+2", "negative number left alone");
assert.equal(csvField("-=x"), "'-=x");

const csv = toCsv([lang], true);
assert.ok(csv.startsWith("﻿word,definition,"), "BOM + header");
assert.ok(csv.includes("\r\n"), "CRLF");
assert.ok(csv.includes('akal,"water, liquid",noun,ˈa.kal,"from *kal- ""flow""",,akel,plural: akalath; genitive: akalen'));
assert.ok(csv.includes('"Used of rivers.\n\nAlso of tears."'));
assert.ok(csv.includes("'=sum,evil formula"));
const csvNoBody = toCsv([lang], false);
assert.ok(!csvNoBody.split("\r\n")[0].includes("body"));
// Every row has the same number of columns (count unquoted commas).
const header = csvNoBody.replace("﻿", "").split("\r\n")[0].split(",").length;
assert.equal(header, 12);

// Markdown.
const md = toMarkdown([lang], opts);
assert.ok(md.startsWith("# Elvish dictionary\n\n*8 entries · exported 2026-11-16"));
assert.ok(md.includes("## A\n\n**akal** /ˈa.kal/ *noun* — water, liquid\n\n> Forms: plural *akalath*, genitive *akalen*  \n> Also: *akel*  \n"));
assert.ok(md.includes("> Etymology: from \\*kal- \"flow\""));
assert.ok(md.includes(">\n> Used of rivers.\n>\n> Also of tears."));
assert.ok(md.includes("**'ul** /ʔul/ — not"), "existing slashes on IPA not doubled");
assert.ok(md.includes("## #"), "non-letter bucket");
assert.ok(md.includes("## É\n\n**Ébrin**"));
assert.ok(md.includes("Notes: a \\| pipe \\*and\\* stars"));
assert.ok(md.includes("## English → Elvish"));
assert.ok(md.includes("- liquid — **akal**"));
assert.ok(md.includes("- light — **bel**"));
assert.ok(!/\n{3,}/.test(md), "no triple blank lines");

// Multi-language markdown nests headings.
const md2 = toMarkdown([lang, { name: "Dwarvish", entries: [e("khaz", "mine", { language: "Dwarvish" })] }], opts);
assert.ok(md2.startsWith("# Dictionary\n"));
assert.ok(md2.includes("## Elvish\n\n### #"));
assert.ok(md2.includes("### English → Elvish"));
assert.ok(md2.includes("## Dwarvish\n\n### K\n\n**khaz** — mine"));

// JSON.
const json = JSON.parse(toJson([lang], opts)) as {
  format: string;
  version: number;
  languages: { name: string; entries: Record<string, unknown>[] }[];
};
assert.equal(json.format, "made-up-words-export");
assert.equal(json.version, 1);
const akal = json.languages[0].entries.find((x) => x.word === "akal")!;
assert.deepEqual(akal.forms, [
  { label: "plural", form: "akalath" },
  { label: "genitive", form: "akalen" },
]);
assert.equal(akal.body, "Used of rivers.\n\nAlso of tears.");
assert.equal(akal.source, "Dict/akal.md");
assert.ok(!("ipa" in json.languages[0].entries.find((x) => x.word === "zarn")!), "undefined fields dropped");

// Body extraction.
const note = [
  "---",
  "definition: water",
  "---",
  "",
  "# akal",
  "",
  "Translates *water*.",
  "",
  "Used of rivers.",
  "",
  "## Usage",
  "Poetic.",
  "",
].join("\n");
assert.equal(extractExportBody(note, "akal"), "Used of rivers.\n\n## Usage\nPoetic.");
assert.equal(extractExportBody("---\ndefinition: x\n---\n# Notes\nkeep", "akal"), "# Notes\nkeep");
assert.equal(extractExportBody("---\ndefinition: x\n---\n", "akal"), "");
assert.equal(extractExportBody("no frontmatter here", "akal"), "no frontmatter here");

console.log("export-format: all checks passed");
