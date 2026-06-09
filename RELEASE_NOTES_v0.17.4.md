# Made Up Words v0.17.4 — Code-quality cleanup

Internal cleanup pass against the official Obsidian developer guidelines. No
user-facing feature changes; behaviour is unchanged.

## Changed

- Replaced `setTimeout`/`document` with `window.setTimeout`/`activeDocument`
  throughout for pop-out window compatibility.
- Awaited or explicitly voided previously floating promises, and converted
  async event handlers so they no longer return promises where a void return is
  expected.
- Removed `any` usage on editor internals (CodeMirror view, caret APIs, syntax
  tree, settings dropdowns) in favour of narrow typed interfaces.
- Replaced the deprecated `substr` with `substring`, removed unused
  imports/variables, and tidied a couple of switch-case declarations.
- Dropped the development-only `test-*.ts` scripts from the published repo
  (they remain in version history).

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
