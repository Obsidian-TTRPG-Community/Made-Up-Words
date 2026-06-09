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
      // "Made Up Words" is a brand name, not a sentence to lower-case.
      "obsidianmd/ui/sentence-case": [
        "error",
        { brands: ["Made Up Words"], acronyms: ["IPA"] },
      ],
    },
  },
]);
