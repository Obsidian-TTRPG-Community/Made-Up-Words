// Tests for parseStringList — the frontmatter list parser used by the `parts`
// and `aliases` dictionary fields. (The Dictionary class itself imports the
// runtime-only `obsidian` module and so can't be exercised under tsx; alias
// indexing is verified functionally in Obsidian.)

import { parseStringList } from "./word-tokens";

function expect(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${
      ok ? "" : `\n  got:  ${JSON.stringify(actual)}\n  want: ${JSON.stringify(expected)}`
    }`
  );
  if (!ok) process.exitCode = 1;
}

// YAML list form (aliases: ["Feb", "Febr"])
expect("yaml list", parseStringList(["Feb", "Febr"]), ["Feb", "Febr"]);
// Comma-separated string form (aliases: Feb, Febr)
expect("comma string", parseStringList("Feb, Febr"), ["Feb", "Febr"]);
// Trims whitespace and drops empties / trailing commas
expect("messy string", parseStringList(" Feb , , Febr ,"), ["Feb", "Febr"]);
expect("messy list", parseStringList([" Feb ", "", "Febr"]), ["Feb", "Febr"]);
// Multi-word alias preserved intact
expect("multi-word", parseStringList("New Year Eve, NYE"), ["New Year Eve", "NYE"]);
// Numbers coerced to strings in a list
expect("numbers", parseStringList([1, 2]), ["1", "2"]);
// Nothing usable -> undefined
expect("empty string", parseStringList(""), undefined);
expect("whitespace string", parseStringList("   "), undefined);
expect("empty list", parseStringList([]), undefined);
expect("undefined", parseStringList(undefined), undefined);
expect("null", parseStringList(null), undefined);

console.log("Alias parsing tests complete.");
