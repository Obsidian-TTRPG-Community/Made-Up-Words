// Tests for extractBodyPreview.

import { extractBodyPreview } from "./body-preview";

function expect(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${ok ? "" : `\n  got:  "${actual}"\n  want: "${expected}"`}`);
  if (!ok) process.exitCode = 1;
}

// Standard entry with frontmatter, heading, template line, then real body
const sample1 = `---
definition: the inland sea
language: Example
partOfSpeech: proper-noun
---

# Drennith

Translates *the inland sea*.

The vast inland ocean separating the Five Kingdoms from the Burning Coast. Sailors claim it has no bottom.`;

expect(
  "extracts first body paragraph after template line",
  extractBodyPreview(sample1),
  "The vast inland ocean separating the Five Kingdoms from the Burning Coast. Sailors claim it has no bottom."
);

// Body with multiple paragraphs - only first
const sample2 = `---
definition: water
---

# kala

Fresh water specifically.

Used for rain and rivers, not the sea.`;

expect(
  "stops at first blank line",
  extractBodyPreview(sample2),
  "Fresh water specifically."
);

// Markdown formatting stripped
const sample3 = `---
definition: foo
---

# foo

The *legendary* sword **forged** in \`fire\`.`;

expect(
  "strips markdown formatting characters",
  extractBodyPreview(sample3),
  "The legendary sword forged in fire."
);

// No body at all
const sample4 = `---
definition: foo
---

# foo
`;

expect("empty body returns empty", extractBodyPreview(sample4), "");

// Body without frontmatter
const sample5 = `# foo

Plain body text here.`;

expect("works without frontmatter", extractBodyPreview(sample5), "Plain body text here.");

// Long body gets truncated
const sample6 = `---
definition: foo
---

# foo

` + "word ".repeat(60); // ~300 chars

const result6 = extractBodyPreview(sample6);
const ok6 = result6.length <= 201 && result6.endsWith("…");
console.log(`${ok6 ? "PASS" : "FAIL"}  truncates long body with ellipsis: length=${result6.length}`);
if (!ok6) process.exitCode = 1;

// Multi-line first paragraph collapses to one
const sample7 = `---
definition: foo
---

# foo

First line of paragraph
continues on second line
and a third line too.

A second paragraph here.`;

expect(
  "multi-line first paragraph joins",
  extractBodyPreview(sample7),
  "First line of paragraph continues on second line and a third line too."
);

console.log("\nDone.");
