# Made Up Words v0.22.0 — Export dictionary

You can now export your dictionaries and share them as word lists, whether with
players, co-writers, or other conlangers.

## Export dictionary

Run **Export dictionary** from the command palette, or click *Export…* in the
plugin settings. Choose which languages to include and a format:

- **Markdown**: an alphabetical word list grouped by letter, showing IPA,
  part of speech, declared forms, aliases, compound parts, etymology, and notes.
  It can also add an English → conlang index so readers can look words up the
  other way. The file opens in a new tab once it's written, so you can publish
  it, paste it, or print it to PDF.
- **CSV**: one row per entry, for Excel, Google Sheets, or LibreOffice.
  Excel shows IPA and diacritics correctly, and cells that a spreadsheet would
  treat as formulas are made safe.
- **JSON**: every field plus each language's inflection rules, for backups
  and scripts.

Options:

- **Include names**: turn this off to share your vocabulary without giving
  away the people and places in your setting.
- **Include note text**: adds the freeform text you wrote in each entry note.
- Any configured language can be exported, including languages that aren't
  currently active.

Exports are saved to `Made Up Words exports/` by default, named after the
language and the date. An earlier export is never overwritten, and your
entry notes are never changed. The export window remembers your choices for
next time.

Thanks to Anna for the request!
