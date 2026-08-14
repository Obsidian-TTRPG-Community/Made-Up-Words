# Made Up Words v0.21.1 — Community review fixes

A maintenance release. Nothing about the plugin behaves differently; this
clears the four errors the Obsidian community-plugin automated review raised
against 0.21.0 so the listing can pass its checks.

## What the review flagged

**The committed lockfile was out of date**, which failed both the dependency
check and the build verification. It has been regenerated. While fixing it,
`@codemirror/state` and `@codemirror/view` were pinned to the exact versions
Obsidian 1.13.0 declares as peer dependencies (`6.5.0` and `6.38.6`) — the
previous version ranges asked for releases *above* those pins, so a clean
`npm install` only succeeded by overriding peer dependencies. A clean install
is now warning-free.

**Two lint rules were being suppressed inline.** Version 0.4 of
`eslint-plugin-obsidianmd` no longer permits `eslint-disable` comments for
`obsidianmd/*` or `@typescript-eslint/no-deprecated` rules, and requires a
written justification on any directive comment that remains. All thirteen
directive comments are gone — none of them were annotated to keep them:

- The caret-position fallback used for Obsidian builds older than 1.13.0 now
  reaches `caretRangeFromPoint` through a locally declared type, so the call no
  longer resolves to the deprecated `Document` member. The fallback behaviour is
  unchanged, and support back to `minAppVersion` 1.7.2 is unchanged.
- The **Remove language** button now calls `setDestructive()` on Obsidian
  versions that have it and `setWarning()` on versions that do not, rather than
  always calling the deprecated `setWarning()`.
- The rest were for the sentence-case rule on strings it reads incorrectly: the
  `e.g. …` placeholders in the word, name and entry modals, and the `+ Word`,
  `+ Name` and `↑↓ Swap direction` buttons, where the rule counts a leading
  glyph as the first word. **The wording of those labels has not changed.** The
  rule now runs at its own default severity, so it reports them as warnings
  instead of being silenced.

## Also in this release

- Releases now publish **GitHub artifact attestations** for `main.js` and
  `styles.css`, so anyone can cryptographically verify that the files attached
  to a release were built from this repository. This was a recommendation rather
  than an error, but it is worth having.
- The release workflow installs with `npm ci`, so a stale lockfile fails the
  build in future instead of passing quietly.

## Installing / updating

Download `main.js`, `manifest.json`, and `styles.css` from this release and copy
them into `.obsidian/plugins/made-up-words/` in your vault, then reload the
plugin (or restart Obsidian). Settings and dictionaries are preserved.
