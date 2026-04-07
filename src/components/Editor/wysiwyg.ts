/**
 * WYSIWYG Plugin for CodeMirror 6
 *
 * Implements Typora-style live preview:
 * - Hides syntax markers when cursor is NOT near them
 * - Shows formatted text inline (headings, bold, italic, etc.)
 * - Reveals raw syntax when cursor enters the range
 */

import {
  ViewPlugin,
  DecorationSet,
  Decoration,
  EditorView,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// ── Widgets ────────────────────────────────────────────────────────────────

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-wysiwyg-hr'
    el.style.cssText =
      'border: none; border-top: 2px solid var(--border); margin: 0.5em 0; pointer-events: none;'
    return el
  }
  ignoreEvent() { return true }
}

class CheckboxWidget extends WidgetType {
  constructor(private checked: boolean) { super() }
  toDOM() {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.checked = this.checked
    el.className = 'cm-wysiwyg-checkbox'
    el.style.cssText = 'cursor: pointer; margin-right: 4px; vertical-align: middle;'
    return el
  }
  ignoreEvent() { return false }
  eq(other: CheckboxWidget) { return this.checked === other.checked }
}

// ── Cursor range helpers ───────────────────────────────────────────────────

function cursorIsOnLine(view: EditorView, lineFrom: number, lineTo: number): boolean {
  const { ranges } = view.state.selection
  return ranges.some((r) => r.from >= lineFrom && r.from <= lineTo)
}

// ── Main WYSIWYG plugin ────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { doc } = view.state

  // Process each visible line
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const text = line.text
      const lineFrom = line.from
      const lineTo = line.to
      const onLine = cursorIsOnLine(view, lineFrom, lineTo)

      // ── Headings ──────────────────────────────────────────────────────
      const headingMatch = text.match(/^(#{1,6})\s/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const prefixLen = headingMatch[0].length

        if (!onLine) {
          // Hide the "# " prefix
          builder.add(
            lineFrom,
            lineFrom + prefixLen,
            Decoration.replace({})
          )
        }
        // Style the whole line
        builder.add(
          lineFrom,
          lineTo,
          Decoration.mark({ class: `cm-wysiwyg-h${level}` })
        )
        pos = line.to + 1
        continue
      }

      // ── Horizontal rule ───────────────────────────────────────────────
      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(text)) {
        if (!onLine) {
          builder.add(
            lineFrom,
            lineTo,
            Decoration.replace({ widget: new HrWidget(), block: false })
          )
        }
        pos = line.to + 1
        continue
      }

      // ── Blockquote decoration ─────────────────────────────────────────
      if (text.startsWith('> ')) {
        builder.add(lineFrom, lineTo, Decoration.mark({ class: 'cm-wysiwyg-blockquote' }))
        if (!onLine) {
          builder.add(lineFrom, lineFrom + 2, Decoration.replace({}))
        }
        pos = line.to + 1
        continue
      }

      // ── Task list checkboxes ───────────────────────────────────────────
      const taskMatch = text.match(/^(\s*[-*+]\s)\[( |x|X)\]\s/)
      if (taskMatch) {
        const bulletEnd = lineFrom + taskMatch[1].length
        const boxStart = bulletEnd
        const boxEnd = boxStart + taskMatch[2].length + 2 // [x]
        const checked = taskMatch[2].toLowerCase() === 'x'

        if (!onLine) {
          builder.add(
            boxStart,
            boxEnd + 1, // include trailing space
            Decoration.replace({ widget: new CheckboxWidget(checked) })
          )
        }
      }

      // ── Inline patterns (bold, italic, code, strikethrough, links) ────
      // Only apply when NOT on the line containing the cursor
      if (!onLine) {
        processInline(builder, text, lineFrom)
      }

      pos = line.to + 1
    }
  }

  return builder.finish()
}

