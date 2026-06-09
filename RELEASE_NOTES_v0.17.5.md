# Made Up Words v0.17.5 — Final lint cleanup

Last cleanup pass against the Obsidian developer guidelines. No user-facing
changes.

## Changed

- Removed the remaining `any` usages (frontmatter coercion helper; the
  translator-mode and name-filter option arrays now use explicit unions).
- Switched the last `document.createElement` to `activeDocument` for pop-out
  window compatibility.
- Collapsed the highlight `text-decoration-*` longhands into the `text-decoration`
  shorthand (identical rendering, better-supported form).
- Scoped an eslint-disable to the intentional `caretRangeFromPoint` fallback
  (kept for the broadest Chromium support, with `caretPositionFromPoint` as the
  standard path).

## Install

Overwrite `main.js`, `manifest.json`, and `styles.css` in your
`.obsidian/plugins/made-up-words/` folder with the assets attached to this
release, then reload the plugin. Your settings and dictionaries are preserved.
Requires Obsidian 1.7.2 or newer.
