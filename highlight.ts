// Known-word highlighting — editor & reading-view integration.
//
// Visually marks words/phrases in notes that the plugin recognises:
//   - conlang headwords (dictionary entries in any active language),
//     including inflected forms and multi-word phrases;
//   - English terms the dictionary can translate.
//
// Two render paths share the same span-resolution logic from highlight-core:
//   1. A CodeMirror 6 ViewPlugin decorates the live editor (Live Preview /
//      Source). It only scans the visible viewport for performance.
//   2. A Markdown post-processor wraps matching text nodes in Reading view.
//
// Appearance (underline / italic / background) is driven entirely by CSS via
// a body-level class, so themes and snippets can override it freely.

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type ConlangPlugin from "./main";
import { highlightSpans, classForKind, BASE_CLASS } from "./highlight-core";

export type { HighlightKind, HighlightSpan } from "./highlight-core";
export { highlightSpans, classifyWord, classForKind } from "./highlight-core";

/**
 * Dispatched into the editor to force the ViewPlugin to recompute its
 * decorations — used when the dictionary or settings change without the
 * document itself changing.
 */
export const refreshHighlightEffect = StateEffect.define<null>();

// === Editor (CodeMirror 6) path ===

/**
 * True if `pos` sits inside a syntax node we never want to decorate: code
 * blocks, inline code, frontmatter, math, or HTML. Highlighting inside those
 * would be noise (and could corrupt code the user is reading).
 */
interface SyntaxNodeLike {
  type: { name: string };
  parent: SyntaxNodeLike | null;
}

function isExcludedPos(view: EditorView, pos: number): boolean {
  let node: SyntaxNodeLike | null = syntaxTree(view.state).resolveInner(
    pos,
    1
  ) as SyntaxNodeLike;
  while (node) {
    const name: string = node.type.name || "";
    if (/code|frontmatter|math|html|comment/i.test(name)) return true;
    node = node.parent;
  }
  return false;
}

/** Build the editor extension that decorates known words in the viewport. */
export function makeHighlightExtension(plugin: ConlangPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        const forced = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshHighlightEffect))
        );
        if (update.docChanged || update.viewportChanged || forced) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        if (!plugin.settings.highlightKnownWords) return builder.finish();

        const seenLines = new Set<number>();
        for (const range of view.visibleRanges) {
          let pos = range.from;
          while (pos <= range.to) {
            const line = view.state.doc.lineAt(pos);
            if (!seenLines.has(line.from)) {
              seenLines.add(line.from);
              for (const span of highlightSpans(plugin, line.text, line.from)) {
                if (isExcludedPos(view, span.from)) continue;
                builder.add(
                  span.from,
                  span.to,
                  Decoration.mark({ class: classForKind(span.kind) })
                );
              }
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

// === Reading-view (Markdown post-processor) path ===

/**
 * Walk the rendered element's text nodes and wrap recognised words/phrases in
 * styled spans. Skips code, math, links-as-tags, and already-highlighted
 * nodes so we never double-wrap or touch code.
 */
export function highlightElement(plugin: ConlangPlugin, root: HTMLElement) {
  if (!plugin.settings.highlightKnownWords) return;

  const walker = activeDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          "code, pre, .math, .frontmatter, .cm-editor, ." + BASE_CLASS + ", a.tag"
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent || !node.textContent.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Collect first, then mutate — editing the DOM mid-walk invalidates the
  // TreeWalker's position.
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);
  for (const textNode of targets) replaceTextNode(plugin, textNode);
}

function replaceTextNode(plugin: ConlangPlugin, textNode: Text) {
  const text = textNode.textContent ?? "";
  const spans = highlightSpans(plugin, text, 0);
  if (spans.length === 0) return;

  const frag = activeDocument.createDocumentFragment();
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) {
      frag.appendChild(activeDocument.createTextNode(text.slice(cursor, span.from)));
    }
    const el = activeDocument.createElement("span");
    el.className = classForKind(span.kind);
    el.textContent = text.slice(span.from, span.to);
    frag.appendChild(el);
    cursor = span.to;
  }
  if (cursor < text.length) {
    frag.appendChild(activeDocument.createTextNode(text.slice(cursor)));
  }
  textNode.parentNode?.replaceChild(frag, textNode);
}
