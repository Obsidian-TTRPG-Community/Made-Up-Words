# Made Up Words v0.20.0 — Hardcoded inflections & form tables

Every language has words that break the rules. Until now the inflection rules
were the only way to make a form recognisable, and rules are patterns — they
can't express "this one word is just irregular". Two new frontmatter properties
fix that.

## Added

### Hardcoded inflected forms (`forms:`)

Declare a word's forms directly on its entry:

```yaml
---
definition: to go
partOfSpeech: verb
forms:
  - "past: wendi"
  - "plural: gaanim, gaanum"
  - "participle: gegaan"
---
```

Declared forms are recognised everywhere a rule-derived form is — hovering
**wendi** reads *"wendi = past of gaan"*, it highlights in your notes, clicking
it opens the entry, and it shows up in lookup and in the word-by-word gloss.

Details worth knowing:

- Several forms can share a label (`"dative: kalim, kalum"`).
- Multi-word forms work; they're matched by the phrase matcher.
- A declared form **beats** whatever an inflection rule would derive — that's
  the point of hardcoding.
- Declaring a label **suppresses** the same-named rule for that entry only, so
  a hardcoded `past: went` no longer sits beside a predicted *goed*. Your other
  rules keep firing.
- A real headword still outranks another word's declared form, so you can't
  accidentally shadow an existing word.

### Declension and conjugation tables

Declared forms render as a **Declared forms** table in the side panel's word
details, and as a compact line in the hover tooltip (first eight, then
"+N more", so a full case paradigm can't swallow the page). New setting under
**Settings → Word matching → Show declared forms in hover tooltip** if you'd
rather keep tooltips minimal — the panel always shows them.

### Borrowing another part of speech's rules (`inflectAs:`)

If a word inflects like a different part of speech, say so instead of
duplicating every rule:

```yaml
---
definition: they
partOfSpeech: pronoun
inflectAs: noun
---
```

This entry now matches rules filtered to `noun` **as well as** rules filtered
to `pronoun` — it's additive, so any pronoun-specific rules you already wrote
keep working. Comma-separate or use a YAML list for more than one.

## Fixed

- **Hover tooltip shows the source language.** When more than one language is
  active, a normal single-word hover now displays the entry's language after
  the headword — previously only the multi-sense tooltip did. Single-language
  vaults are unchanged.

## Compatibility

Both new properties are optional. Vaults that don't use them behave exactly as
before — no migration, no settings changes.

## Installing / updating

Download `main.js`, `manifest.json`, and `styles.css` from this release and
copy them into `.obsidian/plugins/made-up-words/` in your vault, then reload
the plugin (or restart Obsidian). Settings and dictionaries are preserved.

---

Resolves [#10](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/10)
and [#15](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/15).
