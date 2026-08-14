# Scope: Hover tooltip works inconsistently for translation (issue #13)

**Reporter:** CymanCysh, 2026-07-21, against 0.19.0 (0.20.x and 0.21.0 both shipped
after the report).

> **Expected:** "The hover tooltip should show the translation as well as other
> matches, as can be seen in picture 1."
>
> **Current:** "Hover tooltip works like it did several updates before for all but
> one entry, and reinstalling Made Up Words and rescanning the dictionary folders
> does not change anything. I even deleted one of the entries and wrote it from
> scratch, to no avail."
>
> **Repro:** "I don't know what to tell you, it's very inconsistent."

## What the screenshots actually show

Both attachments are 400px-wide PNGs; read at full resolution they are more
informative than the prose.

**Picture 1 — working.** Hovering `Señor`:

```
Señor — 2 matches across 2 languages
Señor   [CAHO]     noun  Herr (Respektform)
Nameer  [SHIRAMI]  noun  Herr (Respektform)
```

That is `showMultiSenseTooltip`. Two entries, two languages, reached because both
share the definition string `Herr (Respektform)` — the cross-language sibling
expansion in `handleHover`.

**Picture 2 — broken.** Hovering `Raban`:

```
Raban  noun
Graf
```

That is `showDictionaryTooltip` with a single entry. **And there is no language
chip** — no `[CAHO]`, no `[SHIRAMI]`. This is the diagnostic detail the report
doesn't mention and it is worth more than the rest of the issue combined.

## The decisive inference

`showDictionaryTooltip` renders the chip through `Dictionary.renderTooltip(entry,
el, showLanguage, …)`, and passes:

```ts
this.getActiveLanguages().length > 1
```

`renderTooltip` then emits the chip `if (showLanguage && entry.language)`.

`entry.language` is effectively always populated after a load — `loadFromFolders`
backfills it from the source folder's language name:

```ts
if (!entry.language && source.language) entry.language = source.language;
```

So a missing chip means **`getActiveLanguages().length <= 1`**: at the moment
picture 2 was taken, only one language was active.

That single fact explains every symptom at once. With one active language the
dictionary only ever loads one folder, so cross-language sibling expansion has
nothing to expand into, `combined.length === 1`, and every paired word collapses
to the plain single-entry tooltip — i.e. exactly "works like it did several
updates before", the pre-cross-language behaviour. Rescanning the folders finds
the same one folder. Reinstalling the plugin doesn't help because `data.json`
survives an uninstall. Rewriting an entry doesn't help because the entry was never
the problem.

**Caveat, stated plainly:** this holds only if both screenshots come from the same
plugin state. Picture 1 is filed under *Expected Behavior*, so it may be a "here's
how it used to look" capture from an earlier session. Confirming that is the first
question for the reporter (see below). The reporter's "for all but one entry" is
also ambiguous — it could mean one entry is broken, or one entry still works — and
under this hypothesis only the second reading is coherent.

## Root cause: renaming a language silently deactivates it

`settings.ts`, the per-language Name field:

```ts
new Setting(body).setName("Name").addText((t) =>
  t.setValue(lang.name).onChange(async (v) => {
    lang.name = v;                     // mutated in place
    await this.plugin.saveSettings();  // persisted immediately
  })
);
```

`lang.name` is the primary key for a language everywhere else in the plugin, and
this handler changes it without updating a single reference:

| Reference | Holds | Updated on rename? |
|---|---|---|
| `settings.activeLanguages` | array of language **names** | no |
| `settings.primaryLanguage` | a language **name** | no |
| entry frontmatter `language:` | a language **name**, in the vault | no |
| `openCards` / `openSheets` / `openInflections` | names, UI state | no |

Then `migrateSettings()`, which runs on every single load, quietly reconciles the
mess in the wrong direction:

```ts
const known = new Set(this.settings.languages.map((l) => l.name));  // new name
this.settings.activeLanguages =
  this.settings.activeLanguages.filter((n) => known.has(n));        // old name dropped
if (this.settings.activeLanguages.length === 0 && this.settings.languages.length > 0) {
  this.settings.activeLanguages = [this.settings.languages[0].name];
}
```

The renamed language's active flag is discarded. `saveSettings()` then writes the
pruned list back, so the loss is permanent and survives reinstalling.

Two aggravating details:

1. **It fires per keystroke.** `onChange` on an Obsidian text field runs on every
   input event. Editing "Shirami" to "Shirami (old)" walks `lang.name` through a
   dozen intermediate values, each saved.
2. **Existing notes are orphaned too.** `loadFromFolders` drops any entry whose
   frontmatter disagrees with its folder's language:

   ```ts
   if (source.language && entry.language && entry.language !== source.language) continue;
   ```

   Every note already carrying `language: <old name>` stops loading. Silently — the
   rescan notice reports a count, and a smaller count looks like a successful scan.

`removeLanguage()` does this correctly — it rewrites `activeLanguages`,
`primaryLanguage`, and the UI-state sets. The rename path is an oversight, not a
deliberate asymmetry.

## Secondary findings

These are real and worth fixing, but each explains fewer of the reported symptoms
than the rename path. Listed in descending order of how well they fit.

### 1. Silent skips in `loadFromFolders`

```ts
const folder = this.app.vault.getAbstractFileByPath(source.folder);
if (!folder || !(folder instanceof TFolder)) continue;
```

A language whose dictionary folder was renamed or moved in the vault contributes
zero entries, with no notice, no console warning, and no indication in settings.
The language card's entry count would read `0 entries`, which is the only visible
tell and is easy to miss inside a collapsed card.

