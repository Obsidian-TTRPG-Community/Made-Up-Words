# Made Up Words v0.16.0 — Highlight known words

This release adds **known-word highlighting**, makes hover tooltips lighter on
the CPU, and gives the settings tab a thorough layout refresh.

## Added

- **Known-word highlighting.** Words and phrases the plugin recognises are now
  visually marked directly in your notes, in both the editor (Live Preview /
  Source) and Reading view. Two directions are supported:
  - **Conlang words** — anything that exists as a dictionary entry in an active
    language, including inflected forms and multi-word phrases.
  - **Translatable English words** — English terms the dictionary can translate
    (e.g. "cat" is marked when you have a word meaning cat).
- **Three highlight styles** (Settings → Made Up Words → Highlighting): a subtle
  dotted underline + accent colour (default), italics, or a background highlight.
  Each direction can be toggled independently, with a master on/off switch.
- **Command: "Toggle known-word highlighting"** — turn highlighting on/off from
  the command palette (handy on slower machines or for distraction-free reading).
- Highlight appearance is fully themeable via the `.conlang-known-word`
  (`.is-conlang` / `.is-english` / `.is-phrase`) CSS classes, with colours
  exposed as custom properties.

## Changed

- **Settings tab redesigned.** Global options are grouped into clear sections
  (Languages, Hover tooltips, Highlighting, Translation). Each language is now a
  collapsible card — with its cypher sheets and inflection rules as nested
  collapsibles — so the page stays manageable with many languages. A top
  overview lists every language with quick Active checkboxes and a Primary star,
  and active cards show a live entry count.
- **Hover tooltips are throttled.** Resolving the word under the cursor uses
  `caretRangeFromPoint` (a layout flush) that previously ran on every mouse
  move; it now runs at most once per 50 ms, and exits early when no active
  language has hover enabled. Noticeably less CPU while moving the mouse.

## Fixed

- Highlighting and the dictionary now refresh **live** when entries are added,
  edited, deleted, or renamed in **any** active language's folder (previously
  only the primary language's folder was watched, so changes elsewhere needed a
  manual reload or plugin restart).
- The per-language **"Reload dictionary"** button (it checked a legacy field and
  rarely fired) and language removal (now keeps the active/primary selection
  valid).

## Install

If you're already on a previous version, overwrite `main.js`, `manifest.json`,
and `styles.css` in your `.obsidian/plugins/made-up-words/` folder with the
assets attached to this release, then reload the plugin. Your settings and
dictionary are preserved. Fresh installs: see the [README](README.md).
