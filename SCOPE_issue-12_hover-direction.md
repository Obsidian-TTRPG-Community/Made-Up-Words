# Scope: Hover translation direction toggles (issue #12)

**Request:** [b5scheuert, issue #12] — "In my experience, the hover to translate
feature is the most used one. But when a made up word looks like an english word,
sometimes the plugin confuses it for an actual english word. I propose a toggle in
the setting, so one can disable translating english into the conlang or vice versa."

## The bug underneath the feature request

The request is for a toggle, but there's a real inconsistency worth fixing first.

`highlight-core.ts` `computeClassifyWord` is explicit about precedence, and its
comment says so: *"Conlang direction wins over the English direction, mirroring the
hover-tooltip resolution order."* It checks `lookupAll` first and returns
immediately on a hit — the English direction is never consulted for a word that is
already a known conlang headword.

The hover tooltip does **not** mirror that, despite the comment claiming it does.
`main.ts` `handleHover` runs both directions and *merges* them:

```ts
const dictEntries = this.dictionary.lookupAll(cleaned);   // conlang direction
const englishHits = this.dictionary.lookupEnglish(cleaned); // English direction
const combined = [...dictEntries];
for (const e of englishHits) if (!combined.some(c => c.path === e.path)) combined.push(e);
```

So a word that is *both* a conlang headword and some other entry's English
definition produces a multi-sense tooltip mixing "here's what your word means" with
"here's how to say this English word in your conlang". That is precisely the
"confuses it for an actual english word" symptom — and it happens even though the
word was unambiguously recognised as conlang first.

There's a second contributor. When nothing matches at all, hover falls through to
the **cypher preview**, which is an English→conlang transformation applied to the
hovered text. Hovering a made-up word that isn't in the dictionary yet therefore
produces a confident-looking cyphered "translation" of a word that was never
English. `hoverFallback: "nothing"` already exists to suppress that, but it's an
unrelated setting most users won't connect to this problem.

## Design

### 1. Conlang wins on hover (behaviour fix)

If `lookupAll(cleaned)` returns anything, skip the English direction entirely.
Hover then matches the rule highlighting has always followed, and the comment in
`highlight-core.ts` stops being a lie.

**Kept:** cross-language sibling expansion. That step takes an already-matched
entry's *definition* and finds entries in other active languages sharing it, so
hovering `Traenslaetis` still surfaces `Translateees`. It's keyed off the
definition, never off the hovered text, so it can't reintroduce the confusion — and
it's cross-*conlang*, not English-direction.

**Kept:** multi-sense tooltips for homographs (#11). Several conlang entries sharing
a spelling still all appear; only the cross-direction merge goes away.

### 2. `hoverConlang` / `hoverEnglish` settings

Two booleans, both defaulting to `true`, named and shaped to mirror the existing
`highlightConlang` / `highlightEnglish` pair so the two feature areas read the same
way. Under **Settings → Hover tooltips**.

What each gates:

| Setting | Governs |
|---|---|
| `hoverConlang` | Phrase matching, conlang headword lookup, declared `forms:`, rule-based inflection matching |
| `hoverEnglish` | English-definition lookup **and the cypher preview fallback** |

The cypher fallback belongs to the English direction because that's literally what
it computes: `applyCypher(hoveredWord, sheets)` treats the hovered text as English
and transforms it into conlang shape. Leaving it ungated would mean a user who
turned the English direction off still got English→conlang output — the exact thing
they switched off.

### 3. Fast-path short-circuit

`updateHoverActive()` currently caches `some(lang => lang.hoverEnabled)` so the
mousemove handler is a single boolean check. It gains
`&& (hoverConlang || hoverEnglish)`: with both directions off there is nothing hover
could possibly show, so the handler exits before doing any caret-resolution work
(which forces a layout flush on every throttled mousemove).

## Why not the alternatives

**A single "direction" dropdown** (both / conlang→English / English→conlang) reads
closer to the issue's wording, but it diverges from the two-toggle shape the
highlight settings already use, and it can't express "neither" — which is a
legitimate state once the toggles also gate the cypher fallback.

**Per-language toggles** next to the existing `hoverEnabled` would be more granular,
but the ambiguity being reported is a property of the vault's content, not of one
language, and it would add two controls per language card.

**Smarter disambiguation** — e.g. scoring which direction is more likely — was
considered and rejected. There's no signal to score with: a word either is or isn't
a headword, and the plugin can't know which reading the user meant. Precedence plus
an explicit switch is honest; a heuristic would be a guess presented as certainty.

## Edge cases

| Case | Behaviour |
|---|---|
| Both toggles off | Hover does nothing at all, including no cypher preview; mousemove short-circuits |
| `hoverConlang` off, word is a conlang headword | No tooltip from the conlang side; the English direction may still match it |
| Word is a headword AND an English definition | Conlang wins; English hits suppressed (the fix) |
| Homographs (#11) | Unchanged — all senses still shown |
| Declared forms (#10) / inflections | Conlang direction, gated by `hoverConlang` |
| Multi-word phrases | Conlang direction, gated by `hoverConlang` |
| Per-language `hoverEnabled: false` | Unchanged, still wins over both new toggles |
| Existing vaults | Both default `true`; the only behaviour change is the precedence fix |

## Out of scope

- The side panel, lookup modal, and gloss keep querying both directions. Those are
  tools the user invokes deliberately with a specific question; the hover tooltip is
  the only surface that fires unbidden, which is what makes wrong results costly
  there and merely noisy elsewhere.
- No change to `hoverFallback`, which stays an independent control over what happens
  when nothing matches.
