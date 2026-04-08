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
import katex from 'katex'
import { ensureKatexStylesheet } from '../../lib/katexStylesheet'
import { collectFencedCodeRanges, type TextRange } from './fencedCodeRanges'
import { buildSortedRangeSet, type RangeSpec } from './sortedRangeSet'
import { getTaskCheckboxChange } from './taskCheckbox'

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

// KaTeX inline math widget
class InlineMathWidget extends WidgetType {
  constructor(private latex: string) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wysiwyg-math-inline'
    void ensureKatexStylesheet().catch(() => {})
    try {
      katex.render(this.latex, el, { throwOnError: false, displayMode: false })
    } catch {
      el.textContent = this.latex
    }
    return el
  }
  ignoreEvent() { return true }
  eq(other: InlineMathWidget) { return this.latex === other.latex }
}

// KaTeX block math widget
class BlockMathWidget extends WidgetType {
  constructor(private latex: string) { super() }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-wysiwyg-math-block'
    void ensureKatexStylesheet().catch(() => {})
    try {
      katex.render(this.latex, el, { throwOnError: false, displayMode: true })
    } catch {
      el.textContent = this.latex
    }
    return el
  }
  ignoreEvent() { return true }
  eq(other: BlockMathWidget) { return this.latex === other.latex }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private checked: boolean,
    private from: number,
    private label: string
  ) {
    super()
  }
  toDOM() {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.checked = this.checked
    el.className = 'cm-wysiwyg-checkbox'
    el.dataset.checkboxFrom = String(this.from)
    el.setAttribute('aria-label', this.label || 'Task')
    el.style.cssText = 'cursor: pointer; margin-right: 4px; vertical-align: middle;'
    return el
  }
  ignoreEvent() { return false }
  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.from === other.from && this.label === other.label
  }
}

// ── Cursor range helpers ───────────────────────────────────────────────────

function cursorIsOnLine(view: EditorView, lineFrom: number, lineTo: number): boolean {
  const { ranges } = view.state.selection
  return ranges.some((r) => r.from >= lineFrom && r.from <= lineTo)
}

// ── Main WYSIWYG plugin ────────────────────────────────────────────────────

type DecorationSpec = RangeSpec<Decoration>

function queueDecoration(
  decorations: DecorationSpec[],
  from: number,
  to: number,
  value: Decoration
): void {
  decorations.push({ from, to, value })
}

function buildDecorations(view: EditorView, fencedCodeRanges: readonly TextRange[]): DecorationSet {
  // Mixed replace/mark decorations often start at the same position.
  // Collect first, then sort by CodeMirror's range ordering rules.
  const decorations: DecorationSpec[] = []
  const { doc } = view.state
  let fenceIndex = 0

  // Process each visible line
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const text = line.text
      const lineFrom = line.from
      const lineTo = line.to
      const onLine = cursorIsOnLine(view, lineFrom, lineTo)

      while (fenceIndex < fencedCodeRanges.length && fencedCodeRanges[fenceIndex].to < lineFrom) {
        fenceIndex += 1
      }

      const fencedCodeRange = fencedCodeRanges[fenceIndex]
      if (fencedCodeRange && lineFrom >= fencedCodeRange.from && lineFrom <= fencedCodeRange.to) {
        pos = line.to + 1
        continue
      }

      // ── Headings ──────────────────────────────────────────────────────
      const headingMatch = text.match(/^(#{1,6})\s/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const prefixLen = headingMatch[0].length

        if (!onLine) {
          // Hide the "# " prefix
          queueDecoration(
            decorations,
            lineFrom,
            lineFrom + prefixLen,
            Decoration.replace({})
          )
        }
        // Style the whole line
        queueDecoration(
          decorations,
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
          queueDecoration(
            decorations,
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
        queueDecoration(
          decorations,
          lineFrom,
          lineTo,
          Decoration.mark({ class: 'cm-wysiwyg-blockquote' })
        )
        if (!onLine) {
          queueDecoration(decorations, lineFrom, lineFrom + 2, Decoration.replace({}))
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
        const label = text.replace(/^(\s*[-*+]\s)\[( |x|X)\]\s/, '').trim()

        if (!onLine) {
          queueDecoration(
            decorations,
            boxStart,
            boxEnd + 1, // include trailing space
            Decoration.replace({ widget: new CheckboxWidget(checked, boxStart, label) })
          )
        }
      }

      // ── Block math $$...$$  (single or multi-line — handle single-line here)
      if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4 && !onLine) {
        const latex = text.slice(2, -2).trim()
        queueDecoration(
          decorations,
          lineFrom,
          lineTo,
          Decoration.replace({ widget: new BlockMathWidget(latex), block: false })
        )
        pos = line.to + 1
        continue
      }

      // ── Inline patterns (bold, italic, code, strikethrough, links, math) ──
      // Only apply when NOT on the line containing the cursor
      if (!onLine) {
        processInlineMath(decorations, text, lineFrom, view)
        processInline(decorations, text, lineFrom)
      }

      pos = line.to + 1
    }
  }

  return buildSortedRangeSet(decorations)
}

// Process inline math $...$ within a line
function processInlineMath(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  _view: EditorView
): void {
  // Inline math: $expr$ (not $$)
  const re = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const latex = m[1]
    const from = lineFrom + m.index
    const to = from + m[0].length
    queueDecoration(decorations, from, to, Decoration.replace({ widget: new InlineMathWidget(latex) }))
  }
}

