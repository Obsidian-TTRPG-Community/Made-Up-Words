# Changelog

All notable changes to the Made Up Words plugin are documented here.

This project is pre-1.0. Expect rough edges and occasional breaking changes to
settings or data formats. Where a change affects existing data, migration is
handled automatically on load.

## [0.21.1] - Community review fixes

No user-facing behaviour changes. This release clears the four errors reported
by the Obsidian community-plugin automated review of 0.21.0.

### Fixed
- **Committed lockfile is back in sync with `package.json`.** The review's
  dependency check and its build verification both failed on a stale
  `package-lock.json`. Regenerated, and `@codemirror/state` / `@codemirror/view`
  are now pinned to the exact versions Obsidian 1.13.0 declares as peers
  (`6.5.0` / `6.38.6`) — the previous carets requested versions above the pin,
  so a clean `npm install` resolved with peer-dependency overrides.
- **No more suppressed lint rules.** `eslint-plugin-obsidianmd` 0.4.x forbids
  inline `eslint-disable` of `obsidianmd/*` and `@typescript-eslint/no-deprecated`,
  and requires a description on every directive comment. All 13 directive
  comments have been removed rather than annotated:
  - `caretRangeFromPoint` (the pre-1.13.0 caret fallback) is now reached through
    a locally declared type, so the call no longer resolves to the deprecated
    `Document` member. The fallback itself is unchanged.
  - The *Remove language* button now calls `setDestructive()` where the running
    app provides it and `setWarning()` where it does not, resolved through a
    local type. Previously it always called the deprecated `setWarning()`.
  - The remaining suppressions were for `obsidianmd/ui/sentence-case` on strings
    the rule reads wrongly ("e.g. …" placeholders, and buttons whose first token
    is a glyph). The copy is unchanged; the rule now runs at the plugin's own
    default severity, so those report as warnings instead of being silenced.

### Changed
- Release workflow publishes **GitHub artifact attestations** for `main.js` and
  `styles.css`, so their provenance can be cryptographically verified against
  this repository.
- Release workflow installs with `npm ci` instead of `npm install`, so a future
  lockfile drift fails the build instead of passing quietly.
- Three `createEl("div", …)` calls in the word and name modals are now
  `createDiv(…)`, per `obsidianmd/prefer-create-el`.

## [0.21.0] - Hover direction control

