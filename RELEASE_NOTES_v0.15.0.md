# Made Up Words v0.15.0 — Initial public release

A dictionary for the words you've made up — characters, places, invented vocabulary, conlangs — inside Obsidian.

This is the first public release. The plugin has been through several rounds of private testing; this collects that work for wider feedback. **It's pre-1.0 — usable and actively developed, but expect rough edges and the occasional breaking change.**

## What it does

- **Dictionary** of your made-up words as markdown notes, with definition, part of speech, IPA, etymology, and more in frontmatter.
- **Multi-language support** — keep several invented languages active at once; hover and lookup show matches across all of them, tagged by language.
- **Side panel** with live translation of selected text, a free-form lookup tab (word-by-word gloss or flat transliteration), and a searchable dictionary browser.
- **Hover tooltips** (hold Shift) showing dictionary entries, inflected-form analysis, and multi-language matches.
- **"Look up word" command** that surfaces every candidate the dictionary knows, without auto-picking a "best" answer.
- **Cypher engine** for generating placeholder words and names in your language's sound style — clearly labelled as a placeholder generator, not a translator.
- **Inflection rules** (affix-based) that recognise inflected forms and predict paradigms, with six presets.
- **Names, phrases, and compounds** as first-class entry types.
- **Unicode-aware** throughout — accented characters and non-Latin scripts work correctly.

## Philosophy

This is a **dictionary-and-lookup tool, not an auto-translator**. It surfaces what your dictionary knows and lets you make the linguistic decisions. It deliberately does not fake fluent translation, because real translation needs grammar and context a dictionary can't carry.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` below.
2. Put them in `YourVault/.obsidian/plugins/made-up-words/`.
3. Enable **Made Up Words** in Settings → Community plugins (refresh the list if needed).

Full documentation is in the [README](README.md).

## Known limitations

- Inflection is affixation-only (no infixes/ablaut).
- Reverse cypher is approximate.
- Large dictionaries (thousands of entries) are untested.

## Feedback

Bug reports and feedback are very welcome — please [open an issue](../../issues). Real-world use is exactly what this release needs.

🤖 109 automated tests passing across cypher, inflection, phrases, gloss, previews, and Unicode handling.
