# Changelog

All notable changes to the Made Up Words plugin are documented here.

This project is pre-1.0. Expect rough edges and occasional breaking changes to
settings or data formats. Where a change affects existing data, migration is
handled automatically on load.

## [0.17.0] - Aliases & per-language word adding

_Resolves [#2](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/2)._

### Added
- **Entry aliases.** A dictionary entry can now declare alternate surface forms
  via an `aliases` frontmatter field, and hover tooltips + highlighting treat
  every alias exactly like the headword. For example, on a `February` entry:

  ```yaml
  ---
  definition: the second month
  aliases: Feb, Febr
  ---
  ```

  Hovering or highlighting `Feb` or `Febr` now resolves to the `February`
  entry. Accepts a comma-separated string or a YAML list, and multi-word
  aliases are matched like phrases. Aliases are shown in the hover tooltip
  (e.g. "February (also: Feb, Febr)").
- **Add a word to any language(s) — including several at once.** Highlight a word
  (or place the cursor on one) and either right-click → **"Add to Made Up Words
  dictionary…"** or run **"Add selection to dictionary"** from the command
  palette. The Save dialog now lists every language with a checkbox and an
  editable, cypher-seeded conlang form per language — tick one or several to
  create an entry in each language's own folder in one go (with a shared part of
  speech and definition). No more sorting words out of a single default folder.

### Fixed
- New entries now create their target folder reliably, with a clear error notice
  if creation fails — adding a word to a brand-new subfolder now works.
- **Hover tooltips now show a concept across every active language at once.**
  Hovering combines both directions (the word as a headword and as a definition)
  and also pulls in cross-language equivalents that share a definition — so
  hovering one language's form for a concept (e.g. "Traenslaetis") also surfaces
  the other languages' forms (e.g. "Translateees") in a single tooltip.

## [0.16.0] — Highlight known words

### Added
- **Known-word highlighting.** Words and phrases the plugin recognises are now
  visually marked directly in your notes, in both the editor (Live Preview /
  Source) and Reading view. Two directions are supported:
  - **Conlang words** — anything that exists as a dictionary entry in an active
    language, including inflected forms and multi-word phrases.
  - **Translatable English words** — English terms the dictionary can translate
    (e.g. "cat" is marked when you have a word meaning cat).
- **Three highlight styles** in Settings → Made Up Words → Highlighting: a
  subtle dotted underline + accent colour (default), italics, or a faint
  background. Each direction (conlang / English) can be toggled independently,
  and the whole feature has a master on/off switch.
- Highlight appearance is driven entirely by CSS classes
  (`.conlang-known-word.is-conlang` / `.is-english` / `.is-phrase`), so themes
  and CSS snippets can fully restyle it. Colours are exposed as the
  `--conlang-known-color` / `--conlang-known-english-color` /
  `--conlang-known-bg` custom properties.
- **Command: "Toggle known-word highlighting"** — turn highlighting on or off
  from the command palette (handy on slower machines, or for a quick
  distraction-free read).

### Changed
- **Settings tab redesigned.** Global options are grouped into clear sections
  (Languages, Hover tooltips, Highlighting, Translation), and each language is
  now a collapsible card with its cypher sheets and inflection rules as nested
  collapsibles, so the page stays manageable with many languages. A top
  overview lists every language with quick Active checkboxes and a Primary
  star, and active cards show a live entry count. Fixed the per-language
  "Reload dictionary" button (it previously checked a legacy field and rarely
  fired) and made language removal keep the active/primary selection valid.
- **Hover tooltips are now throttled.** Resolving the word under the cursor
  uses `caretRangeFromPoint`, which forces a layout flush; previously this ran
  on every `mousemove`. It now runs at most once per 50&nbsp;ms (with a trailing
  call so the cursor's final position still resolves), and the handler bails out
  with a single cached boolean when no active language has hover enabled. This
  noticeably reduces CPU use while moving the mouse, especially with always-on
  hover.

### Notes
- The editor decorator only scans the visible viewport and skips code blocks,
  inline code, frontmatter, math, and HTML for performance and correctness.
- Highlighting refreshes automatically when the dictionary or settings change.

## [0.15.1] — Plugin review fixes

A small patch release addressing the Obsidian community plugin automated
review. No user-facing functional changes; this is purely cleanup of
warnings flagged by the review pipeline.

### Fixed
- **CSS:** Replaced the `text-decoration: underline dotted` shorthand
  (partially supported by older Obsidian versions) with the longhand
  `text-decoration-line` / `text-decoration-style` / `text-decoration-color`
  properties, which have universal support.
- **CSS:** Removed `!important` from `.conlang-modal-derive-row input` by
  increasing selector specificity instead. This is more maintainable and
  less fragile.

### Changed
- Replaced the `builtin-modules` npm dependency with Node's native
  `module.builtinModules` (available since Node 9.x). One fewer
  third-party dependency.
- Upgraded `esbuild` from 0.17.3 to ^0.25.0 to clear a dev-time CVE
  (advisory GHSA-67mh-4wv8-2f99). This vulnerability never affected end
  users — esbuild is build-time only and not included in the released
  `main.js` — but it's good hygiene.
- `package-lock.json` is now committed to the repository for reproducible
  builds, as recommended by the review pipeline.

## [0.15.0] — Initial public release

First public release. The plugin has been through several rounds of private
testing; this version collects that work and packages it for wider feedback.

### Core capabilities

- **Dictionary**: one markdown note per word, with frontmatter for definition,
  part of speech, IPA, etymology, and more. Indexed for fast lookup.
- **Multi-language support**: multiple languages can be active at once. Hover,
  lookup, and browsing query all active languages; a primary language is the
  target for translation and new entries.
- **Side panel** with three tabs: Selection (live translation of highlighted
  text), Translator (free-form lookup with gloss and transliterate modes), and
  Dictionary (browse, search, filter, sort).
- **Hover tooltips**: hover any word (holding Shift by default) to see its
  dictionary entry, inflected-form analysis, or multi-language matches.
- **Look up word command**: shows every candidate the dictionary knows for a
  selected word, across all active languages, with no auto-picking.
- **Cypher engine**: deterministic phonological substitution for generating
  placeholder words and names in your language's sound style. Clearly labelled
  as a placeholder generator, not a translator.
- **Inflection rules**: affix-based morphology that recognises inflected forms
  on hover and predicts paradigms. Six presets included.
- **Names registry**: proper nouns with categories, locked at creation.
- **Phrases and compounds**: multi-word entries with optional part
  decomposition.
- **Unicode-aware** throughout: accented characters, non-Latin scripts, and
  hyphenated compounds are handled correctly.

### Design philosophy

This is a dictionary-and-lookup tool, not an auto-translator. It does not
attempt to generate fluent translation, because real translation requires
grammar and context the dictionary does not encode. The gloss mode and
multi-sense lookup are designed to surface what the dictionary knows and let
you make the linguistic decisions yourself.

### Known limitations

- Inflection handles affixation only — no infixes, ablaut, or root templates.
- The cypher's reverse direction is approximate (substitutions can collide).
- Performance with very large dictionaries (several thousand entries) is
  untested.
- The "concept-as-note, languages-as-frontmatter" data model (one note per
  meaning, translations in frontmatter) is not natively supported; the plugin
  uses one note per conlang word.
