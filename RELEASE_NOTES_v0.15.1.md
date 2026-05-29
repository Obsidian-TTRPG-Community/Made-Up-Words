# Made Up Words v0.15.1 — Plugin review fixes

A small patch release addressing warnings flagged by the Obsidian
community plugin automated review of v0.15.0. **No user-facing changes**
— if v0.15.0 is working for you, the only reason to update is to be on
the latest code.

## What changed

- **CSS:** Replaced the `text-decoration: underline dotted` shorthand
  (partially supported by older Obsidian versions on some platforms) with
  the longhand `text-decoration-line` / `-style` / `-color` properties.
  Affects the dotted-underline hover cue on items with explanations.
- **CSS:** Removed `!important` from one input-margin rule, using
  selector specificity instead. Cleaner override, easier to theme.
- **Build:** Replaced the `builtin-modules` npm package with Node's
  native `module.builtinModules`. One fewer dependency.
- **Build:** Upgraded `esbuild` to clear a dev-time CVE (GHSA-67mh-4wv8-2f99).
  The vulnerability never affected end users — esbuild is build-time only
  — but it's good hygiene and the review pipeline will eventually flag it.
- **Repo:** `package-lock.json` is now committed, as the review pipeline
  recommends for reproducible builds.

## Install

If you're already on v0.15.0, just overwrite `main.js`, `manifest.json`,
and `styles.css` in your `.obsidian/plugins/made-up-words/` folder with
the assets attached to this release. Your settings and dictionary are
preserved.

Fresh installs: see the [README](README.md) for the full walkthrough.

## Known recommendation not addressed

The review pipeline noted that the release assets don't have GitHub
artifact attestations. Setting these up requires a GitHub Actions
workflow that builds and signs the assets in CI, which is a bigger piece
of work than a hotfix patch warrants. It's on the list for a future
release.

## Tests

109 automated tests still passing.
