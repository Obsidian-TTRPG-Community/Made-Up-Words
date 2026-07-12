# Made Up Words v0.18.0 — Reordering, quick word-adding, case-sensitivity & clickable words

A feature release working through several community requests, plus a highlighting
fix for themes that hid it.

## Added

- **Reorder inflection rules and cypher sheets.** Inflection rules now have
  up/down controls in a leftmost "Order" column, and each cypher sheet has
  up/down arrows in its header. Order matters — inflection rules are tried
  top-to-bottom (first match wins) and cypher sheets run in sequence — so you can
  now nudge them into place instead of deleting and re-creating. Reordering
  happens in place without jumping the settings scroll. (#9)
- **"Add a word" command.** Opens the add-a-word dialog for the active/primary
  language, so you can bind it to a hotkey — great for bulk-migrating a
  dictionary. (#8)
- **Optional case-sensitive matching.** Settings → *Word matching →
  Case-sensitive matching* makes conlang headwords, aliases, and phrase matching
  distinguish case, so `Sol` (a name) and `sol` (a word) can be separate entries.
  English-side lookups stay case-insensitive. Off by default. (#5)
- **Click a recognised word to open its entry.** Highlighted conlang words are
  clickable and open their dictionary note — a plain click in Reading view, and
  in Live Preview (Ctrl/Cmd-click opens a new tab). Inflected forms jump to the
  lemma's note. (#6)

## Fixed

- **Highlighting shows up again under more themes.** Under themes that don't
  define `--text-accent` at `:root` — such as ITS Theme — the highlight's colour
  variable resolved to an invalid value and silently dropped the entire
  underline/colour rule, so recognised words weren't marked. Highlights now use
  Obsidian's theme variables directly with fallbacks, are applied inline, and
  draw their underline with a bottom border so they also appear in Live Preview.
- **Headings stay out of hover tooltips.** The proper-noun body preview now also
  skips setext-style headings (`===` / `---` underlines), not just `#` headings.
  (#4)

## Performance

- First-word phrase index, cached word classification, debounced dictionary
  reloads, and a cap on very large panel result lists keep things responsive on
  big dictionaries.

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
