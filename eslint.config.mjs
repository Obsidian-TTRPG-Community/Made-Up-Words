// ESLint flat config wiring up the official Obsidian plugin guidelines.
// Run `npm run lint` to reproduce the community-review checks locally.
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Don't lint build output, JS config files, or the dev-only test scripts
  // (they never ship in the plugin bundle).
  {
    ignores: [
      "main.js",
      "node_modules/",
      "**/*.js",
      "**/*.mjs",
      "test-*.ts",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // Words the sentence-case rule must not lower-case:
      //   - "Made Up Words" is the plugin's own name.
      //   - "English" is a proper noun; the rule would rewrite it to "english".
      //   - "Reading view" / "Live Preview" are Obsidian's own UI names, so
      //     matching Obsidian's capitalisation is more correct than the rule.
      //   - "Alt", "Option", "Ctrl", "Cmd", "Shift" are key names as printed
      //     on keyboards.
      // Severity stays at the plugin's own default ("warn"): the brands and
      // acronyms below remove the false positives that can be removed, but a
      // handful remain where the rule mis-reads "e.g." as a sentence break or
      // counts a leading glyph as the first word. Those labels are correct as
      // written, and inline disables for obsidianmd/* rules are not permitted,
      // so the remaining reports are left visible as warnings.
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: [
            "Made Up Words",
            "English",
            "Reading view",
            "Live Preview",
            "Alt",
            "Option",
            "Ctrl",
            "Cmd",
            "Shift",
          ],
          acronyms: ["IPA", "CSS", "POS"],
        },
      ],
    },
  },
]);
