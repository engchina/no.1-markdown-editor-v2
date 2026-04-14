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
import { collectFencedCodeBlocks, type FencedCodeBlock } from './fencedCodeRanges'
import { collectMathBlocks, type MathBlock } from './mathBlockRanges.ts'
import { buildSortedRangeSet, type RangeSpec } from './sortedRangeSet'
import { getTaskCheckboxChange } from './taskCheckbox'
import { parseWysiwygBlockquoteLine } from './wysiwygBlockquote'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'
import { findInlineSuperscriptRanges } from './wysiwygSuperscript'
import {
  collectWysiwygCodeBlockDecorations,
  type WysiwygDecorationView,
} from './wysiwygCodeBlock.ts'
import { collectInactiveWysiwygMathBlocks } from './wysiwygMathBlock.ts'

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
  private readonly latex: string
  private readonly editAnchor: number

  constructor(latex: string, editAnchor: number) {
    super()
    this.latex = latex
    this.editAnchor = editAnchor
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wysiwyg-math-inline'
    el.dataset.mathEditAnchor = String(this.editAnchor)
    el.setAttribute('aria-label', 'Edit inline math')
    el.setAttribute('role', 'button')
    void ensureKatexStylesheet().catch(() => {})
    try {
      katex.render(this.latex, el, { throwOnError: false, displayMode: false })
    } catch {
      el.textContent = this.latex
    }
    return el
  }
  ignoreEvent() { return false }
  eq(other: InlineMathWidget) { return this.latex === other.latex && this.editAnchor === other.editAnchor }
}

// KaTeX block math widget
class BlockMathWidget extends WidgetType {
  private readonly latex: string
  private readonly editAnchor: number

  constructor(latex: string, editAnchor: number) {
    super()
    this.latex = latex
    this.editAnchor = editAnchor
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-wysiwyg-math-block'
    el.dataset.mathEditAnchor = String(this.editAnchor)
    el.setAttribute('aria-label', 'Edit math block')
    el.setAttribute('role', 'button')

    const surface = document.createElement('div')
    surface.className = 'cm-wysiwyg-math-block__surface'

    const rendered = document.createElement('div')
    rendered.className = 'cm-wysiwyg-math-block__rendered'

    void ensureKatexStylesheet().catch(() => {})
    try {
      katex.render(this.latex, rendered, { throwOnError: false, displayMode: true })
    } catch {
      rendered.textContent = this.latex
      rendered.style.whiteSpace = 'pre-wrap'
      rendered.style.fontFamily = 'var(--font-mono, monospace)'
    }

    surface.appendChild(rendered)
    el.appendChild(surface)
    return el
  }
  ignoreEvent() { return false }
  eq(other: BlockMathWidget) { return this.latex === other.latex && this.editAnchor === other.editAnchor }
}

class CheckboxWidget extends WidgetType {
  private readonly checked: boolean
  private readonly from: number
  private readonly label: string

