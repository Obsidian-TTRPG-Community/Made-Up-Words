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
      "obsidianmd/ui/sentence-case": [
        "error",
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