// Process inline markdown syntax within a line
function processInline(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  // Bold **text** or __text__
  processPattern(decorations, text, lineFrom, /(\*\*|__)((?:[^*_]|\*(?!\*))+?)\1/g, 'cm-wysiwyg-bold')

  // Italic *text* or _text_ (not bold)
  processPattern(decorations, text, lineFrom, /(?<!\*)(\*)(?!\*)((?:[^*])+?)(\*)(?!\*)/g, 'cm-wysiwyg-italic')

  // Underline <u>text</u>
  processPattern(decorations, text, lineFrom, /(<u>)(.+?)(<\/u>)/gi, 'cm-wysiwyg-underline', { closeGroup: 3 })

  // Strikethrough ~~text~~
  processPattern(decorations, text, lineFrom, /(~~)((?:[^~])+?)\1/g, 'cm-wysiwyg-strikethrough')

  // Inline code `code`
  processPattern(decorations, text, lineFrom, /(`+)((?:.)+?)\1/g, 'cm-wysiwyg-code')

  // Images ![alt](url)
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(text)) !== null) {
    // Replace entire image markdown with a styled span showing alt text
    queueDecoration(
      decorations,
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
    queueDecoration(
      decorations,
      fullStart + 1,
      textEnd - 1,
      Decoration.mark({ class: 'cm-wysiwyg-link' })
    )
    // Hide the [ ] ( url ) wrapping
    queueDecoration(decorations, fullStart, fullStart + 1, Decoration.replace({}))
    queueDecoration(decorations, textEnd - 1, textEnd, Decoration.replace({}))
    queueDecoration(decorations, textEnd, fullEnd, Decoration.replace({}))
  }
}

function processPattern(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  re: RegExp,
  cls: string,
  options: {
    closeGroup?: number
  } = {}
): void {
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const fullStart = lineFrom + m.index
    const fullEnd = fullStart + m[0].length
    const openMarker = typeof m[1] === 'string' && m[1].length > 0 ? m[1] : ''
    const closeMarker = typeof m[options.closeGroup ?? 1] === 'string' && m[options.closeGroup ?? 1].length > 0
      ? m[options.closeGroup ?? 1]
      : openMarker
    const openMarkerLen = openMarker.length || 1
    const closeMarkerLen = closeMarker.length || openMarkerLen

    // Hide opening marker
    queueDecoration(decorations, fullStart, fullStart + openMarkerLen, Decoration.replace({}))
    // Style content
    queueDecoration(
      decorations,
      fullStart + openMarkerLen,
      fullEnd - closeMarkerLen,
      Decoration.mark({ class: cls })
    )
    // Hide closing marker
    queueDecoration(decorations, fullEnd - closeMarkerLen, fullEnd, Decoration.replace({}))
  }
}

function toggleTaskCheckbox(view: EditorView, target: EventTarget | null): boolean {
  const checkbox = (target as HTMLElement | null)?.closest<HTMLInputElement>('.cm-wysiwyg-checkbox')
  if (!checkbox) return false

  const checkboxFrom = Number(checkbox.dataset.checkboxFrom)
  if (!Number.isFinite(checkboxFrom)) return false

  const line = view.state.doc.lineAt(checkboxFrom)
  const change = getTaskCheckboxChange(line.text, line.from)
  if (!change) return false

  view.dispatch({ changes: change })
  view.focus()
  return true
}

// ── Plugin definition ──────────────────────────────────────────────────────

export const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    fencedCodeRanges: TextRange[]

    constructor(view: EditorView) {
      this.fencedCodeRanges = collectFencedCodeRanges(view.state.doc.toString())
      this.decorations = buildDecorations(view, this.fencedCodeRanges)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.fencedCodeRanges = collectFencedCodeRanges(update.state.doc.toString())
      }

      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view, this.fencedCodeRanges)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event, view) {
        if (!toggleTaskCheckbox(view, event.target)) return false
        event.preventDefault()
        return true
      },
      keydown(event, view) {
        if (event.key !== ' ' && event.key !== 'Enter') return false
        if (!toggleTaskCheckbox(view, event.target)) return false
        event.preventDefault()
        return true
      },
    },
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
  '.cm-wysiwyg-underline': { textDecoration: 'underline', color: 'var(--text-primary) !important' },
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
    fontStyle: 'normal',
    borderLeft: '4px solid color-mix(in srgb, var(--text-muted) 42%, transparent)',
    paddingLeft: '14px',
  },
  '.cm-wysiwyg-math-inline': {
    display: 'inline-block',
    verticalAlign: 'middle',
    cursor: 'default',
  },
  '.cm-wysiwyg-math-block': {
    display: 'block',
    textAlign: 'center',
    padding: '8px 0',
    cursor: 'default',
  },
})
