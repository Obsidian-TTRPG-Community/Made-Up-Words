# Made Up Words v0.19.0 — Homograph (multi-sense) entries

A focused release resolving #11: words with several unrelated meanings
(homographs) can now be created and managed properly.

## Added

- **Homograph (multi-sense) entry creation.** If a made-up word means both
  "to walk" and "guitar", you can now store each sense as its own entry. Two
  files can't share a name, so each sense lives in its own file (e.g.
  `kala (verb).md`, `kala (noun).md`) that declares the shared spelling via the
  `word:` frontmatter override. All add-word paths — the add-a-word modal,
  create-from-selection, batch creation, and add-a-name — detect when a word
  already exists with a *different* meaning and create a new
  `word (partOfSpeech).md` sense file automatically, instead of silently
  opening the existing entry. Re-adding an existing meaning still just opens
  the existing entry. Hovering a homograph shows every sense in one tooltip.
  (#11)

## Changed

- **README:** the `word:` frontmatter override is now documented as the recipe
  for multi-sense entries, with a worked example. It was previously described
  as phrase-only, leaving no documented way to create two entries with the same
  spelling. (#11)

## Installing / updating

Download `main.js`, `manifest.json`, and `styles.css` from this release and
copy them into `.obsidian/plugins/made-up-words/` in your vault, then reload
the plugin (or restart Obsidian). Settings and dictionaries are preserved.
