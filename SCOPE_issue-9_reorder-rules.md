# Scope: Reorder inflection rules & cypher sheets (issue #9)

**Request:** [b5scheuert, issue #9] — drag existing inflection rules to reorder them
instead of deleting and re-creating in order. Since rules are tried in order, order
matters. Also asks whether cypher sheets can be reordered.

## What order actually affects (verified in code)

There are three ordered lists in a language config. Order does **not** matter equally
for all of them:

| List | Stored as | Does order change behaviour? | Where |
|------|-----------|------------------------------|-------|
| Inflection rules | `LanguageConfig.inflections[]` | **Yes** — first matching rule wins | `inflection.ts` `findInflection` loops in array order and returns on first hit |
| Cypher sheets | `LanguageConfig.sheets[]` | **Yes** — sheets run top-to-bottom, each sheet's output feeds the next | `cypher.ts` `applyCypher` |
| Rules *within* a cypher sheet | `CypherSheet.rules[]` | **No** — output is unaffected by array order | `cypher.ts` `indexSheet` / `findBestMatch` match by input-length then type-priority, not position |

So the two lists that are worth making reorderable are **inflection rules** and
**cypher sheets** — exactly what the issue asks about. Reordering rules *within* a
sheet would be purely cosmetic (organising related rules visually); worth doing only
if it's cheap and consistent, and it should not be sold as changing results.

## Where the UI lives

All of this is in `settings.ts` (`ConlangSettingTab`):

- `renderInflectionTable` / `renderInflectionRow` — inflection rules render as `<tr>`
  rows in a `<table class="conlang-rules-table">`. Each row currently has text inputs,
  a position `<select>`, an enabled checkbox, and a `×` delete button.
- `renderSheet` — each cypher sheet renders as a `<div class="conlang-sheet">` block
  (name, enable toggle, trash button, its rule table, and an "Add rule" button).
  Sheets are rendered in a loop over `lang.sheets`.
- Most edits already trigger a full `this.display()` re-render, and expand/collapse
  state is preserved via `openCards` / `openSheets` / `openInflections` sets. A
  reorder that mutates the array + saves + calls `display()` fits this model cleanly.

## Constraint that shapes the approach: mobile

`manifest.json` has `isDesktopOnly: false`, so the plugin runs on Obsidian mobile.
**HTML5 native drag-and-drop does not work on touch devices.** A drag-only solution
would leave mobile users unable to reorder. This is the single biggest design driver.

## Options

**Option A — Up/down arrow buttons (recommended baseline).**
Add two small buttons (▲ ▼) per inflection row and per cypher sheet. On click, swap
with the neighbour in the array, save, re-render. Ends of the list disable the
relevant arrow.
- Pros: works on desktop *and* mobile; accessible (real buttons, keyboard/focus);
  trivial, low-risk code; matches existing add/delete/toggle button idiom already in
  the rows.
- Cons: not the literal "grab and drag" the issue describes; multi-step for moving a
  rule far.

**Option B — Native HTML5 drag-and-drop.**
Make rows `draggable`, add a grip handle cell (⠿), handle `dragstart` (record index),
`dragover` (preventDefault + above/below-midpoint drop indicator), `drop` (splice-move
+ save + re-render).
- Pros: exactly what was requested; fast for large reorders on desktop.
- Cons: doesn't work on mobile; more code and edge cases (dragging a row that contains
  focused text inputs, drop-position math for table rows, drop indicators). Needs the
  button fallback anyway for mobile/accessibility.

**Option C — Both: drag handle on desktop + up/down buttons everywhere (recommended full solution).**
Ship Option A first (covers everyone), then layer Option B's drag handle as a desktop
enhancement sharing the same `moveItem` logic. Buttons remain the accessible/mobile path.

## Recommendation

Do **Option A now** for both inflection rules and cypher sheets — it fully resolves the
issue's core need, works on every platform, and is a small, safe change. Treat drag
(Option B) as a follow-up enhancement if there's appetite. Skip reordering rules
*within* a sheet unless we explicitly want cosmetic grouping (and label it as such).

## Implementation sketch (Option A)

1. **Shared helper** in `settings.ts`:
   ```ts
   private moveItem<T>(arr: T[], from: number, to: number): void {
     if (to < 0 || to >= arr.length) return;
     const [item] = arr.splice(from, 1);
     arr.splice(to, 0, item);
   }
   ```
2. **Inflection rows** (`renderInflectionRow`): before the delete cell, add a cell with
   ▲ / ▼ buttons. `onClick` → `moveItem(rules, ruleIndex, ruleIndex ∓ 1)` →
   `saveSettings()` → `display()`. Disable ▲ on first row, ▼ on last.
3. **Cypher sheets** (`renderSheet`): add ▲ / ▼ buttons to the sheet's header `Setting`
   (alongside enable toggle + trash), operating on `lang.sheets` / `sheetIndex`.
4. **CSS** (`styles.css`): a `.conlang-reorder-btn` style (compact icon button, muted
   colour, `:disabled` dimmed). Reuse existing icon-button conventions.
5. **Copy tweak:** the cypher-sheets help text can note that sheet order matters
   (already implied) and that within-sheet rule order does not.

### If we also do drag (Option B) later
- Add a grip cell; set `tr.draggable = true`.
- `dragstart`: stash `ruleIndex` (e.g. on a class field, not `dataTransfer` alone, to
  avoid mobile/serialization quirks) and add `.conlang-row-dragging`.
- `dragover`: `preventDefault()`, compute target index from pointer vs row midpoint,
  toggle a `.conlang-drop-before/after` indicator class.
- `drop`: `moveItem` → save → `display()`.
- Guard against starting a drag from inside a focused `<input>` (only start from the
  grip handle).

## Verification plan

- `npm run build` (esbuild) and `npm run lint` (eslint) must pass — repo convention is
  local build+lint before any release.
- Manual test in a vault: reorder inflection rules, confirm match priority changes
  (e.g. two rules that both match a word — the one moved to top wins in the panel).
- Reorder cypher sheets, confirm translation output changes accordingly.
- Confirm expand/collapse state survives the reorder re-render.
- Check Obsidian submission requirements: no `innerHTML`, use `createEl`/`classList`
  (current code already complies; keep it that way).

## Rough effort

- Option A only: small — ~1 focused edit to `settings.ts` + a few CSS lines.
- Option C (A + drag): moderate — add the drag handlers and drop-indicator CSS.
