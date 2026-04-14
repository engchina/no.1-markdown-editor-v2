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
import { ensureKatexStylesheet } from '../../lib/katexStylesheet.ts'
import { collectFencedCodeBlocks, type FencedCodeBlock } from './fencedCodeRanges.ts'
import { collectMathBlocks, type MathBlock } from './mathBlockRanges.ts'
import { buildSortedRangeSet, type RangeSpec } from './sortedRangeSet.ts'
import { getTaskCheckboxChange } from './taskCheckbox.ts'
import { collectMarkdownTableBlocks, type MarkdownTableBlock } from './tableBlockRanges.ts'
import { parseWysiwygBlockquoteLine } from './wysiwygBlockquote.ts'
import { collectInlineCodeRanges, findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'
import { findInlineItalicRanges } from './wysiwygInlineEmphasis.ts'
import { collectInlineLiteralEscapeRanges, hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'
import { renderInlineMarkdownFragment } from './wysiwygInlineMarkdown.ts'
import { findInlineStrikethroughRanges } from './wysiwygStrikethrough.ts'
import { findInlineSuperscriptRanges } from './wysiwygSuperscript.ts'
import {
  collectWysiwygCodeBlockDecorations,
  type WysiwygDecorationView,
} from './wysiwygCodeBlock.ts'
import { collectInactiveWysiwygMathBlocks } from './wysiwygMathBlock.ts'
import { collectInactiveWysiwygTables } from './wysiwygTable.ts'

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

class TableWidget extends WidgetType {
  private readonly table: MarkdownTableBlock

  constructor(table: MarkdownTableBlock) {
    super()
    this.table = table
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-wysiwyg-table'
    wrapper.dataset.tableEditStart = String(this.table.editAnchor)
    wrapper.dataset.tableEditEnd = String(this.table.editAnchor)
    wrapper.setAttribute('aria-label', 'Edit table')

    const surface = document.createElement('div')
    surface.className = 'cm-wysiwyg-table__surface'

    const table = document.createElement('table')
    table.className = 'cm-wysiwyg-table__grid'

    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (const [index, cell] of this.table.header.cells.entries()) {
      const th = document.createElement('th')
      th.className = 'cm-wysiwyg-table__head-cell'
      th.dataset.tableColumnKind = resolveTableColumnKind(this.table, index)
      if (this.table.alignments[index]) {
        th.setAttribute('align', this.table.alignments[index] ?? 'left')
      }
      th.dataset.tableEditStart = String(cell.editAnchor)
      th.dataset.tableEditEnd = String(cell.editHead)
      th.innerHTML = renderInlineMarkdownFragment(cell.text)
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    if (this.table.rows.length > 0) {
      const tbody = document.createElement('tbody')
      for (const row of this.table.rows) {
        const tr = document.createElement('tr')
        for (const [index, cell] of row.cells.entries()) {
          const td = document.createElement('td')
          td.className = 'cm-wysiwyg-table__cell'
          td.dataset.tableColumnKind = resolveTableColumnKind(this.table, index)
          if (this.table.alignments[index]) {
            td.setAttribute('align', this.table.alignments[index] ?? 'left')
          }
          td.dataset.tableEditStart = String(cell.editAnchor)
          td.dataset.tableEditEnd = String(cell.editHead)
          td.innerHTML = renderInlineMarkdownFragment(cell.text)
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
    }

    surface.appendChild(table)
    wrapper.appendChild(surface)
    return wrapper
  }

  ignoreEvent() { return false }

  eq(other: TableWidget) {
    return JSON.stringify(this.table) === JSON.stringify(other.table)
  }
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
  mathBlocks: readonly MathBlock[],
  tables: readonly MarkdownTableBlock[]
): DecorationSet {
  // Mixed replace/mark decorations often start at the same position.
  // Collect first, then sort by CodeMirror's range ordering rules.
  const decorations: DecorationSpec[] = [...collectWysiwygCodeBlockDecorations(view, fencedCodeBlocks)]
  const { doc } = view.state
  let fenceIndex = 0
  let mathIndex = 0
  let tableIndex = 0

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

  for (const table of collectInactiveWysiwygTables(view, tables)) {
    const openingLine = doc.lineAt(table.from)
    const closingLine = doc.lineAt(table.to)

    if (openingLine.number > 1) {
      const previousLine = doc.line(openingLine.number - 1)
      if (previousLine.text.trim().length === 0) {
        queueDecoration(
          decorations,
          previousLine.from,
          previousLine.from,
          Decoration.line({ attributes: { class: 'cm-wysiwyg-table-gap-line' } })
        )
      }
    }

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.from,
      Decoration.line({ attributes: { class: 'cm-wysiwyg-table-anchor-line' } })
    )

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.to,
      Decoration.replace({ widget: new TableWidget(table) })
    )

    let hiddenLineFrom = openingLine.to + 1
    while (hiddenLineFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(hiddenLineFrom)
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.from,
        Decoration.line({ attributes: { class: 'cm-wysiwyg-table-hidden-line' } })
      )
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.to,
        Decoration.replace({})
      )
      hiddenLineFrom = hiddenLine.to + 1
    }

    if (closingLine.number < doc.lines) {
      const nextLine = doc.line(closingLine.number + 1)
      if (nextLine.text.trim().length === 0) {
        queueDecoration(
          decorations,
          nextLine.from,
          nextLine.from,
          Decoration.line({ attributes: { class: 'cm-wysiwyg-table-gap-line' } })
        )
      }
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
      while (tableIndex < tables.length && tables[tableIndex].to < lineFrom) {
        tableIndex += 1
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

      const table = tables[tableIndex]
      if (table && lineFrom >= table.from && lineFrom <= table.to) {
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
  mathBlocks: readonly MathBlock[],
  tables: readonly MarkdownTableBlock[]
): DecorationSet {
  try {
    return buildWysiwygDecorations(view, fencedCodeBlocks, mathBlocks, tables)
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
  const inlineCodeRanges = collectInlineCodeRanges(text)
  const inlineLiteralExcludedRanges = [
    ...inlineCodeRanges,
    ...findInlineMathRanges(text).map((range) => ({ from: range.from, to: range.to })),
  ].sort((left, right) => left.from - right.from || left.to - right.to)

  processSuperscript(decorations, text, lineFrom)

  // Bold **text** or __text__
  processPattern(decorations, text, lineFrom, /(\*\*|__)((?:[^*_]|\*(?!\*))+?)\1/g, 'cm-wysiwyg-bold', {
    excludedRanges: inlineCodeRanges,
  })

  processItalic(decorations, text, lineFrom)

  // Underline <u>text</u>
  processPattern(decorations, text, lineFrom, /(<u>)(.+?)(<\/u>)/gi, 'cm-wysiwyg-underline', {
    closeGroup: 3,
    excludedRanges: inlineCodeRanges,
  })

  processStrikethrough(decorations, text, lineFrom)

  // Highlight ==text==
  processPattern(decorations, text, lineFrom, /(==)(?=[^=\s])(.+?)(?<=[^=\s])\1/g, 'cm-wysiwyg-highlight', {
    excludedRanges: inlineCodeRanges,
  })

  // Inline code `code`
  processPattern(decorations, text, lineFrom, /(`+)((?:.)+?)\1/g, 'cm-wysiwyg-code')

  // Images ![alt](url)
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(text)) !== null) {
    const matchStart = m.index
    const matchEnd = matchStart + m[0].length - 1
    if (hasOddTrailingBackslashes(text, matchStart)) continue
    if (findContainingTextRange(matchStart, inlineCodeRanges) || findContainingTextRange(matchEnd, inlineCodeRanges)) {
      continue
    }

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
    const matchStart = m.index
    const matchEnd = matchStart + m[0].length - 1
    if (hasOddTrailingBackslashes(text, matchStart)) continue
    if (findContainingTextRange(matchStart, inlineCodeRanges) || findContainingTextRange(matchEnd, inlineCodeRanges)) {
      continue
    }

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

  processLiteralEscapes(decorations, text, lineFrom, inlineLiteralExcludedRanges)
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

function processStrikethrough(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  for (const range of findInlineStrikethroughRanges(text)) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-strikethrough' })
    )
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
  }
}

function processItalic(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  for (const range of findInlineItalicRanges(text)) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-italic' })
    )
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
  }
}

function processLiteralEscapes(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  excludedRanges: readonly TextRange[]
): void {
  for (const range of collectInlineLiteralEscapeRanges(text, excludedRanges)) {
    queueDecoration(
      decorations,
      lineFrom + range.from,
      lineFrom + range.to,
      Decoration.replace({})
    )
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
    ignoreEscapedDelimiters?: boolean
    excludedRanges?: readonly TextRange[]
  } = {}
): void {
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const openMarker = typeof m[1] === 'string' && m[1].length > 0 ? m[1] : ''
    const closeMarker = typeof m[options.closeGroup ?? 1] === 'string' && m[options.closeGroup ?? 1].length > 0
      ? m[options.closeGroup ?? 1]
      : openMarker
    const openMarkerLen = openMarker.length || 1
    const closeMarkerLen = closeMarker.length || openMarkerLen
    const openMarkerStart = m.index
    const closeMarkerStart = m.index + m[0].length - closeMarkerLen

    if (options.ignoreEscapedDelimiters !== false) {
      if (hasOddTrailingBackslashes(text, openMarkerStart) || hasOddTrailingBackslashes(text, closeMarkerStart)) {
        continue
      }
    }

    if (
      options.excludedRanges &&
      (
        findContainingTextRange(openMarkerStart, options.excludedRanges) ||
        findContainingTextRange(closeMarkerStart, options.excludedRanges)
      )
    ) {
      continue
    }

    const fullStart = lineFrom + openMarkerStart
    const fullEnd = fullStart + m[0].length

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

function activateTable(view: EditorView, target: EventTarget | null): boolean {
  const tableTarget = (target as HTMLElement | null)?.closest<HTMLElement>('[data-table-edit-start]')
  if (!tableTarget) return false

  const editStart = Number(tableTarget.dataset.tableEditStart)
  const editEnd = Number(tableTarget.dataset.tableEditEnd)
  if (!Number.isFinite(editStart) || !Number.isFinite(editEnd)) return false

  view.dispatch({
    selection: { anchor: editStart, head: editEnd },
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

function resolveTableColumnKind(table: MarkdownTableBlock, columnIndex: number): 'text' | 'numeric' {
  if (table.alignments[columnIndex] !== 'right') return 'text'
  const values = table.rows.map((row) => row.cells[columnIndex]?.text?.trim() ?? '').filter(Boolean)
  if (values.length === 0) return 'text'
  return values.every(isCompactNumericCell) ? 'numeric' : 'text'
}

function isCompactNumericCell(value: string): boolean {
  return /^[+\-]?(?:[$€£¥₹]\s*)?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%?$/u.test(value)
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
    tables: MarkdownTableBlock[]

    constructor(view: EditorView) {
      this.fencedCodeBlocks = collectFencedCodeBlocks(view.state.doc.toString())
      this.mathBlocks = collectMathBlocks(view.state.doc.toString(), this.fencedCodeBlocks)
      this.tables = collectMarkdownTableBlocks(view.state.doc.toString(), [...this.fencedCodeBlocks, ...this.mathBlocks])
      this.decorations = safeBuildDecorations(view, this.fencedCodeBlocks, this.mathBlocks, this.tables)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.fencedCodeBlocks = collectFencedCodeBlocks(update.state.doc.toString())
        this.mathBlocks = collectMathBlocks(update.state.doc.toString(), this.fencedCodeBlocks)
        this.tables = collectMarkdownTableBlocks(update.state.doc.toString(), [...this.fencedCodeBlocks, ...this.mathBlocks])
      }

      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = safeBuildDecorations(update.view, this.fencedCodeBlocks, this.mathBlocks, this.tables)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (activateTable(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (!activateMathTarget(view, event.target)) return false
        event.preventDefault()
        return true
      },
      click(event, view) {
        if (activateTable(view, event.target)) {
          event.preventDefault()
          return true
        }
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
  '.cm-wysiwyg-table-anchor-line': {
    padding: '0 !important',
  },
  '.cm-wysiwyg-table-hidden-line': {
    height: '0',
    minHeight: '0',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-table-gap-line': {
    minHeight: '1.15em',
    padding: '0 !important',
    lineHeight: '1.15',
    fontSize: 'inherit',
  },
  '.cm-wysiwyg-table': {
    display: 'block',
    width: '100%',
    cursor: 'text',
  },
  '.cm-wysiwyg-table__surface': {
    margin: '0 16px',
    overflowX: 'auto',
    borderRadius: '0',
    border: 'none',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    transition: 'outline-color 160ms ease, outline-offset 160ms ease',
  },
  '.cm-wysiwyg-table:hover .cm-wysiwyg-table__surface': {
    outline: '1px solid color-mix(in srgb, var(--border) 74%, transparent)',
    outlineOffset: '2px',
  },
  '.cm-wysiwyg-table__grid': {
    borderCollapse: 'collapse',
    width: '100%',
    tableLayout: 'auto',
    margin: '0',
    color: 'var(--preview-text)',
    fontFamily: 'var(--font-preview, Inter, system-ui, sans-serif)',
    fontSize: 'inherit',
  },
  '.cm-wysiwyg-table__head-cell, .cm-wysiwyg-table__cell': {
    border: '1px solid var(--border)',
    padding: '8px 16px',
    textAlign: 'left',
    verticalAlign: 'top',
    cursor: 'text',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    color: 'var(--preview-text)',
    fontFamily: 'var(--font-preview, Inter, system-ui, sans-serif)',
    fontSize: 'inherit',
    fontWeight: '400',
  },
  '.cm-wysiwyg-table__head-cell': {
    backgroundColor: 'var(--bg-secondary)',
    fontWeight: '600',
  },
  '.cm-wysiwyg-table__grid tbody tr:nth-child(even) .cm-wysiwyg-table__cell': {
    backgroundColor: 'var(--bg-secondary)',
  },
  '.cm-wysiwyg-table__head-cell[align="center"], .cm-wysiwyg-table__cell[align="center"]': {
    textAlign: 'center',
  },
  '.cm-wysiwyg-table__head-cell[align="right"], .cm-wysiwyg-table__cell[align="right"]': {
    textAlign: 'right',
  },
  '.cm-wysiwyg-table__head-cell[data-table-column-kind="numeric"], .cm-wysiwyg-table__cell[data-table-column-kind="numeric"]': {
    width: '1%',
    whiteSpace: 'nowrap',
    overflowWrap: 'normal',
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