_Resolves [#12](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/12)._

### Fixed
- **Your conlang now wins over English on hover.** Hover used to run both
  directions and merge the results, so a word that was both one of your
  headwords *and* some other entry's English definition produced a tooltip
  mixing "what your word means" with "how to say this English word" — the
  confusion reported in the issue. The conlang side is now resolved first
  (headword → declared form → inflected form) and, when any of those match, the
  English direction is not consulted at all. This is the order highlighting has
  always used; hover just never matched it. ([#12])
- **Cross-language sibling lookup no longer loops back to the hovered word.**
  An entry whose definition repeats its own headword or alias (common for
  loanwords and for proper nouns entered with the same form and referent) could
  re-introduce the English-direction hits that were just suppressed. ([#12])

### Added
- **Hover direction toggles.** Two new switches under *Settings → Hover
  tooltips*, mirroring the existing highlight settings:
  - *Show your words' meanings* — the conlang direction: headwords, phrases,
    declared forms, and inflected forms.
  - *Show English to conlang translations* — the English direction. Turn it off
    if your made-up words are still being read as English. It also disables the
    cypher preview, which transforms hovered text the same way — leaving that on
    would keep producing the output you just switched off.

  Both default to on, so nothing changes unless you touch them. Turning both off
  makes hover inert, and the mousemove handler then short-circuits before doing
  any layout work. ([#12])

### Changed
- The *Fallback for unknown words* dropdown is disabled while the English
  direction is off, instead of silently having no effect.
- **README** documents the full hover resolution order and both new toggles.

[#12]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/12

## [0.20.1] - Lint and code-health pass

_No new features. A full pass over the Obsidian plugin-guideline lint rules,
taking the repo from 52 errors to zero. User-facing behaviour is unchanged
apart from four small text corrections noted below._

### Fixed
- **Removed a stray `console.log` on plugin load.** Obsidian's guidelines ask
  plugins not to log to the console in normal operation; this one had been
  shipping since the ribbon icon was added.
- **Capitalised four UI strings** that were lower-cased inconsistently: the
  `Phrase` / `Cypher only` / `No match` gloss badges (rendered uppercase by
  CSS, so no visible change), the browser's language filter `All` option, and
  the "Conlang form" placeholder.
- **Reworded two hint strings** that referred to UI controls by names that no
  longer matched their labels.

### Changed
- **Settings tab no longer calls the deprecated `PluginSettingTab.display()`
  on itself.** The ~14 internal "redraw after an edit" callers now go through
  a private `rerender()`, with `display()` kept as the thin override Obsidian
  calls. `getSettingDefinitions` (the replacement API) only exists in Obsidian
  1.13.0+, and this plugin's `minAppVersion` is 1.7.2, so migrating to it
  would drop support for every version in between. No behaviour change.
- **Caret resolution now prefers the standard `caretPositionFromPoint`**,
  falling back to the legacy `caretRangeFromPoint` on the older Chromium
  builds shipped with Obsidian back to 1.7.2.
- **Frontmatter reads are typed as `unknown` and narrowed explicitly** rather
  than letting an `any` flow into a string comparison.
- **`eslint.config.mjs` teaches the sentence-case rule about proper nouns** it
  was wrongly lower-casing — "English", Obsidian's own "Reading view" and
  "Live Preview", keyboard names, and the CSS/POS acronyms. The remaining ten
  reports are suppressed inline with a comment explaining why the rule's
  suggestion would make the text worse (it reads the full stop in "e.g." as a
  sentence break, and wants "+ word" where the first token is a glyph).
- **`setWarning()` on the remove-language button is kept** with a documented
  suppression: its replacement `setDestructive()` doesn't exist on 1.7.2.

## [0.20.0] - Hardcoded inflections & form tables

_Resolves [#10](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/10)
and [#15](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/15)._

### Added
- **Hardcoded inflected forms (`forms:`).** An entry can now declare its own
  irregular forms in frontmatter as a list of `"label: form"` strings, e.g.
  `- "plural: kalath"`. Declared forms are recognised everywhere rule-derived
  forms are — hover shows "kalath = plural of kala", they highlight, and
  clicking opens the lemma's note. Several forms can share a label
  (`"dative: kalim, kalum"`), and multi-word forms are matched by the phrase
  matcher. A declared form takes priority over anything the inflection rules
  would derive, and declaring a label suppresses the same-named rule for that
  entry only — so a hardcoded `past: went` no longer sits beside a predicted
  *goed*. ([#10], [#15])
- **Declension/conjugation tables in the UI.** Declared forms render as a
  **Declared forms** section in the side panel's word details, and as a compact
  line in the hover tooltip (capped at 8 forms, then "+N more"). A new
  *Word matching → Show declared forms in hover tooltip* setting turns the
  tooltip half off for people who keep tooltips minimal; the panel always shows
  them. ([#15])
- **`inflectAs:` — borrow another part of speech's rules.** An entry tagged
  `partOfSpeech: pronoun` can set `inflectAs: noun` and will then match
  POS-filtered rules for *both*. Additive rather than replacing, so existing
  pronoun-specific rules keep firing. This removes the need to duplicate a
  large rule set just to cover a word class that inflects like another —
  the case that prompted the issue, at 184 rules. ([#10])

### Changed
- **Lookup results list hardcoded forms above rule matches**, and no longer
  shows the same lemma twice when both routes resolve to it.
- **README** documents `forms:`, `inflectAs:`, and `aliases:` in the frontmatter
  table, with a worked example of each.

### Fixed
- **Hover tooltip now shows the source language.** The single-word dictionary
  tooltip (and the inflected-form tooltip) previously never rendered the
  entry's language — only the multi-sense cross-language tooltip did. The
  language name is now shown after the headword whenever more than one language
  is active, matching the existing multi-sense behaviour. Single-language
  vaults are unchanged (no language label, to avoid noise). _(Prepared as
  0.19.1, which was never released; it ships here instead.)_

[#10]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/10
[#15]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/15

## [0.19.0] - Homograph (multi-sense) entries

_Resolves [#11](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/11)._

### Added
- **Homograph (multi-sense) entry creation.** All add-word paths (add-a-word
  modal, create-from-selection, batch creation, and add-a-name) now detect when
  a word already exists with a *different* meaning and create a new sense file
  (`word (partOfSpeech).md`) with the `word:` frontmatter override, instead of
  silently opening/skipping the existing entry. Re-adding an existing meaning
  still just opens the existing entry. Hover already showed every sense of a
  shared spelling in one tooltip; now the UI can actually create those senses.
  ([#11])

### Changed
- **README:** documented the `word:` override as the recipe for multi-sense
  entries — it was previously described as phrase-only, leaving no documented
  way to create two entries with the same spelling. ([#11])

[#11]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/11

## [0.18.0] - Reordering, quick word-adding, case-sensitivity & clickable words

_Resolves [#4](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/4),
[#5](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/5),
[#6](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/6),
[#8](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/8), and
[#9](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/9)._

### Added
- **Reorder inflection rules and cypher sheets.** Each inflection rule now has
  up/down controls in a leftmost "Order" column, and each cypher sheet has
  up/down arrows in its header. Order is significant — inflection rules are tried
  top-to-bottom (first match wins) and cypher sheets run in sequence — so being
  able to reorder without deleting and re-creating matters. Reordering updates
  in place without resetting the settings scroll position. ([#9])
- **"Add a word" command.** A new command opens the add-a-word dialog for the
  active/primary language, so it can be given a hotkey — mirroring the existing
  "Add a name" command. Handy when migrating a large dictionary into Obsidian.
  ([#8])
- **Case-sensitive matching (optional).** A new *Word matching → Case-sensitive
  matching* toggle makes conlang-word lookups (headwords, aliases, and phrase
  matching) distinguish case, so a proper noun like `Sol` and a common noun
  `sol` can be separate entries. English-side lookups stay case-insensitive.
  Off by default; changing it reloads the dictionary. ([#5])
- **Click a recognised word to open its entry.** Highlighted conlang words are
  now clickable and open their dictionary note — in both Reading view and Live
  Preview (Ctrl/Cmd-click opens it in a new tab). Inflected forms open their
  lemma's note; English matches open the first translation. ([#6])

### Fixed
- **Highlighting is visible again under more themes.** Under themes that don't
  define `--text-accent` at `:root` (e.g. ITS Theme), the highlight colour
  variable resolved to an invalid value, which silently dropped the whole
  underline/colour rule — so recognised words showed no highlight. Highlights
  now use Obsidian's theme variables directly (with fallbacks) and are applied
  as inline styles, and the underline is drawn with a bottom border so it also
  shows in Live Preview, where CodeMirror suppresses `text-decoration`.
- **Note headings stay out of hover tooltips.** The body-preview shown for
  proper nouns already skipped `#` headings; it now also skips setext-style
  headings (a line underlined with `===` or `---`), so heading text never leaks
  into a definition tooltip. ([#4])

### Performance
- Phrase matching now uses a first-word index, word classification is cached,
  dictionary reloads are debounced, and the side panel caps very large result
  lists — keeping highlighting and browsing responsive on large dictionaries.

[#4]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/4
[#5]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/5
[#6]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/6
[#8]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/8
[#9]: https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/9

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
