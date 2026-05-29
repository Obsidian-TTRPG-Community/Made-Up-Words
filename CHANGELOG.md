# Changelog

All notable changes to the Made Up Words plugin are documented here.

This project is pre-1.0. Expect rough edges and occasional breaking changes to
settings or data formats. Where a change affects existing data, migration is
handled automatically on load.

## [0.15.0] — Initial public release

First public release. The plugin has been through several rounds of private
testing; this version collects that work and packages it for wider feedback.

### Core capabilities

- **Dictionary**: one markdown note per word, with frontmatter for definition,
  part of speech, IPA, etymology, and more. Indexed for fast lookup.
- **Multi-language support**: multiple languages can be active at once. Hover,
  lookup, and browsing query all active languages; a primary language is the
  target for translation and new entries.
- **Side panel** with three tabs: Selection (live translation of highlighted
  text), Translator (free-form lookup with gloss and transliterate modes), and
  Dictionary (browse, search, filter, sort).
- **Hover tooltips**: hover any word (holding Shift by default) to see its
  dictionary entry, inflected-form analysis, or multi-language matches.
- **Look up word command**: shows every candidate the dictionary knows for a
  selected word, across all active languages, with no auto-picking.
- **Cypher engine**: deterministic phonological substitution for generating
  placeholder words and names in your language's sound style. Clearly labelled
  as a placeholder generator, not a translator.
- **Inflection rules**: affix-based morphology that recognises inflected forms
  on hover and predicts paradigms. Six presets included.
- **Names registry**: proper nouns with categories, locked at creation.
- **Phrases and compounds**: multi-word entries with optional part
  decomposition.
- **Unicode-aware** throughout: accented characters, non-Latin scripts, and
  hyphenated compounds are handled correctly.

### Design philosophy

This is a dictionary-and-lookup tool, not an auto-translator. It does not
attempt to generate fluent translation, because real translation requires
grammar and context the dictionary does not encode. The gloss mode and
multi-sense lookup are designed to surface what the dictionary knows and let
you make the linguistic decisions yourself.

### Known limitations

- Inflection handles affixation only — no infixes, ablaut, or root templates.
- The cypher's reverse direction is approximate (substitutions can collide).
- Performance with very large dictionaries (several thousand entries) is
  untested.
- The "concept-as-note, languages-as-frontmatter" data model (one note per
  meaning, translations in frontmatter) is not natively supported; the plugin
  uses one note per conlang word.