// Process inline markdown syntax within a line
function processInline(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  lineFrom: number
): void {
  // Bold **text** or __text__
  processPattern(builder, text, lineFrom, /(\*\*|__)((?:[^*_]|\*(?!\*))+?)\1/g, 'cm-wysiwyg-bold', 1)

  // Italic *text* or _text_ (not bold)
  processPattern(builder, text, lineFrom, /(?<!\*)(\*)(?!\*)((?:[^*])+?)(\*)(?!\*)/g, 'cm-wysiwyg-italic', 1)

  // Strikethrough ~~text~~
  processPattern(builder, text, lineFrom, /(~~)((?:[^~])+?)\1/g, 'cm-wysiwyg-strikethrough', 1)

  // Inline code `code`
  processPattern(builder, text, lineFrom, /(`+)((?:.)+?)\1/g, 'cm-wysiwyg-code', 1)

  // Images ![alt](url)
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(text)) !== null) {
    // Replace entire image markdown with a styled span showing alt text
    builder.add(
      lineFrom + m.index,
      lineFrom + m.index + m[0].length,
      Decoration.mark({ class: 'cm-wysiwyg-image' })
    )
  }

  // Links [text](url) — hide the (url) part
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  while ((m = linkRe.exec(text)) !== null) {
    const fullStart = lineFrom + m.index
    const textEnd = fullStart + 1 + m[1].length + 1  // past ]
    const fullEnd = lineFrom + m.index + m[0].length

    // Style the link text
    builder.add(fullStart + 1, textEnd - 1, Decoration.mark({ class: 'cm-wysiwyg-link' }))
    // Hide the [ ] ( url ) wrapping
    builder.add(fullStart, fullStart + 1, Decoration.replace({}))
    builder.add(textEnd - 1, textEnd, Decoration.replace({}))
    builder.add(textEnd, fullEnd, Decoration.replace({}))
  }
}

function processPattern(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  lineFrom: number,
  re: RegExp,
  cls: string,
  markerGroupLen: number
): void {
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const fullStart = lineFrom + m.index
    const fullEnd = fullStart + m[0].length
    const markerLen = markerGroupLen

    // Hide opening marker
    builder.add(fullStart, fullStart + markerLen, Decoration.replace({}))
    // Style content
    builder.add(fullStart + markerLen, fullEnd - markerLen, Decoration.mark({ class: cls }))
    // Hide closing marker
    builder.add(fullEnd - markerLen, fullEnd, Decoration.replace({}))
  }
}

// ── Plugin definition ──────────────────────────────────────────────────────

export const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

// ── WYSIWYG CSS styles ─────────────────────────────────────────────────────
// These are injected via a CM theme extension

export const wysiwygTheme = EditorView.baseTheme({
  // Headings
  '.cm-wysiwyg-h1': { fontSize: '2em', fontWeight: '700', lineHeight: '1.3', color: 'var(--text-primary) !important', fontFamily: 'var(--font-preview, inherit)' },
  '.cm-wysiwyg-h2': { fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-h3': { fontSize: '1.3em', fontWeight: '600', lineHeight: '1.3', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-h4': { fontSize: '1.1em', fontWeight: '600', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-h5': { fontSize: '1em', fontWeight: '600', color: 'var(--text-secondary) !important' },
  '.cm-wysiwyg-h6': { fontSize: '0.95em', fontWeight: '600', color: 'var(--text-muted) !important' },

  // Inline
  '.cm-wysiwyg-bold': { fontWeight: '700', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-italic': { fontStyle: 'italic', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-strikethrough': { textDecoration: 'line-through', color: 'var(--text-muted) !important' },
  '.cm-wysiwyg-code': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.875em',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '3px',
    padding: '0 3px',
    color: 'var(--text-primary) !important',
  },
  '.cm-wysiwyg-link': {
    color: 'var(--accent) !important',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  '.cm-wysiwyg-image': {
    color: 'var(--text-muted) !important',
    fontStyle: 'italic',
  },
  '.cm-wysiwyg-blockquote': {
    color: 'var(--text-secondary) !important',
    fontStyle: 'italic',
    borderLeft: '4px solid var(--accent)',
    paddingLeft: '12px',
  },
})
