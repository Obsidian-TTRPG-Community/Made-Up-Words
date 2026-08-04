# Made Up Words v0.21.0 — Hover direction control

Hover is the feature people use most, and it had a bias problem: it would
sometimes read one of your made-up words as an English word and offer to
translate it *into* your conlang.

## Fixed

**Your conlang now wins over English.** Hover used to check both directions and
merge whatever it found, so a word that was both one of your headwords *and*
some other entry's English definition produced a tooltip mixing "here's what
your word means" with "here's how to say this English word". Hover now resolves
the conlang side first — headword, then hardcoded declared form, then
rule-derived inflected form — and if any of those match, the English direction
is never consulted.

This is the order highlighting has always used. Hover simply never matched it,
which is why a word could highlight as conlang and then hover as English.

Also fixed: an entry whose definition repeated its own headword or alias (common
for loanwords, and for proper nouns entered with the same conlang form and
referent) could pull the English readings back in through the cross-language
lookup.

## Added

**Two hover direction toggles**, under *Settings → Hover tooltips*:

- **Show your words' meanings** — the conlang direction: headwords, phrases,
  declared forms, and inflected forms.
- **Show English to conlang translations** — the English direction. Turn this
  off if your made-up words are still being read as English. It also switches
  off the cypher preview, because that transformation treats hovered text as
  English in exactly the same way; leaving it on would keep producing the output
  you just turned off.

Both default to on, so nothing changes for existing vaults unless you touch
them. Turning both off makes hover inert entirely.

These mirror the *Highlight conlang words* / *Highlight translatable English
words* settings, so the two features are now configured the same way.

## Installing / updating

Download `main.js`, `manifest.json`, and `styles.css` from this release and
copy them into `.obsidian/plugins/made-up-words/` in your vault, then reload
the plugin (or restart Obsidian). Settings and dictionaries are preserved.

---

Resolves [#12](https://github.com/Obsidian-TTRPG-Community/Made-Up-Words/issues/12).
