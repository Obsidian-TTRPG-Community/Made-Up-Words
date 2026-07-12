// Pure body-preview extraction. No Obsidian dependencies so it's easy
// to unit-test outside the plugin context.

/**
 * Extract the first meaningful paragraph from a markdown note's body.
 * Skips frontmatter, H1 headings, and blank lines. Returns at most ~200 chars.
 *
 * Used to build a body preview for proper-noun entries so their hover
 * tooltip can show the worldbuilding context, not just the bare definition.
 */
export function extractBodyPreview(content: string): string {
  let body = content;

  // Strip YAML frontmatter
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) {
      body = body.slice(end + 4);
    }
  }

  // Walk lines, skipping headings, blanks, and the auto-generated
  // "Translates *foo*" line our entry template creates.
  const lines = body.split(/\r?\n/);
  const paragraph: string[] = [];
  let inParagraph = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inParagraph) break; // end of first paragraph
      continue;
    }
    // ATX heading (`# Foo`)
    if (line.startsWith("#")) continue;
    // Setext heading underline (`===` or `---` on its own line): the text
    // line we just collected was actually a heading, so drop it and keep
    // scanning for real body text. (Frontmatter is already stripped above, so
    // a `---` here is an underline or thematic break, not a YAML fence.)
    if (/^(=+|-+)$/.test(line)) {
      if (paragraph.length > 0) {
        paragraph.pop();
        if (paragraph.length === 0) inParagraph = false;
      }
      continue;
    }
    if (/^Translates \*[^*]+\*\.?$/.test(line)) continue;
    paragraph.push(line);
    inParagraph = true;
  }
  let text = paragraph.join(" ").trim();
  // Strip simple markdown formatting that would render literally
  text = text.replace(/[*_`]/g, "");
  const MAX = 200;
  if (text.length > MAX) {
    text = text.slice(0, MAX).replace(/\s+\S*$/, "") + "…";
  }
  return text;
}