  constructor(
    checked: boolean,
    from: number,
    label: string
  ) {
    super()
    this.checked = checked
    this.from = from
    this.label = label
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

class BlockquoteSpacerWidget extends WidgetType {
  private readonly depth: number

  constructor(depth: number) {
    super()
    this.depth = depth
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wysiwyg-blockquote-empty'
    el.style.setProperty('--cm-wysiwyg-blockquote-depth', String(this.depth))
    el.setAttribute('aria-hidden', 'true')
    return el
  }

  ignoreEvent() { return true }

  eq(other: BlockquoteSpacerWidget) {
    return this.depth === other.depth
  }
}

// ── Cursor range helpers ───────────────────────────────────────────────────

function cursorIsOnLine(view: WysiwygDecorationView, lineFrom: number, lineTo: number): boolean {
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

export function buildWysiwygDecorations(
  view: WysiwygDecorationView,
  fencedCodeBlocks: readonly FencedCodeBlock[],
  mathBlocks: readonly MathBlock[]
): DecorationSet {
  // Mixed replace/mark decorations often start at the same position.
  // Collect first, then sort by CodeMirror's range ordering rules.
  const decorations: DecorationSpec[] = [...collectWysiwygCodeBlockDecorations(view, fencedCodeBlocks)]
  const { doc } = view.state
  let fenceIndex = 0
  let mathIndex = 0

  for (const mathBlock of collectInactiveWysiwygMathBlocks(view, mathBlocks)) {
    const openingLine = doc.lineAt(mathBlock.from)
    const closingLine = doc.lineAt(mathBlock.to)

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.from,
      Decoration.line({ attributes: { class: 'cm-wysiwyg-math-block-anchor-line' } })
    )

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.to,
      Decoration.replace({ widget: new BlockMathWidget(mathBlock.latex, mathBlock.editAnchor) })
    )

    let hiddenLineFrom = openingLine.to + 1
    while (hiddenLineFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(hiddenLineFrom)
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.from,
        Decoration.line({ attributes: { class: 'cm-wysiwyg-math-block-hidden-line' } })
      )
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.to,
        Decoration.replace({})
      )
      hiddenLineFrom = hiddenLine.to + 1
    }
  }

  // Process each visible line
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const text = line.text
      const lineFrom = line.from
      const lineTo = line.to
      const onLine = cursorIsOnLine(view, lineFrom, lineTo)

      while (fenceIndex < fencedCodeBlocks.length && fencedCodeBlocks[fenceIndex].to < lineFrom) {
        fenceIndex += 1
      }
      while (mathIndex < mathBlocks.length && mathBlocks[mathIndex].to < lineFrom) {
        mathIndex += 1
      }

      const fencedCodeBlock = fencedCodeBlocks[fenceIndex]
      if (fencedCodeBlock && lineFrom >= fencedCodeBlock.from && lineFrom <= fencedCodeBlock.to) {
        pos = line.to + 1
        continue
      }

      const mathBlock = mathBlocks[mathIndex]
      if (mathBlock && lineFrom >= mathBlock.from && lineFrom <= mathBlock.to) {
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
      const blockquoteLine = parseWysiwygBlockquoteLine(text)
      if (blockquoteLine) {
        if (onLine || !blockquoteLine.isEmpty) {
          queueDecoration(
            decorations,
            lineFrom,
            lineTo,
            Decoration.mark({ class: 'cm-wysiwyg-blockquote' })
          )
        }
        if (!onLine) {
          if (blockquoteLine.isEmpty) {
            queueDecoration(
              decorations,
              lineFrom,
              lineTo,
              Decoration.replace({ widget: new BlockquoteSpacerWidget(blockquoteLine.depth) })
            )
          } else {
            queueDecoration(
              decorations,
              lineFrom,
              lineFrom + blockquoteLine.prefix.length,
              Decoration.replace({})
            )
          }
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

      // ── Inline patterns (bold, italic, highlight, code, strikethrough, links, math) ──
      // Only apply when NOT on the line containing the cursor
      if (!onLine) {
        processInlineMath(decorations, text, lineFrom)
        processInline(decorations, text, lineFrom)
      }

      pos = line.to + 1
    }
  }

  return buildSortedRangeSet(decorations)
}

function safeBuildDecorations(
  view: WysiwygDecorationView,
  fencedCodeBlocks: readonly FencedCodeBlock[],
  mathBlocks: readonly MathBlock[]
): DecorationSet {
  try {
    return buildWysiwygDecorations(view, fencedCodeBlocks, mathBlocks)
  } catch {
    return Decoration.none
  }
}

// Process inline math $...$ within a line
function processInlineMath(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  for (const range of findInlineMathRanges(text)) {
    const from = lineFrom + range.from
    const to = lineFrom + range.to
    queueDecoration(
      decorations,
      from,
      to,
      Decoration.replace({ widget: new InlineMathWidget(range.latex, lineFrom + range.editAnchor) })
    )
  }
}

