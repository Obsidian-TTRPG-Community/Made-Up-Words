# Made Up Words v0.17.2 — Settings heading compliance

Follow-up to 0.17.1 that clears the last two errors from Obsidian's automated
plugin review. No user-facing feature changes.

## Changed

- Removed the redundant "Made Up Words" heading at the top of the settings tab
  (Obsidian already shows the plugin name as the tab title).
- Renamed the "Per-language settings" heading to "Per-language options" so it no
  longer uses the discouraged word "settings".

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
