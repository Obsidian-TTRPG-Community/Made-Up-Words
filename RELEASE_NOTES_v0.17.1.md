# Made Up Words v0.17.1 — Plugin review compliance

Maintenance release that brings the plugin in line with the official Obsidian
developer guidelines (`eslint-plugin-obsidianmd`). No user-facing feature
changes — purely internal fixes ahead of community-directory submission.

## Changed

- **Tooltips now build their DOM safely.** Hover tooltips (dictionary, inflected,
  multi-sense, and cypher) are constructed with the DOM API instead of
  `innerHTML`, removing all unsafe HTML assignment.
- **Settings headings** use Obsidian's `Setting().setHeading()` instead of raw
  `<h2>`/`<h3>` elements, for a consistent settings UI.
- **Show/hide and cursor styling** moved from inline styles to CSS classes
  (`conlang-hidden`, `conlang-clickable`), per the no-static-styles guideline.
- **`minAppVersion` raised to 1.7.2.** The panel now awaits `workspace.revealLeaf()`,
  which became asynchronous in Obsidian 1.7.2.

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
