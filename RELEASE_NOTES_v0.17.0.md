# Made Up Words v0.17.0 — Aliases & per-language word adding

Two community-requested features, both from issue #2.

Resolves #2.

## Added

- **Entry aliases.** A dictionary entry can declare alternate surface forms via
  an `aliases` frontmatter field, and hover tooltips + highlighting treat every
  alias exactly like the headword:

  ```yaml
  ---
  definition: the second month
  aliases: Feb, Febr
  ---
  ```

  Hovering or highlighting `Feb` or `Febr` resolves to the `February` entry.
  Accepts a comma-separated string or a YAML list; multi-word aliases are
  matched like phrases; aliases are shown in the tooltip
  ("February (also: Feb, Febr)").

- **Add a word to any language(s), including several at once.** Highlight a word
  (or put the cursor on one), then **right-click → "Add to Made Up Words
  dictionary…"** or run **"Add selection to dictionary"**. The Save dialog now
  lists every language with a checkbox and an editable, cypher-seeded form per
  language — tick one or several and an entry is created in each language's own
  folder at once (shared part of speech + definition). No more manually sorting
  words out of one default folder.

## Fixed

- New entries reliably create their target folder (with a clear error notice if
  it fails), so adding a word to a brand-new subfolder works.
- **Hover tooltips now show a concept across every active language at once** —
  combining both directions (word as a headword and as a definition) plus
  cross-language equivalents that share a definition. Hovering one language's
  form for a concept also surfaces the other languages' forms in one tooltip.

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Fresh installs: see the [README](README.md).
