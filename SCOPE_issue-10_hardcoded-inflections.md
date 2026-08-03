# Scope: Hardcoded inflections & form tables (issues #10, #15)

**Requests:**

- [b5scheuert, issue #10] — "I really love the inflection rules feature, with some hours
  of work (and a whopping 184 inflection rules) I actually managed to get all my words to
  be recognized. There are however exceptions, as in any language, and I think it would be
  cool to be able to hardcode inflections for any word." Motivating case: pronouns tagged
  `pronoun` that inflect exactly like nouns, so the noun rules don't fire on them. Also
  cites irregular verbs.
- [Mekelaina, issue #15] — declension/conjugation tables pasted into a definition file
  don't show in hover previews, and declined nouns aren't recognised as variants of their
  base form. Asks for "a property where you could put in a markdown chart or a key value
  list".

These are the same underlying gap seen from two directions: **there is no way to state, on
an entry, that this specific surface form is this specific inflection of this word.**
Rules are the only route, and rules are pattern-based and global.

## Two distinct sub-problems in #10

The issue reads as one request but contains two, with quite different fixes:

| Sub-problem | Example | Rule-based fix today | Cost |
|---|---|---|---|
| **(a) Right forms, wrong POS gate** | Pronouns inflect exactly like nouns, but are tagged `pronoun`, and the noun rules have `pos: noun` | Duplicate every noun rule with `pos: noun,pronoun`, or drop the POS filter | With 184 rules this is the whole problem — combinatorial and unmaintainable |
| **(b) Genuinely irregular forms** | `go` → `went`; a pronoun with a suppletive oblique form | Write a bespoke rule per irregular, which then also fires on every unrelated word ending in the same letters | False positives; unbounded rule count |

(a) does **not** need hardcoding at all — it needs the POS gate to be told "treat this
entry as a noun for rule purposes". (b) genuinely needs per-entry form declaration.
Shipping only one leaves half the issue open, so this scope covers both.

## Where the relevant code is (verified)

| Concern | Location |
|---|---|
| Frontmatter → `DictionaryEntry` | `dictionary.ts` `readEntry` |
| Lookup indexes (`byWord`, `byEnglish`, phrase index, alias registration) | `dictionary.ts` `addEntry` |
| Reverse matching (inflected form → lemma) | `inflection.ts` `findInflection`, gated by `posMatches` |
| Forward generation (lemma → predicted forms) | `inflection.ts` `generateInflections`, same `posMatches` gate |
| Hover resolution order | `main.ts` `onMouseMove` → `showEntryTooltip` / `showInflectionTooltip` (~L1359–1410) |
| Multi-match lookup modal | `main.ts` ~L906–970, `lookup-modal.ts` |
| Highlight classification | `highlight-core.ts` `computeClassifyWord`, `resolveEntryPath` |
| Panel "Predicted forms" | `panel.ts` `renderWordDetails` (~L618–680) |
| Tooltip rendering | `dictionary.ts` `Dictionary.renderTooltip` |

Two existing mechanisms are close relatives and set the precedent:

- **`aliases:`** already maps alternate surface forms onto an entry (`addEntry` registers
  each alias in `byWord`, and multi-word aliases into the phrase index). Hardcoded forms
  are aliases *with a label*.
- **`parts:`** already demonstrates a list-valued frontmatter property parsed via
  `parseStringList` and rendered as its own panel section.

So the shape of the change is well-trodden; the new part is carrying a label alongside the
form.

## Why not just use `aliases:`

Tempting — `aliases: kalath, kalen` would make both forms resolve. But:

- The tooltip would present `kalath` as *another spelling of the same word*, not as its
  plural. The user loses the grammatical information, which is the point of the request.
- #15 explicitly wants the forms displayed as a table. An unlabelled alias list can't be
  rendered as a declension table.
- `generateInflections` couldn't know that a declared plural should suppress the
  rule-predicted plural, so the panel would show both `kalath` (declared) and whatever the
  rule invents, with no way to tell which is right.

Labels are what make this feature more than a synonym list.

## Design

### 1. `inflectAs:` — POS override for rule matching

```yaml
partOfSpeech: pronoun
inflectAs: noun
```

`posMatches` currently compares a rule's `pos` filter against `entry.partOfSpeech` alone.
It gains a second candidate: the entry's `inflectAs` (itself comma-separable). A rule
matches if its filter accepts **either** the real POS or any `inflectAs` value.

Additive, not replacing — a pronoun with `inflectAs: noun` still matches `pos: pronoun`
rules. This matters because b5scheuert will have some pronoun-only rules alongside the
shared noun ones, and a replacing semantic would silently break those.

Applies symmetrically to `findInflection` (recognition) and `generateInflections` (the
panel's predicted forms), because a POS override that only worked in one direction would
be a bug factory.

**Cost:** one field, one helper, ~15 lines. Solves #10's motivating example outright.

### 2. `forms:` — declared inflected forms

```yaml
forms:
  - "plural: kalath"
  - "genitive: kalen"
  - "dative: kalim, kalum"
```

Chosen shape is a **YAML list of `label: form` strings**, because Obsidian's Properties
editor renders a list-of-text natively but shows nested objects as an unsupported type.
The parser is permissive and also accepts:

- a YAML map — `forms: {plural: kalath}`
- a list of single-key maps — `- plural: kalath`
- one comma-separated string — `forms: "plural: kalath, genitive: kalen"`

Parsing rules:

- Split on commas, then on the **first** colon. A comma-separated piece with no colon
  inherits the previous label, so `dative: kalim, kalum` yields two dative forms.
- A leading piece with no colon at all gets the label `variant`, so a bare list still
  works and degrades to alias-like behaviour with honest labelling.
- Blank labels/forms are dropped. Whitespace trimmed.

Indexing: a **new `byForm` map** in `Dictionary`, keyed with the same `norm()` used by
`byWord` so case-sensitive mode is respected. Deliberately *not* merged into `byWord` —
a declared form is not a headword, and merging would make hover render it as the entry
itself and lose the "plural of" framing.

Multi-word forms are additionally registered in the phrase index (mirroring how multi-word
aliases are handled), carrying the label so the phrase tooltip can still say what it is.

### 3. Resolution order

```
1. byWord        headword or alias      → entry tooltip
2. byForm        declared form          → "kalath = plural of kala"   ← new
3. findInflection rule-derived form     → "kalath = plural of kala"
4. English direction / cypher fallback
```

Declared beats derived. This is the whole point of "hardcode": an irregular must win over
whatever a rule would have guessed. A declared form that collides with a real headword
loses to the headword — an actual word in the language outranks another word's form.

### 4. Suppressing regular forms for irregular entries

`generateInflections` skips any rule whose `label` matches a declared form's label on that
entry (case-insensitive). Without this the panel would show `go → goed` right next to the
declared `went`, which is worse than not having the feature. Declaring one label doesn't
suppress the others — declaring a plural leaves the genitive rule free to fire.

### 5. Display (this is where #15 is satisfied)

- **Panel** (`renderWordDetails`): a new **"Declared forms"** section above "Predicted
  forms", grouped by label, styled like the existing forms list. Requires restructuring
  the current early-return: today, zero predicted forms returns early with a "no rules
  apply" message, which would swallow the declared table.
- **Hover tooltip** (`Dictionary.renderTooltip`): a compact `plural kalath · genitive
  kalen` line, capped (first 8, then `+N more`) so a full declension table doesn't produce
  a tooltip the size of the screen. Gated by a new setting, **Show declared forms in hover
  tooltip**, default on.
- **Highlighting**: `computeClassifyWord` and `resolveEntryPath` gain a `byForm` check, so
  declared forms highlight and become clickable exactly like rule-derived ones.

### What #15 asked for but this does not do

#15 asked for a *markdown table in the note body* to appear in hover. Rendering arbitrary
body markdown into a tooltip is a different and much larger job (markdown rendering,
sizing, sanitisation) and would still not make the plugin *recognise* the declined forms —
which is the half of #15 that actually matters. The `forms:` property gives recognition
plus a rendered table from structured data. Users keep their prose table in the body if
they want it; the property is what the plugin reads.

## Edge cases and decisions

| Case | Behaviour |
|---|---|
| Declared form equals its own headword | Ignored (no self-reference in `byForm`) |
| Declared form equals another entry's headword | Headword wins on lookup; both remain listed in their own entries |
| Same form declared by two entries | Both indexed; hover shows the multi-match path, as with homographs |
| Case-sensitive mode on | `byForm` keys use `norm()`, so behaviour matches headwords |
| Label with no form (`"plural:"`) | Dropped at parse time |
| `inflectAs` naming a POS no rule uses | No-op, no error |
| Very large `forms:` list | Panel renders all; tooltip caps at 8 |
| Existing vaults | Both properties are optional and absent-by-default — no migration, no behaviour change for anyone not using them |

## Out of scope for this change

- Adding `forms:`/`inflectAs:` fields to the entry-creation modals. They're frontmatter-only
  for now; the modals already produce a lot of fields and this needs real-world use first.
- Auto-deriving `forms:` from an existing markdown table in the body.
- Per-form definitions (a form meaning something different from its lemma). That's
  homograph territory, already covered by #11.
