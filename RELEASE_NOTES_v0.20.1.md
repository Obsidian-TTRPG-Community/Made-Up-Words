# Made Up Words v0.20.1 — Lint and code-health pass

Housekeeping only. No new features, and nothing you're using changes shape.

This release clears the full set of Obsidian plugin-guideline lint rules —
52 errors down to zero — so future reviews and contributions start from a
clean slate.

## Fixed

- **A stray `console.log` on plugin load is gone.** Obsidian asks plugins not
  to log to the console during normal operation; this one had been shipping
  quietly since the ribbon icon was added.
- **Four UI strings capitalised consistently.** The `Phrase`, `Cypher only`
  and `No match` badges in the gloss view (these render uppercase via CSS, so
  you won't see a difference), the language filter's `All` option in the
  dictionary browser, and the "Conlang form" placeholder.
- **Two hint messages reworded** — they referred to controls by names that no
  longer matched the labels on screen.

## Under the hood

- The settings tab stops calling Obsidian's deprecated
  `PluginSettingTab.display()` on itself; internal redraws go through a
  private method instead. The official replacement needs Obsidian 1.13.0, and
  this plugin still supports 1.7.2, so the override stays.
- Caret hit-testing prefers the standard `caretPositionFromPoint`, falling
  back to the older API only where it has to.
- Frontmatter values are read as `unknown` and narrowed explicitly instead of
  flowing through as `any`.

Where a lint rule was simply wrong — lower-casing "English", or wanting
"+ word" on a button whose first character is a `+` — the rule is configured
or suppressed with a comment explaining why, rather than the text being made
worse to satisfy it.

## Installing / updating

Download `main.js`, `manifest.json`, and `styles.css` from this release and
copy them into `.obsidian/plugins/made-up-words/` in your vault, then reload
the plugin (or restart Obsidian). Settings and dictionaries are preserved.
