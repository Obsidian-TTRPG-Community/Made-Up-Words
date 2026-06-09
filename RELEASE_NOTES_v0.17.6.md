# Made Up Words v0.17.6 — Lint cleanup fix

Corrects an eslint directive that the Obsidian review disallows. No user-facing
changes.

## Changed

- Removed an `eslint-disable` comment for `caretRangeFromPoint` (Obsidian's
  guidelines don't permit disabling that rule). The deprecated-but-broadly-
  supported caret API is kept as documented, now without the directive.

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