**Doesn't fit alone:** `getActiveLanguages().length` would still be 2, so the
language chip would still render. Rule it out by checking the chip.

### 2. `readEntry` drops entries whose `definition` isn't a plain scalar

```ts
const asString = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;              // arrays and objects
};
const definition = asString(fm.definition ?? fm.translation ?? fm.meaning);
if (!definition || !definition.trim()) return null;   // entry vanishes
```

Obsidian's Properties editor creates **list**-typed properties readily, and the
property type is remembered per property name across the vault. A `definition`
that became a list makes `asString` return `undefined` and the entry disappears
from the index entirely — no error, no log line. `dictionary.ts` already
acknowledges this hazard for `inflectAs` ("Obsidian's property editor creates
list-type properties by default") and uses `parseStringList` there; `definition`
never got the same treatment.

This one fits "deleted the entry and wrote it from scratch, to no avail" nicely:
recreating it through the same Properties UI reproduces the same list type.

**Doesn't fit alone:** doesn't explain the missing chip.

### 3. Cross-language sibling matching is exact-string

```ts
for (const sense of e.definition.split(/[,;]/)) {
  const key = sense.trim().toLowerCase();
  for (const sib of this.dictionary.lookupEnglish(key)) { … }
}
```

Two entries link only when a whole comma/semicolon-delimited sense matches
character for character after trim and lowercase. `Herr (Respektform)` ==
`Herr (Respektform)` links; `Graf` vs `Graf (Adelstitel)` or `der Graf` does not.
For a user glossing into German prose this is a thin thread, and the failure is
invisible — the tooltip looks like a correct single-match result.

**Doesn't fit alone:** doesn't explain the missing chip, and doesn't explain a
reinstall/rescan failing to change anything (it never would).

## The systemic problem

Every failure mode above is **silent**. There is no surface anywhere in the plugin
that answers "why didn't this word resolve the way I expected?" A user gets a
tooltip that looks perfectly well-formed and has no way to distinguish "there is
genuinely only one match" from "the other language is deactivated" or "that note
was skipped at load".

That is why the report reads as "very inconsistent" and why the reporter spent
their effort on the one thing that was fine (the entry) rather than on
configuration. Fixing only the rename bug leaves the next instance of this equally
undiagnosable.

## Proposed fixes

### A. Rename must carry references (the bug)

Replace the in-place `lang.name = v` with a rename that rewrites every reference,
and debounce it to the field's blur/Enter rather than running per keystroke:

- map `activeLanguages` and `primaryLanguage` old → new
- re-key `openCards` / `openSheets` / `openInflections`
- reject a rename that collides with an existing language name, or an empty name
- offer to rewrite `language:` frontmatter across the old language's dictionary
  folder — with an explicit count and confirmation, since it's a bulk vault edit

Alternative worth weighing: give `LanguageConfig` a stable opaque `id` and key
`activeLanguages` / `primaryLanguage` off that, leaving `name` a pure display
label. Cleaner long-term and it makes renames free, but it needs a settings
migration and it doesn't help the frontmatter `language:` values, which are
user-visible text and have to stay names. Recommend A now; consider the id later.

### B. Stop losing entries silently

- `definition` accepts a list, joined with `", "` — matching how `parseStringList`
  already handles `aliases`, `parts`, and `inflectAs`
- `loadFromFolders` collects skip reasons (folder missing, no definition, language
  mismatch) and surfaces the count

### C. Make resolution inspectable

Minimum viable version: a `Made Up Words: Diagnose dictionary` command that reports
active languages, per-language folder path + resolved entry count, and the list of
notes skipped at load with the reason. That one command would have let the reporter
answer this themselves in under a minute, and it's the cheapest thing here to build.

### D. Loosen the sibling bridge — deliberately, not by default

Not a blind substring match; that would link `Graf` to `Grafschaft` and to every
gloss containing the word. A parenthetical-stripping normalisation
(`Graf (Adelstitel)` → also index `graf`) is narrow enough to be safe and covers
the observed German-gloss style. Worth its own issue rather than bundling here.

## Edge cases

| Case | Behaviour |
|---|---|
| Rename to a name already in use | Reject; today it silently merges two languages under one key |
| Rename to empty string | Reject; today `entry.language` backfill stops working and chips disappear |
| Rename while the language is primary | `primaryLanguage` follows the rename |
| Rename with entries already on disk | Prompt to rewrite frontmatter; skipping leaves them orphaned, so say so |
| Only one language configured | No chips ever, correctly — `getActiveLanguages().length > 1` is false |
| `definition` as a one-item list | Loads as that single string |
| `definition` as an empty list | Still dropped, but now reported as a skip |

## Questions for the reporter

Ordered so the first answer probably ends the investigation.

1. Settings → Languages: how many languages have the **Active** checkbox ticked
   right now? (Hypothesis says one; picture 1 needs two.)
2. Was picture 1 taken in the same session as picture 2, or is it an older capture
   of how it used to look?
3. Have you renamed a language — or edited the Name field at all — since the
   version where this last worked?
4. Does the Shirami counterpart for `Graf` still appear in the side panel's word
   list?
5. Both notes' full frontmatter, `Raban` and its counterpart — verbatim, including
   whether `definition` renders as a list in the Properties editor.

## Out of scope

- The `handleHover` resolution order (#12, 0.21.0) is not implicated. Both
  screenshots are consistent with it; the failure is upstream, in what got loaded.
- No change to `hoverConlang` / `hoverEnglish`. A disabled direction can't produce
  picture 2 — `hoverConlang: false` would have suppressed the `Raban` headword
  match entirely rather than rendering it without siblings.
- Sibling-bridge normalisation (D) is deferred to its own issue.
