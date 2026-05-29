# Made Up Words

A dictionary for the words you've made up — characters, places, invented vocabulary, conlangs — living inside your Obsidian vault.

[![Version](https://img.shields.io/badge/version-0.15.0-blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> **Pre-1.0 / early release.** The plugin is usable and actively developed, but expect rough edges and the occasional breaking change. Feedback and bug reports are very welcome — see [Filing feedback](#filing-feedback). Changes between versions are tracked in [CHANGELOG.md](CHANGELOG.md).

---

## What this plugin is, honestly

**This is a dictionary-and-lookup tool, not a translator.** Real translation between languages requires grammar, register, social context, and discourse-level decisions that no plugin can make for you. Languages aren't ciphers for English — they encode information English doesn't, and lose information English does encode. A plugin that pretends otherwise will be useful for the "English with different sounds" case (most fantasy worldbuilding) and actively misleading for serious conlanging work.

Made Up Words takes a deliberately honest approach. It does three things:

1. **Stores your dictionary** as a folder of markdown notes with structured frontmatter, and indexes them for fast lookup. Each invented word gets its own note.

2. **Looks words up.** When you highlight or hover a word in any note, it shows you what the dictionary knows — all the matching senses, not a single "best" guess. Inflected forms are recognised when you've defined rules for them.

3. **Generates phonological placeholders** via a deterministic cypher engine. This is for *inventing new words and names* in your language's sound style — not for translating sentences. The plugin labels cypher output clearly so you know it's a placeholder, not a translation.

This positions Made Up Words as a tool for both casual worldbuilding ("I need a fantasy name that fits") and serious linguistic conlanging (where the dictionary is the only real translation surface and the cypher is mostly irrelevant).

---

## Two modes of use

### Mode A: Flavour conlang (English with different sounds)

You want your fantasy world to feel different but you don't intend to design real grammar. Use the cypher engine to define sound substitutions, save a handful of named characters and places as dictionary entries, and the plugin will transliterate prose for you. The "transliterate" output in the translator tab does what you want — though it's still not real translation; it's English with substituted phonemes.

This is the use case most worldbuilders have. The plugin works well here.

### Mode B: Linguistic conlanging

You're designing a real language with morphology, syntax, register choices, and lexicon that doesn't map 1:1 to English. The cypher is largely irrelevant for you. What the plugin offers:

- A structured dictionary with metadata (POS, IPA, etymology, semantic notes)
- Multi-sense English-to-conlang lookup (the plugin won't pick a "best" sense — you do)
- Inflection rule definitions that recognise inflected forms on hover and predict paradigms
- Phrase / fixed-expression / compound entries with optional `parts` decomposition
- A names registry for proper nouns
- A "Look up word" command that shows all dictionary candidates with their metadata

What the plugin doesn't do, and won't try to do:

- Translate sentences. There is no fluent output mode. The translator tab's gloss mode shows you word-by-word lookups so you can see what the dictionary knows; the assembly into grammatical conlang is your job.
- Encode politeness/honorifics, evidentiality, topic-comment structure, or other features that require context the dictionary doesn't carry. You can record these in entry notes, but the plugin doesn't generate them.
- Handle non-affixational morphology (ablaut, Semitic root templates, reduplication). The inflection matcher is affix-only.

---

## Features

### Side panel

Click the book-open icon in the left ribbon (or run **Made Up Words: Open panel**) to open the panel on the right. Three tabs:

**Selection** — auto-updates as you highlight text in any note. For single-word selections that resolve to a dictionary entry, it switches to a "word details" view showing the entry plus its predicted inflected forms.

**Translator** — a free-form input box. Type something and see how the plugin looks it up. Two modes:

- *Gloss* (default) — shows word-by-word breakdown. Each word is a card showing what kind of match it is (dictionary, inflected, phrase, cypher placeholder, no match) plus all matching candidates. **This is the honest representation: it does not assemble fluent translation.**
- *Transliterate* — flat substitution output, with dictionary words shown in plain colour and cypher placeholders shown italicised in orange. Useful for the flavour-conlang case; labelled honestly for the linguistic-conlang case.

**Dictionary** — browse, search, filter, and sort all entries. Names filter, part-of-speech filter, search by definition or category. Click any entry to open its note.

### Hover lookups

By default, hover tooltips require **holding Shift** while pointing at a word — this keeps them out of the way during normal reading. Change this in Settings → Made Up Words → Hover modifier key (options: None, Shift, Alt, Ctrl/Cmd). Setting it to "None" restores the old always-on behaviour. Note: after pressing or releasing the modifier, move the mouse slightly to refresh the tooltip state.

When you hover:

- Direct dictionary entry → full metadata
- Inflected form → the lemma plus inflection label ("kalath = plural of kala")
- English word matching multiple senses → **all candidates listed**, plugin doesn't pick
- Multi-word phrase → the phrase entry
- Cypher transformation available → labelled as "cypher only"

### "Look up word" command

Select a word in any note and run **Made Up Words: Look up word (all senses)** (or assign a hotkey). A modal opens with every possible match: direct entries, inflected forms, English-direction candidates, and a cypher placeholder if applicable. Each candidate shows its metadata. Click to open the entry's note.

This is the workflow if you want explicit control over which sense you use in a given context.

### Inflection rules

Configure suffix/prefix rules per language in Settings. Each rule:
- has a label ("plural", "past tense", "genitive", etc.)
- specifies pattern, strip, and add fields (for simple chops or respellings)
- can be POS-conditioned so a noun-plural rule doesn't fire on verbs
- can have its own description for hover education

Six presets ship out of the box: None, Minimal, Indo-European basic, Indo-European full, Agglutinative starter, Analytic. Apply a preset to load a curated starter set, then edit the affixes.

Rules are bidirectional: they recognise inflected forms during lookup AND predict the inflected forms of a word when you view its details.

### Names registry

Proper nouns get special handling. The "+ Name" button in the panel header opens a creation modal that supports two paths: type the name freely, or derive it from English via the cypher (which the modal makes explicit, not implicit). Names are stored verbatim so they're locked even if cypher rules change.

Categories (character, place, faction, artifact, event, title, other) are filterable in the browser and each has hover-tooltip explanations.

### Phrases and compounds

Multi-word entries work via the `word:` frontmatter override. Compounds can declare `parts:` to list their constituent conlang words; the word-details view then shows each part's meaning with click-through to that part's entry.

### Education tooltips

About 30 common inflection category labels (plural, past, genitive, comparative, evidential, etc.) have built-in hover explanations to help users learn linguistic vocabulary. Custom labels can have their own descriptions on each rule.

---

## Installation

This plugin is not yet in the Obsidian community plugin browser, so install it manually from the GitHub releases.

1. Go to the [Releases page](../../releases) and download `main.js`, `manifest.json`, and `styles.css` from the latest release (they're attached as individual assets, and also bundled in the release `.zip`).
2. In your vault, navigate to `.obsidian/plugins/` (this folder may be hidden — on macOS press Cmd+Shift+. in Finder; on Windows enable "Show hidden files"; on Linux press Ctrl+H).
3. Create a folder called `made-up-words` inside it.
4. Copy the three files into that folder, so you have `.obsidian/plugins/made-up-words/main.js` (and `manifest.json`, `styles.css`).
5. In Obsidian: Settings → Community plugins. Enable community plugins if you haven't, then click the refresh icon, find **Made Up Words**, and toggle it on.

If the plugin doesn't appear, restart Obsidian.

**Updating:** download the three files from the newer release and overwrite the old ones. Your settings and dictionary are stored separately and are preserved; any settings-format changes migrate automatically on load.

---

## First-time setup

The plugin ships with one pre-configured example language at folder `Made Up Words/Example`. You can either edit this in Settings → Made Up Words to point at a folder you actually use, or add a new language. The dictionary folder doesn't need to exist yet.

1. Open the panel (book-open icon in the left ribbon).
2. The panel header shows your active language and entry count.
3. Open any note, type some English, highlight a word.
4. Try the **Translator** tab to see how looking up text feels.
5. Click **Save to dictionary** to commit a word. You'll be prompted for the part of speech.
6. Click **+ Name** in the panel header to create proper nouns.

To customise: open Settings → Made Up Words. Cypher rules in sheets, inflection rules with presets, per-language dictionary folder paths.

---

## Dictionary entry format

A dictionary entry is a single markdown file. The filename is the conlang word by default; frontmatter can override this for phrase entries.

```markdown
---
definition: water
language: Example
partOfSpeech: noun
ipa: /ˈka.la/
etymology: from proto-form *kal-
---

# kala

Used for fresh water specifically. The sea is *drennith*.
```

Only `definition` is required. Supported frontmatter fields:

| Field | Purpose |
|-------|---------|
| `definition` | English translation. Comma- or semicolon-separated values index as separate English senses. |
| `language` | Which language this entry belongs to. |
| `partOfSpeech` | Used by inflection rules and the browser. Common values: noun, verb, adjective, adverb, pronoun, proper-noun, preposition, conjunction, interjection. |
| `ipa` | Pronunciation. |
| `etymology` | Origin / derivation notes. |
| `word` | Overrides the filename as the surface form. Needed for phrase entries with spaces. |
| `parts` | YAML list or comma-separated string of conlang words this compound decomposes into. |
| `nameCategory` | For proper nouns: character, place, faction, artifact, event, title, other. |

**Multi-sense entries:** if a word has genuinely different senses (e.g. English "see" = visual perception vs. understanding), create *separate dictionary entries* — one for each sense. Comma-separating in the definition only helps if you want one entry to match multiple English keys with effectively the same meaning ("water, liquid").

---

## Cypher rules (Mode A use case)

In Settings → Made Up Words → any language, configure **cypher sheets**. Each sheet is a list of input→output substitution rules with a type:

- **word** — matches only when bordered by non-letters on both sides
- **prefix** — matches at the start of a word
- **suffix** — matches at the end of a word
- **default** — matches anywhere

Rules within a sheet: longest match wins, then word > prefix > suffix > default. Sheets run top-to-bottom with each sheet's output feeding the next. **Put whole-word substitutions at the top**, before sound-change sheets.

**Honest framing:** the cypher is a tool for generating words in your language's phonological style. It is *not* a translation engine and the plugin no longer pretends it is. Output is clearly labelled as cypher fallback throughout the UI.

---

## Inflection rules (Mode B use case)

In Settings → Made Up Words → any language → Inflection rules. Each rule has:

- **Label** — the inflection's name ("plural", "past", "genitive")
- **Position** — suffix or prefix
- **Pattern** — the affix string
- **Strip** — what to remove (usually same as pattern)
- **Add** — what to put back (for respellings like English -ies → -y; usually empty)
- **POS filter** — comma-separated parts of speech this rule applies to
- **Description** — your own tooltip explanation (overrides built-in for known labels)

Rules are tried in order. First one whose reconstructed lemma exists in the dictionary wins, so unrelated words won't get false-matched.

**Limitations:** affixation only. No infixes, ablaut, reduplication, or root templates. If your conlang has those, the inflection matcher will miss them — record them in entry notes instead.

---

## Commands

In the command palette under "Made Up Words:":

- **Open panel**
- **Look up word (all senses)** — opens the lookup modal with all candidates. The honest workflow for serious linguistic work.
- **Translate selection to primary language (preview)** — shows a notice with the transliterated output
- **Translate selection to primary language and replace** — commits the transliterated output, wrapping the original in `<abbr title="...">` so it shows on hover in reading mode
- **Translate selection to English (preview)**
- **Add selection to dictionary** — opens the save-to-dictionary modal
- **Add a name (proper noun)**
- **Reload dictionary**

Assign hotkeys to the commands you use most.

---

## What's deliberately not in this plugin

- **Auto-translation of sentences.** This was the central feedback we received from a linguistic-conlanger tester, and we agreed with it. Languages encode information English doesn't (and vice versa); pretending otherwise produces wrong output dressed up as right output.
- **Politeness levels, register, evidentiality, topic/focus particles, honorifics.** These are real and important features of many languages; they're context-dependent and the dictionary doesn't carry the context. Record them in entry notes.
- **Quick-insert autocomplete** while typing (roadmap, not built)
- **Coverage view** showing what semantic domains your dictionary covers (roadmap)
- **Sound-change cascades** (Lexurgy-style ordered phonological rules with conditioning)
- **Phonotactic validation / word generation**
- **Custom script / orthography rendering**
- **Interlinear gloss code blocks** for entry notes
- **Cross-language relationships** (proto → daughter)

---

## Known limitations

These are current rough edges rather than deliberate scope choices:

- **Inflection handles affixation only** — prefixes and suffixes. No infixes, ablaut (vowel mutation), reduplication, or root-and-pattern morphology. If your language relies on these, the inflection matcher will miss them; record forms as separate entries instead.
- **Reverse cypher is approximate.** Substitution rules can collide, so conlang→English cypher fallback is best-effort. Dictionary entries are always exact; the cypher is the fallback.
- **Large dictionaries are untested.** Performance with several thousand entries hasn't been measured. If you have a large lexicon and hit slowness, please file an issue with rough numbers.
- **One note per conlang word.** The plugin doesn't support a "one note per concept, translations in frontmatter" layout. Multi-language vaults use one note per word per language.

---

## Filing feedback

Bug reports and feedback are very welcome — please open a [GitHub issue](../../issues). This is an early release and real-world use is exactly what it needs.

Most useful kinds of feedback:

- **Workflow friction** — moments where you knew what you wanted to do but the plugin made it hard
- **Wrong defaults** — places where the plugin assumes too much or too little
- **Honesty failures** — places where the UI implies more capability than the plugin actually has (these matter; the plugin tries hard to be honest about its limits)
- **Bugs** — anything that crashes, fails silently, or produces wrong output

When filing a bug, it helps to include: your Obsidian version, what you did, what you expected, and what happened instead. For errors, open the developer console with Ctrl+Shift+I (Cmd+Opt+I on Mac) — plugin errors appear there with a `[Made Up Words]` prefix, and pasting them into the issue speeds things up a lot.

Feature requests are welcome too, though note the [known limitations](#known-limitations) and the deliberately-omitted items are intentional design choices rather than oversights — though if enough people want one, that's useful signal.

---

## Contributing

The plugin is written in TypeScript and built with esbuild. To work on it:

```bash
npm install
node esbuild.config.mjs production   # one-off build
node esbuild.config.mjs              # watch mode for development
```

The test suites are plain TypeScript compiled to CommonJS and run with Node — see the `test-*.ts` files. They have no test-runner dependency, so they run anywhere Node does.

The source is organised into focused modules: `cypher.ts` (substitution engine), `dictionary.ts` (the index and loader), `gloss.ts` (lookup model), `inflection.ts` (morphology), `phrases.ts` (multi-word matching), `panel.ts` (the side panel UI), `main.ts` (plugin lifecycle and hover), and several modal files. Shared string helpers live in `word-tokens.ts`.

---

## Credits

- **FanLang** by Mick Boere — the cypher engine algorithm is directly inspired by FanLang's read-and-replace model.
- **The conlanger testers who pushed back on auto-translation** — the lookup-first design exists because of that feedback. The framing of "the plugin doesn't pick a best sense for you — language doesn't work that way" came directly from their critique.
- **Lexurgy, Vulgarlang, LanguaGen, Awkwords** — the broader conlanging ecosystem informs what this plugin tries to do and what it deliberately doesn't try to replace.
- **Leipzig glossing rules** — the `.LABEL` notation in gloss output.