// Process inline markdown syntax within a line
function processInline(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  processSuperscript(decorations, text, lineFrom)

  // Bold **text** or __text__
  processPattern(decorations, text, lineFrom, /(\*\*|__)((?:[^*_]|\*(?!\*))+?)\1/g, 'cm-wysiwyg-bold')

  // Italic *text* or _text_ (not bold)
  processPattern(decorations, text, lineFrom, /(?<!\*)(\*)(?!\*)((?:[^*])+?)(\*)(?!\*)/g, 'cm-wysiwyg-italic')

  // Underline <u>text</u>
  processPattern(decorations, text, lineFrom, /(<u>)(.+?)(<\/u>)/gi, 'cm-wysiwyg-underline', { closeGroup: 3 })

  // Strikethrough ~~text~~
  processPattern(decorations, text, lineFrom, /(~~)((?:[^~])+?)\1/g, 'cm-wysiwyg-strikethrough')

  // Highlight ==text==
  processPattern(decorations, text, lineFrom, /(==)(?=[^=\s])(.+?)(?<=[^=\s])\1/g, 'cm-wysiwyg-highlight')

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
  const linkRe = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g
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

function processSuperscript(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  for (const range of findInlineSuperscriptRanges(text)) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-superscript' })
    )
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
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

function activateMathTarget(view: EditorView, target: EventTarget | null): boolean {
  const mathTarget = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-math-block, .cm-wysiwyg-math-inline')
  if (!mathTarget) return false

  const editAnchor = Number(mathTarget.dataset.mathEditAnchor)
  if (!Number.isFinite(editAnchor)) return false

  view.dispatch({
    selection: { anchor: editAnchor },
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

// ── Plugin definition ──────────────────────────────────────────────────────

export const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    fencedCodeBlocks: FencedCodeBlock[]
    mathBlocks: MathBlock[]

    constructor(view: EditorView) {
      this.fencedCodeBlocks = collectFencedCodeBlocks(view.state.doc.toString())
      this.mathBlocks = collectMathBlocks(view.state.doc.toString(), this.fencedCodeBlocks)
      this.decorations = safeBuildDecorations(view, this.fencedCodeBlocks, this.mathBlocks)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.fencedCodeBlocks = collectFencedCodeBlocks(update.state.doc.toString())
        this.mathBlocks = collectMathBlocks(update.state.doc.toString(), this.fencedCodeBlocks)
      }

      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = safeBuildDecorations(update.view, this.fencedCodeBlocks, this.mathBlocks)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (!activateMathTarget(view, event.target)) return false
        event.preventDefault()
        return true
      },
      click(event, view) {
        if (activateMathTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
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
  '.cm-wysiwyg-superscript': {
    fontSize: '0.75em',
    lineHeight: '0',
    verticalAlign: 'super',
    color: 'var(--text-primary) !important',
  },
  '.cm-wysiwyg-highlight': {
    backgroundColor: 'color-mix(in srgb, #FACC15 52%, transparent)',
    borderRadius: '0.28em',
    color: 'var(--text-primary) !important',
    padding: '0 0.18em',
  },
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
  '.cm-wysiwyg-codeblock-meta-line': {
    position: 'relative',
    minHeight: '1.8em',
    marginTop: '0.65em',
    marginLeft: '32px',
    marginRight: '32px',
    padding: '10px 16px 8px !important',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderTop: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderTopLeftRadius: '10px',
    borderTopRightRadius: '10px',
    boxSizing: 'border-box',
    fontSize: '0',
    lineHeight: '0',
  },
  '.cm-wysiwyg-codeblock-meta-line::before': {
    content: 'attr(data-code-language-label)',
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '1.35rem',
    padding: '0 0.55rem',
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-ui, inherit)',
    fontSize: '0.74rem',
    fontWeight: '600',
    letterSpacing: '0.01em',
    lineHeight: '1',
    textTransform: 'none',
  },
  '.cm-wysiwyg-codeblock-line': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.94em',
    marginLeft: '32px',
    marginRight: '32px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    padding: '0 16px !important',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  '.cm-wysiwyg-codeblock-close-line': {
    minHeight: '12px',
    marginBottom: '0.65em',
    marginLeft: '32px',
    marginRight: '32px',
    padding: '0 16px 10px !important',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderBottomLeftRadius: '10px',
    borderBottomRightRadius: '10px',
    boxSizing: 'border-box',
    fontSize: '0',
    lineHeight: '0',
  },
  '.cm-wysiwyg-blockquote': {
    color: 'var(--text-secondary) !important',
    fontStyle: 'normal',
    borderLeft: '4px solid color-mix(in srgb, var(--text-muted) 42%, transparent)',
    paddingLeft: '14px',
  },
  '.cm-wysiwyg-blockquote-empty': {
    display: 'inline-block',
    width: '0',
    minHeight: '1.45em',
    boxSizing: 'border-box',
    verticalAlign: 'top',
    borderLeft: '4px solid color-mix(in srgb, var(--text-muted) 42%, transparent)',
    paddingLeft: '14px',
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-math-inline': {
    display: 'inline-block',
    verticalAlign: 'middle',
    cursor: 'text',
    padding: '0 0.14em',
    borderRadius: '0.34em',
    transition: 'background-color 140ms ease, box-shadow 140ms ease',
  },
  '.cm-wysiwyg-math-inline:hover': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--border) 68%, transparent)',
  },
  '.cm-wysiwyg-math-block-anchor-line': {
    padding: '0 !important',
  },
  '.cm-wysiwyg-math-block-hidden-line': {
    height: '0',
    minHeight: '0',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-math-block': {
    display: 'block',
    width: '100%',
    cursor: 'text',
  },
  '.cm-wysiwyg-math-block__surface': {
    margin: '0.5em 32px',
    padding: '8px 16px',
    borderRadius: '12px',
    border: '1px solid transparent',
    backgroundColor: 'transparent',
    transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  '.cm-wysiwyg-math-block:hover .cm-wysiwyg-math-block__surface': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 58%, transparent)',
    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
    boxShadow: 'var(--shadow-sm)',
  },
  '.cm-wysiwyg-math-block__rendered': {
    display: 'block',
    textAlign: 'center',
    overflowX: 'auto',
    boxSizing: 'border-box',
  },
  '.cm-wysiwyg-math-block__rendered .katex-display': {
    margin: '0',
    padding: '8px 0',
    overflowX: 'auto',
  },
})
