/**
 * WYSIWYG Plugin for CodeMirror 6
 *
 * Implements Typora-style live preview:
 * - Hides syntax markers when cursor is NOT near them
 * - Shows formatted text inline (headings, bold, italic, etc.)
 * - Keeps structural widgets like tables rendered while editing through inline controls
 */

import {
  ViewPlugin,
  DecorationSet,
  Decoration,
  EditorView,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { StateField, type EditorState as CodeMirrorState } from '@codemirror/state'
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
import { hasTerminalBlankLine } from '../../lib/editorTerminalBlankLine.ts'
import {
  decodeMarkdownTableCellText,
  encodeMarkdownTableCellText,
  isActiveTableCellLocation,
  resolveTableKeyAction,
  resolveDecodedTableCellOffset,
  resolveEncodedTableCellOffset,
  resolveNearestTableCellLocation,
  resolveTableCell,
  type ActiveWysiwygTableCell,
  type MarkdownTableCellLocation,
  type WysiwygTableCellSelectionBehavior,
  type WysiwygTableKeyCommand,
  type WysiwygTableRowInsertionPlan,
} from './wysiwygTable.ts'

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
  private readonly activeCell: ActiveWysiwygTableCell | null

  constructor(table: MarkdownTableBlock, activeCell: ActiveWysiwygTableCell | null) {
    super()
    this.table = table
    this.activeCell = activeCell
  }

  toDOM() {
    const wrapper = document.createElement('div')
    syncTableWidgetDom(wrapper, this.table, this.activeCell)
    return wrapper
  }

  updateDOM(dom: HTMLElement) {
    syncTableWidgetDom(dom, this.table, this.activeCell)
    return true
  }

  ignoreEvent() { return false }

  eq(other: TableWidget) {
    return JSON.stringify(this.table) === JSON.stringify(other.table) &&
      areActiveTableCellsEqual(this.activeCell, other.activeCell)
  }
}

const ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS = new Map<number, readonly number[]>()
const TABLE_EDITING_CLASS = 'cm-wysiwyg-table-editing'

function readRenderedTableColumnWidths(target: HTMLElement | null): readonly number[] | null {
  const grid = target?.closest<HTMLTableElement>('.cm-wysiwyg-table__grid')
  if (!grid) return null

  const headerCells = Array.from(grid.tHead?.rows[0]?.cells ?? [])
  if (headerCells.length === 0) return null

  const widths = headerCells.map((cell) => Math.round(cell.getBoundingClientRect().width)).filter((width) => width > 0)
  return widths.length === headerCells.length ? widths : null
}

function syncTableColumnWidthColGroup(
  grid: HTMLTableElement,
  columnWidths: readonly number[] | null
): void {
  const colGroup = grid.querySelector<HTMLTableColElement>('colgroup[data-wysiwyg-table-cols="true"]')

  if (!columnWidths || columnWidths.length === 0) {
    colGroup?.remove()
    return
  }

  const ensuredColGroup = colGroup ?? document.createElement('colgroup')
  if (!colGroup) {
    ensuredColGroup.dataset.wysiwygTableCols = 'true'
    grid.insertBefore(ensuredColGroup, grid.firstChild)
  }

  while (ensuredColGroup.children.length > columnWidths.length) {
    ensuredColGroup.removeChild(ensuredColGroup.lastChild!)
  }

  columnWidths.forEach((width, index) => {
    const col = ensuredColGroup.children[index] instanceof HTMLTableColElement
      ? ensuredColGroup.children[index] as HTMLTableColElement
      : document.createElement('col')

    if (!col.parentElement) {
      ensuredColGroup.appendChild(col)
    }

    const nextWidth = `${width}px`
    if (col.style.width !== nextWidth) {
      col.style.width = nextWidth
    }
  })
}

function syncTableWidgetDom(
  wrapper: HTMLElement,
  table: MarkdownTableBlock,
  activeCell: ActiveWysiwygTableCell | null
): void {
  wrapper.className = 'cm-wysiwyg-table'
  wrapper.dataset.tableEditStart = String(table.editAnchor)
  wrapper.dataset.tableEditEnd = String(table.editAnchor)
  wrapper.dataset.tableFrom = String(table.from)
  wrapper.setAttribute('aria-label', 'Edit table')

  let surface = wrapper.firstElementChild
  if (!(surface instanceof HTMLDivElement) || !surface.classList.contains('cm-wysiwyg-table__surface')) {
    wrapper.replaceChildren()
    surface = document.createElement('div')
    surface.className = 'cm-wysiwyg-table__surface'
    wrapper.appendChild(surface)
  }

  let grid = surface.firstElementChild as HTMLTableElement | null
  if (!(grid instanceof HTMLTableElement) || !grid.classList.contains('cm-wysiwyg-table__grid')) {
    surface.replaceChildren()
    grid = document.createElement('table')
    grid.className = 'cm-wysiwyg-table__grid'
    surface.appendChild(grid)
  }

  syncTableColumnWidthColGroup(
    grid,
    activeCell ? ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.get(table.from) ?? null : null
  )

  const thead = grid.tHead ?? document.createElement('thead')
  if (!grid.tHead) grid.appendChild(thead)
  syncTableRowDom(thead, table, 'head', 0, table.header.cells, activeCell)

  if (table.rows.length === 0) {
    if (grid.tBodies[0]) {
      grid.removeChild(grid.tBodies[0])
    }
    return
  }

  const tbody = grid.tBodies[0] ?? document.createElement('tbody')
  if (!grid.tBodies[0]) grid.appendChild(tbody)

  while (tbody.rows.length > table.rows.length) {
    tbody.deleteRow(tbody.rows.length - 1)
  }

  table.rows.forEach((row, rowIndex) => {
    const tr = tbody.rows[rowIndex] ?? tbody.insertRow(rowIndex)
    syncTableRowDom(tr, table, 'body', rowIndex, row.cells, activeCell)
  })
}

function syncTableRowDom(
  rowContainer: HTMLTableSectionElement | HTMLTableRowElement,
  table: MarkdownTableBlock,
  section: 'head' | 'body',
  rowIndex: number,
  cells: ReadonlyArray<MarkdownTableBlock['header']['cells'][number]>,
  activeCell: ActiveWysiwygTableCell | null
): void {
  const row = rowContainer instanceof HTMLTableRowElement
    ? rowContainer
    : rowContainer.rows[0] ?? rowContainer.insertRow(0)

  if (rowContainer instanceof HTMLTableSectionElement) {
    while (rowContainer.rows.length > 1) {
      rowContainer.deleteRow(rowContainer.rows.length - 1)
    }
  }

  while (row.cells.length > cells.length) {
    row.deleteCell(row.cells.length - 1)
  }

  cells.forEach((cell, columnIndex) => {
    const expectedTagName = section === 'head' ? 'TH' : 'TD'
    let element = row.cells[columnIndex] ?? null
    if (!(element instanceof HTMLTableCellElement) || element.tagName !== expectedTagName) {
      const replacement = section === 'head'
        ? document.createElement('th')
        : document.createElement('td')

      if (element instanceof HTMLTableCellElement) {
        row.replaceChild(replacement, element)
      } else {
        row.appendChild(replacement)
      }

      element = replacement
    }

    const location: MarkdownTableCellLocation = { section, rowIndex, columnIndex }
    syncTableCellDom(
      element,
      table,
      cell,
      location,
      resolveTableColumnKind(table, columnIndex),
      activeCell
    )
  })
}

function syncTableCellDom(
  element: HTMLTableCellElement,
  table: MarkdownTableBlock,
  cell: MarkdownTableBlock['header']['cells'][number],
  location: MarkdownTableCellLocation,
  columnKind: 'text' | 'numeric',
  activeCell: ActiveWysiwygTableCell | null
): void {
  const baseClass =
    location.section === 'head'
      ? 'cm-wysiwyg-table__head-cell'
      : 'cm-wysiwyg-table__cell'
  const isActive = isActiveTableCellLocation(activeCell, table.from, location)
  element.className = isActive ? `${baseClass} cm-wysiwyg-table__cell--active` : baseClass
  element.dataset.tableColumnKind = columnKind
  element.dataset.tableEditStart = String(cell.editAnchor)
  element.dataset.tableEditEnd = String(cell.editHead)
  element.dataset.tableFrom = String(table.from)
  element.dataset.tableSection = location.section
  element.dataset.tableRowIndex = String(location.rowIndex)
  element.dataset.tableColumnIndex = String(location.columnIndex)

  const alignment = table.alignments[location.columnIndex]
  if (alignment) {
    element.setAttribute('align', alignment)
  } else {
    element.removeAttribute('align')
  }

  if (isActive && activeCell) {
    syncTableEditorInput(element, table, cell, location, activeCell)
    return
  }

  const rendered = renderInlineMarkdownFragment(cell.text, { tableLineBreakMode: 'placeholder' })
  if (element.innerHTML !== rendered) {
    element.innerHTML = rendered
  }
}

function syncTableEditorInput(
  element: HTMLTableCellElement,
  table: MarkdownTableBlock,
  cell: MarkdownTableBlock['header']['cells'][number],
  location: MarkdownTableCellLocation,
  activeCell: ActiveWysiwygTableCell
): void {
  let input = element.firstElementChild as HTMLInputElement | null
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('cm-wysiwyg-table__input')) {
    element.replaceChildren()
    input = document.createElement('input')
    input.className = 'cm-wysiwyg-table__input'
    input.type = 'text'
    element.appendChild(input)
  }

  const displayText = decodeMarkdownTableCellText(cell.text)
  if (input.value !== displayText) {
    input.value = displayText
  }

  input.dataset.tableEditStart = String(cell.editAnchor)
  input.dataset.tableEditEnd = String(cell.editHead)
  input.dataset.tableFrom = String(table.from)
  input.dataset.tableSection = location.section
  input.dataset.tableRowIndex = String(location.rowIndex)
  input.dataset.tableColumnIndex = String(location.columnIndex)
  input.setAttribute('aria-label', `Edit table cell ${location.rowIndex + 1}:${location.columnIndex + 1}`)
  ensureTableInputKeydownBinding(input)
  syncTextInputSelection(input, activeCell.selectionStart, activeCell.selectionEnd)
}

function syncTextInputSelection(
  input: HTMLInputElement,
  selectionStart: number,
  selectionEnd: number
): void {
  const maxOffset = input.value.length
  const nextStart = Math.max(0, Math.min(selectionStart, maxOffset))
  const nextEnd = Math.max(0, Math.min(selectionEnd, maxOffset))

  if (input.selectionStart === nextStart && input.selectionEnd === nextEnd) return
  try {
    input.setSelectionRange(nextStart, nextEnd)
  } catch {
    // Ignore selection restoration failures on browsers that reject stale inputs.
  }
}

function ensureTableInputKeydownBinding(input: HTMLInputElement): void {
  if (input.dataset.tableKeydownBound === 'true') return
  input.dataset.tableKeydownBound = 'true'
  input.addEventListener('keydown', handleNativeTableInputKeydown)
}

function handleNativeTableInputKeydown(event: KeyboardEvent): void {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement)) return

  const editorRoot = input.closest<HTMLElement>('.cm-editor')
  const view = EditorView.findFromDOM(input) ??
    (editorRoot ? EditorView.findFromDOM(editorRoot) : null)
  if (!view) return

  if (!handleTableInputKeydown(event, view, input)) return
  event.preventDefault()
  event.stopPropagation()
}

function areActiveTableCellsEqual(
  left: ActiveWysiwygTableCell | null,
  right: ActiveWysiwygTableCell | null
): boolean {
  return left?.tableFrom === right?.tableFrom &&
    left?.section === right?.section &&
    left?.rowIndex === right?.rowIndex &&
    left?.columnIndex === right?.columnIndex &&
    left?.selectionStart === right?.selectionStart &&
    left?.selectionEnd === right?.selectionEnd
}

function resolveActiveTableCellFromSelection(
  state: Pick<EditorView['state'], 'selection'>,
  tables: readonly MarkdownTableBlock[]
): ActiveWysiwygTableCell | null {
  const selection = state.selection.main
  const table = tables.find((candidate) => selection.head >= candidate.from && selection.head <= candidate.to)
  if (!table) return null

  const location = resolveNearestTableCellLocation(table, selection.head)
  const cell = location ? resolveTableCell(table, location) : null
  if (!location || !cell) return null

  const rawSelectionStart = Math.max(0, Math.min(selection.from - cell.editAnchor, cell.editHead - cell.editAnchor))
  const rawSelectionEnd = Math.max(0, Math.min(selection.to - cell.editAnchor, cell.editHead - cell.editAnchor))

  return {
    tableFrom: table.from,
    ...location,
    selectionStart: resolveDecodedTableCellOffset(cell.text, rawSelectionStart),
    selectionEnd: resolveDecodedTableCellOffset(cell.text, rawSelectionEnd),
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

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform)
}

function hasPrimaryHistoryModifier(event: KeyboardEvent, mac = isMacPlatform()): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function matchesWysiwygUndoShortcut(event: KeyboardEvent, mac = isMacPlatform()): boolean {
  if (event.isComposing || event.altKey || event.shiftKey) return false
  if (!hasPrimaryHistoryModifier(event, mac)) return false
  return event.key.toLowerCase() === 'z'
}

function matchesWysiwygRedoShortcut(event: KeyboardEvent, mac = isMacPlatform()): boolean {
  if (event.isComposing || event.altKey) return false
  if (!hasPrimaryHistoryModifier(event, mac)) return false

  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey
  if (key === 'y') return !mac && !event.shiftKey
  return false
}

function dispatchWysiwygHistory(action: 'undo' | 'redo'): boolean {
  if (typeof document === 'undefined') return false
  document.dispatchEvent(new CustomEvent('editor:history', { detail: { action } }))
  return true
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

function collectWysiwygTableDecorationSpecs(
  doc: CodeMirrorState['doc'],
  tables: readonly MarkdownTableBlock[],
  activeTableCell: ActiveWysiwygTableCell | null
): DecorationSpec[] {
  const decorations: DecorationSpec[] = []

  for (const table of tables) {
    const openingLine = doc.lineAt(table.from)
    const closingLine = doc.lineAt(table.to)
    const activeTableCellForTable = activeTableCell?.tableFrom === table.from ? activeTableCell : null

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
      Decoration.replace({ widget: new TableWidget(table, activeTableCellForTable), block: true })
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

  return decorations
}

interface WysiwygTableDecorationState {
  decorations: DecorationSet
  tables: MarkdownTableBlock[]
}

function buildWysiwygTableDecorationState(state: CodeMirrorState): WysiwygTableDecorationState {
  const markdown = state.doc.toString()
  const fencedCodeBlocks = collectFencedCodeBlocks(markdown)
  const mathBlocks = collectMathBlocks(markdown, fencedCodeBlocks)
  const tables = collectMarkdownTableBlocks(markdown, [...fencedCodeBlocks, ...mathBlocks])
  const activeTableCell = resolveActiveTableCellFromSelection(state, tables)

  return {
    tables,
    decorations: buildSortedRangeSet(
      collectWysiwygTableDecorationSpecs(state.doc, tables, activeTableCell)
    ),
  }
}

const wysiwygTableDecorationField = StateField.define<WysiwygTableDecorationState>({
  create(state) {
    return buildWysiwygTableDecorationState(state)
  },
  update(value, transaction) {
    if (!transaction.docChanged && transaction.newSelection.eq(transaction.startState.selection)) {
      return value
    }

    return buildWysiwygTableDecorationState(transaction.state)
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
})

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

interface ResolvedTableCellTarget {
  table: MarkdownTableBlock
  cell: MarkdownTableBlock['header']['cells'][number]
  location: MarkdownTableCellLocation
  displayText: string
}

class WysiwygPluginValue {
  decorations: DecorationSet
  fencedCodeBlocks: FencedCodeBlock[]
  mathBlocks: MathBlock[]
  tables: MarkdownTableBlock[]
  activeTableCell: ActiveWysiwygTableCell | null

  constructor(view: EditorView) {
    this.fencedCodeBlocks = collectFencedCodeBlocks(view.state.doc.toString())
    this.mathBlocks = collectMathBlocks(view.state.doc.toString(), this.fencedCodeBlocks)
    this.tables = collectMarkdownTableBlocks(view.state.doc.toString(), [...this.fencedCodeBlocks, ...this.mathBlocks])
    this.activeTableCell = null
    this.syncActiveTableCell(view)
    this.syncTableEditingPresentation(view, null)
    this.decorations = safeBuildDecorations(
      view,
      this.fencedCodeBlocks,
      this.mathBlocks,
      this.tables
    )
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.fencedCodeBlocks = collectFencedCodeBlocks(update.state.doc.toString())
      this.mathBlocks = collectMathBlocks(update.state.doc.toString(), this.fencedCodeBlocks)
      this.tables = collectMarkdownTableBlocks(update.state.doc.toString(), [...this.fencedCodeBlocks, ...this.mathBlocks])
    }

    const previousActiveTableCell = this.activeTableCell
    this.syncActiveTableCell(update.view)
    this.syncTableEditingPresentation(update.view, previousActiveTableCell)
    const exitedTableEditing =
      previousActiveTableCell !== null &&
      this.activeTableCell === null &&
      update.selectionSet &&
      update.view.dom.ownerDocument.activeElement === update.view.dom.ownerDocument.body
    const focusedTableInput = getTableCellInputFromTarget(update.view.dom.ownerDocument.activeElement, update.view)
    const focusedActiveTableCell = focusedTableInput
      ? resolveActiveTableCellFromInput(update.view, focusedTableInput)
      : null
    const shouldRestoreActiveTableInputFocus =
      this.activeTableCell !== null &&
      update.selectionSet &&
      !areActiveTableCellsEqual(this.activeTableCell, focusedActiveTableCell)

    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      !areActiveTableCellsEqual(previousActiveTableCell, this.activeTableCell)
    ) {
      this.decorations = safeBuildDecorations(
        update.view,
        this.fencedCodeBlocks,
        this.mathBlocks,
        this.tables
      )
    }

    if (
      this.activeTableCell &&
      (
        !areActiveTableCellsEqual(previousActiveTableCell, this.activeTableCell) ||
        shouldRestoreActiveTableInputFocus
      )
    ) {
      queueFocusTableCellInput(update.view, this.activeTableCell)
    }
    if (exitedTableEditing) {
      restoreEditorFocusAfterTableExit(update.view)
    }
  }

  syncActiveTableCell(view: EditorView): void {
    const focusedInput = getTableCellInputFromTarget(view.dom.ownerDocument.activeElement, view)
    if (focusedInput) {
      const activeCell = resolveActiveTableCellFromInput(view, focusedInput)
      if (activeCell) {
        this.activeTableCell = activeCell
        return
      }
    }

    this.activeTableCell = resolveActiveTableCellFromSelection(view.state, this.tables)
  }

  syncTableEditingPresentation(
    view: EditorView,
    previousActiveTableCell: ActiveWysiwygTableCell | null
  ): void {
    view.dom.classList.toggle(TABLE_EDITING_CLASS, this.activeTableCell !== null)

    if (!this.activeTableCell) {
      if (previousActiveTableCell) {
        ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.delete(previousActiveTableCell.tableFrom)
      }
      return
    }

    if (
      previousActiveTableCell &&
      previousActiveTableCell.tableFrom !== this.activeTableCell.tableFrom
    ) {
      ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.delete(previousActiveTableCell.tableFrom)
    }
  }
}

function getWysiwygPluginState(view: EditorView): WysiwygPluginValue | null {
  return view.plugin(wysiwygPlugin)
}

function getTableCellInputFromTarget(target: EventTarget | null, view: EditorView): HTMLInputElement | null {
  const input = (target as HTMLElement | null)?.closest<HTMLInputElement>('.cm-wysiwyg-table__input')
  if (!input || !view.dom.contains(input)) return null
  return input
}

function resolveTableCellTargetFromElement(
  view: EditorView,
  element: HTMLElement | null
): ResolvedTableCellTarget | null {
  if (!element) return null

  const tableFrom = Number(element.dataset.tableFrom)
  const section = element.dataset.tableSection
  const rowIndex = Number(element.dataset.tableRowIndex)
  const columnIndex = Number(element.dataset.tableColumnIndex)
  if (!Number.isFinite(tableFrom) || !Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return null
  if (section !== 'head' && section !== 'body') return null

  const plugin = getWysiwygPluginState(view)
  if (!plugin) return null

  const table = plugin.tables.find((candidate) => candidate.from === tableFrom)
  if (!table) return null

  const location: MarkdownTableCellLocation = { section, rowIndex, columnIndex }
  const cell = resolveTableCell(table, location)
  if (!cell) return null

  return {
    table,
    cell,
    location,
    displayText: decodeMarkdownTableCellText(cell.text),
  }
}

function resolveActiveTableCellFromInput(
  view: EditorView,
  input: HTMLInputElement
): ActiveWysiwygTableCell | null {
  const resolved = resolveTableCellTargetFromElement(view, input)
  if (!resolved) return null

  return {
    tableFrom: resolved.table.from,
    ...resolved.location,
    selectionStart: input.selectionStart ?? resolved.displayText.length,
    selectionEnd: input.selectionEnd ?? resolved.displayText.length,
  }
}

function resolveEditorSelectionForTableCell(
  cell: ResolvedTableCellTarget['cell'],
  displayText: string,
  selectionStart: number,
  selectionEnd: number
): { anchor: number; head: number } {
  return {
    anchor: cell.editAnchor + resolveEncodedTableCellOffset(displayText, selectionStart),
    head: cell.editAnchor + resolveEncodedTableCellOffset(displayText, selectionEnd),
  }
}

function findTableCellInput(
  view: EditorView,
  activeCell: ActiveWysiwygTableCell
): HTMLInputElement | null {
  const selector =
    `.cm-wysiwyg-table__input` +
    `[data-table-from="${activeCell.tableFrom}"]` +
    `[data-table-section="${activeCell.section}"]` +
    `[data-table-row-index="${activeCell.rowIndex}"]` +
    `[data-table-column-index="${activeCell.columnIndex}"]`

  const input = view.dom.querySelector<HTMLInputElement>(selector)
  return input ?? null
}

function findTableCellElement(
  view: EditorView,
  activeCell: ActiveWysiwygTableCell
): HTMLTableCellElement | null {
  const baseSelector =
    activeCell.section === 'head'
      ? '.cm-wysiwyg-table__head-cell'
      : '.cm-wysiwyg-table__cell'
  const selector =
    `${baseSelector}` +
    `[data-table-from="${activeCell.tableFrom}"]` +
    `[data-table-section="${activeCell.section}"]` +
    `[data-table-row-index="${activeCell.rowIndex}"]` +
    `[data-table-column-index="${activeCell.columnIndex}"]`

  const element = view.dom.querySelector<HTMLTableCellElement>(selector)
  return element ?? null
}

function queueFocusTableCellInput(
  view: EditorView,
  activeCell: ActiveWysiwygTableCell
): void {
  const focusInput = () => {
    const plugin = getWysiwygPluginState(view)
    if (!plugin) return

    const selectionActiveCell = resolveActiveTableCellFromSelection(view.state, plugin.tables)
    if (
      !areActiveTableCellsEqual(plugin.activeTableCell, activeCell) &&
      !areActiveTableCellsEqual(selectionActiveCell, activeCell)
    ) {
      return
    }

    const input = findTableCellInput(view, activeCell)
    if (!input) return

    input.focus({ preventScroll: true })
    syncTextInputSelection(input, activeCell.selectionStart, activeCell.selectionEnd)
  }

  focusInput()
  setTimeout(focusInput, 0)
  setTimeout(focusInput, 24)
  setTimeout(focusInput, 96)
  requestAnimationFrame(focusInput)
  requestAnimationFrame(() => requestAnimationFrame(focusInput))
}

function queueActivateTableCellInput(
  view: EditorView,
  activeCell: ActiveWysiwygTableCell
): void {
  const activateCell = () => {
    const plugin = getWysiwygPluginState(view)
    if (!plugin) return

    const selectionActiveCell = resolveActiveTableCellFromSelection(view.state, plugin.tables)
    if (!areActiveTableCellsEqual(selectionActiveCell, activeCell)) return

    const input = findTableCellInput(view, activeCell)
    if (input) {
      input.focus({ preventScroll: true })
      syncTextInputSelection(input, activeCell.selectionStart, activeCell.selectionEnd)
      return
    }

    const cell = findTableCellElement(view, activeCell)
    if (cell) {
      activateTable(view, cell)
    }
  }

  activateCell()
  setTimeout(activateCell, 0)
  setTimeout(activateCell, 24)
  setTimeout(activateCell, 96)
  requestAnimationFrame(activateCell)
  requestAnimationFrame(() => requestAnimationFrame(activateCell))
}

function restoreEditorFocusAfterTableExit(view: EditorView): void {
  const focusView = () => {
    if (!view.dom.isConnected) return
    view.focus()
  }

  focusView()
  setTimeout(focusView, 0)
  requestAnimationFrame(() => requestAnimationFrame(focusView))
}

function activateTable(view: EditorView, target: EventTarget | null): boolean {
  const input = getTableCellInputFromTarget(target, view)
  if (input) {
    return syncTableInputSelection(view, input)
  }

  const tableTarget =
    (target as HTMLElement | null)?.closest<HTMLElement>('[data-table-from][data-table-section][data-table-column-index]') ??
    null
  const resolved = resolveTableCellTargetFromElement(view, tableTarget)
  if (!resolved) return false

  const columnWidths = readRenderedTableColumnWidths(tableTarget)
  if (columnWidths) {
    ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.set(resolved.table.from, columnWidths)
  }

  const plugin = getWysiwygPluginState(view)
  if (!plugin) return false

  const nextActiveTableCell: ActiveWysiwygTableCell = {
    tableFrom: resolved.table.from,
    ...resolved.location,
    selectionStart: resolved.displayText.length,
    selectionEnd: resolved.displayText.length,
  }
  plugin.activeTableCell = nextActiveTableCell

  view.dispatch({
    selection: resolveEditorSelectionForTableCell(
      resolved.cell,
      resolved.displayText,
      nextActiveTableCell.selectionStart,
      nextActiveTableCell.selectionEnd
    ),
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  queueFocusTableCellInput(view, nextActiveTableCell)
  return true
}

function syncTableInputSelection(view: EditorView, input: HTMLInputElement): boolean {
  const resolved = resolveTableCellTargetFromElement(view, input)
  const plugin = getWysiwygPluginState(view)
  if (!resolved || !plugin) return false

  const selectionStart = input.selectionStart ?? resolved.displayText.length
  const selectionEnd = input.selectionEnd ?? resolved.displayText.length
  const nextActiveTableCell: ActiveWysiwygTableCell = {
    tableFrom: resolved.table.from,
    ...resolved.location,
    selectionStart,
    selectionEnd,
  }
  plugin.activeTableCell = nextActiveTableCell

  const nextSelection = resolveEditorSelectionForTableCell(
    resolved.cell,
    input.value,
    selectionStart,
    selectionEnd
  )
  const currentSelection = view.state.selection.main
  if (currentSelection.anchor === nextSelection.anchor && currentSelection.head === nextSelection.head) {
    return true
  }

  view.dispatch({
    selection: nextSelection,
    userEvent: 'select.pointer',
  })
  return true
}

function applyTableInputChange(view: EditorView, input: HTMLInputElement): boolean {
  const resolved = resolveTableCellTargetFromElement(view, input)
  const plugin = getWysiwygPluginState(view)
  if (!resolved || !plugin) return false

  const selectionStart = input.selectionStart ?? input.value.length
  const selectionEnd = input.selectionEnd ?? input.value.length
  const nextActiveTableCell: ActiveWysiwygTableCell = {
    tableFrom: resolved.table.from,
    ...resolved.location,
    selectionStart,
    selectionEnd,
  }
  plugin.activeTableCell = nextActiveTableCell

  const encodedValue = encodeMarkdownTableCellText(input.value)
  const nextSelection = resolveEditorSelectionForTableCell(
    resolved.cell,
    input.value,
    selectionStart,
    selectionEnd
  )
  const currentSelection = view.state.selection.main
  const hasContentChange = encodedValue !== resolved.cell.text

  if (!hasContentChange && currentSelection.anchor === nextSelection.anchor && currentSelection.head === nextSelection.head) {
    return true
  }

  view.dispatch({
    changes: hasContentChange
      ? { from: resolved.cell.editAnchor, to: resolved.cell.editHead, insert: encodedValue }
      : undefined,
    selection: nextSelection,
    userEvent: 'input.type',
  })
  if (hasContentChange) {
    queueFocusTableCellInput(view, nextActiveTableCell)
  }
  return true
}

function buildActiveTableCell(
  tableFrom: number,
  location: MarkdownTableCellLocation,
  selectionStart: number,
  selectionEnd: number
): ActiveWysiwygTableCell {
  return {
    tableFrom,
    ...location,
    selectionStart,
    selectionEnd,
  }
}

function resolveTableCellSelection(
  input: HTMLInputElement,
  displayText: string,
  selectionBehavior: WysiwygTableCellSelectionBehavior
): Pick<ActiveWysiwygTableCell, 'selectionStart' | 'selectionEnd'> {
  switch (selectionBehavior) {
    case 'start':
      return { selectionStart: 0, selectionEnd: 0 }
    case 'end':
      return { selectionStart: displayText.length, selectionEnd: displayText.length }
    case 'preserve': {
      const currentSelectionStart = input.selectionStart ?? input.value.length
      const currentSelectionEnd = input.selectionEnd ?? input.value.length
      return {
        selectionStart: Math.min(currentSelectionStart, displayText.length),
        selectionEnd: Math.min(currentSelectionEnd, displayText.length),
      }
    }
  }
}

function resolveTableKeyCommand(event: KeyboardEvent): WysiwygTableKeyCommand | null {
  if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return event.shiftKey ? 'shift-tab' : 'tab'
  }

  if (event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'arrow-up'
  }

  if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'arrow-down'
  }

  if (event.key !== 'Enter' || event.metaKey) return null
  if (event.shiftKey) return 'shift-enter'
  if (event.ctrlKey) return 'ctrl-enter'
  return 'enter'
}

function isPlainBackspaceForEmptyTableCell(event: KeyboardEvent, input: HTMLInputElement): boolean {
  return event.key === 'Backspace' &&
    input.value.length === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
}

function focusTableCellFromKeyboardAction(
  view: EditorView,
  input: HTMLInputElement,
  resolved: ResolvedTableCellTarget,
  location: MarkdownTableCellLocation,
  selectionBehavior: WysiwygTableCellSelectionBehavior
): boolean {
  const nextCell = resolveTableCell(resolved.table, location)
  if (!nextCell) return false

  const nextDisplayText = decodeMarkdownTableCellText(nextCell.text)
  const selection = resolveTableCellSelection(input, nextDisplayText, selectionBehavior)
  const nextActiveTableCell = buildActiveTableCell(
    resolved.table.from,
    location,
    selection.selectionStart,
    selection.selectionEnd
  )

  input.blur()
  view.dispatch({
    selection: resolveEditorSelectionForTableCell(
      nextCell,
      nextDisplayText,
      nextActiveTableCell.selectionStart,
      nextActiveTableCell.selectionEnd
    ),
    userEvent: 'select',
    scrollIntoView: true,
  })
  queueFocusTableCellInput(view, nextActiveTableCell)
  return true
}

function insertTableBodyRowBelow(
  view: EditorView,
  input: HTMLInputElement,
  resolved: ResolvedTableCellTarget,
  plan: WysiwygTableRowInsertionPlan
): boolean {
  const nextActiveTableCell = buildActiveTableCell(resolved.table.from, plan.focusLocation, 0, 0)

  input.blur()
  view.dispatch({
    changes: { from: plan.insertFrom, to: plan.insertFrom, insert: plan.insertText },
    selection: { anchor: plan.focusAnchor },
    userEvent: 'input',
    scrollIntoView: true,
  })
  queueActivateTableCellInput(view, nextActiveTableCell)
  return true
}

function insertInlineBreakInTableCell(
  view: EditorView,
  input: HTMLInputElement,
  resolved: ResolvedTableCellTarget,
  insertText: string
): boolean {
  const selectionStart = input.selectionStart ?? resolved.displayText.length
  const selectionEnd = input.selectionEnd ?? resolved.displayText.length
  const nextDisplayText =
    `${resolved.displayText.slice(0, selectionStart)}${insertText}${resolved.displayText.slice(selectionEnd)}`
  const nextSelectionOffset = selectionStart + insertText.length
  const nextActiveTableCell = buildActiveTableCell(
    resolved.table.from,
    resolved.location,
    nextSelectionOffset,
    nextSelectionOffset
  )

  input.blur()
  view.dispatch({
    changes: {
      from: resolved.cell.editAnchor,
      to: resolved.cell.editHead,
      insert: encodeMarkdownTableCellText(nextDisplayText),
    },
    selection: resolveEditorSelectionForTableCell(
      resolved.cell,
      nextDisplayText,
      nextSelectionOffset,
      nextSelectionOffset
    ),
    userEvent: 'input.type',
  })
  queueFocusTableCellInput(view, nextActiveTableCell)
  return true
}

function exitTableFromKeyboardAction(
  view: EditorView,
  input: HTMLInputElement,
  resolved: ResolvedTableCellTarget
): boolean {
  const doc = view.state.doc
  const tableClosingLine = doc.lineAt(resolved.table.to)

  input.blur()
  if (tableClosingLine.number === doc.lines && !hasTerminalBlankLine(doc)) {
    view.dispatch({
      changes: { from: doc.length, insert: '\n' },
      selection: { anchor: doc.length + 1 },
      userEvent: 'input',
      scrollIntoView: true,
    })
    return true
  }

  view.dispatch({
    selection: { anchor: Math.min(resolved.table.to + 1, doc.length) },
    userEvent: 'select',
    scrollIntoView: true,
  })
  return true
}

function applyTableKeyCommand(
  view: EditorView,
  input: HTMLInputElement,
  command: WysiwygTableKeyCommand
): boolean {
  const resolved = resolveTableCellTargetFromElement(view, input)
  if (!resolved) return false

  const action = resolveTableKeyAction(resolved.table, resolved.location, command)
  if (!action) return false

  switch (action.kind) {
    case 'focus-cell':
      return focusTableCellFromKeyboardAction(view, input, resolved, action.location, action.selectionBehavior)
    case 'insert-body-row-below':
      return insertTableBodyRowBelow(view, input, resolved, action.plan)
    case 'insert-inline-break':
      return insertInlineBreakInTableCell(view, input, resolved, action.insertText)
    case 'noop':
      return true
    case 'exit-table':
      return exitTableFromKeyboardAction(view, input, resolved)
  }
}

function handleTableInputKeydown(
  event: KeyboardEvent,
  view: EditorView,
  input: HTMLInputElement
): boolean {
  if (event.isComposing) return false

  if (matchesWysiwygUndoShortcut(event)) {
    dispatchWysiwygHistory('undo')
    return true
  }

  if (matchesWysiwygRedoShortcut(event)) {
    dispatchWysiwygHistory('redo')
    return true
  }

  if (isPlainBackspaceForEmptyTableCell(event, input)) {
    return applyTableKeyCommand(view, input, 'backspace')
  }

  const command = resolveTableKeyCommand(event)
  if (!command) return false
  return applyTableKeyCommand(view, input, command)
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
  WysiwygPluginValue,
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (getTableCellInputFromTarget(event.target, view)) return false
        if (activateTable(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (!activateMathTarget(view, event.target)) return false
        event.preventDefault()
        return true
      },
      click(event, view) {
        if (getTableCellInputFromTarget(event.target, view)) return false
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
      input(event, view) {
        const input = getTableCellInputFromTarget(event.target, view)
        if (!input) return false
        return applyTableInputChange(view, input)
      },
      focusin(event, view) {
        const input = getTableCellInputFromTarget(event.target, view)
        if (!input) return false
        return syncTableInputSelection(view, input)
      },
      mouseup(event, view) {
        const input = getTableCellInputFromTarget(event.target, view)
        if (!input) return false
        return syncTableInputSelection(view, input)
      },
      keyup(event, view) {
        const input = getTableCellInputFromTarget(event.target, view)
        if (!input) return false
        return syncTableInputSelection(view, input)
      },
      keydown(event, view) {
        const input = getTableCellInputFromTarget(event.target, view)
        if (input) {
          if (!handleTableInputKeydown(event, view, input)) return false
          event.preventDefault()
          return true
        }

        if (event.key !== ' ' && event.key !== 'Enter') return false
        if (!toggleTaskCheckbox(view, event.target)) return false
        event.preventDefault()
        return true
      },
    },
  }
)

export const wysiwygTableDecorations = [wysiwygTableDecorationField]

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
    padding: '0 32px !important',
    lineHeight: '1.15',
    fontSize: 'inherit',
  },
  '.cm-wysiwyg-table': {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'text',
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-table__surface': {
    margin: '0 32px',
    overflowX: 'auto',
    borderRadius: '0',
    border: 'none',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    pointerEvents: 'auto',
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
  '.cm-wysiwyg-table__head-cell:empty::before, .cm-wysiwyg-table__cell:empty::before': {
    content: '"\\00a0"',
    display: 'block',
    visibility: 'hidden',
  },
  '.cm-wysiwyg-table__line-break-marker': {
    display: 'block',
    whiteSpace: 'nowrap',
    color: 'color-mix(in srgb, var(--text-muted) 72%, var(--bg-primary))',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.92em',
    fontWeight: '500',
    lineHeight: '1.6',
    letterSpacing: '0.01em',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  '.cm-wysiwyg-table__cell--active': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 7%, var(--bg-primary))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent)',
  },
  '.cm-wysiwyg-table-editing .cm-cursor, .cm-wysiwyg-table-editing .cm-dropCursor': {
    opacity: '0',
    borderLeftColor: 'transparent !important',
  },
  '.cm-wysiwyg-table-editing .cm-selectionBackground': {
    backgroundColor: 'transparent !important',
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
  '.cm-wysiwyg-table__input': {
    display: 'block',
    width: '100%',
    minWidth: '0',
    maxWidth: '100%',
    padding: '0',
    margin: '0',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    lineHeight: 'inherit',
    textAlign: 'inherit',
    boxSizing: 'border-box',
    boxShadow: 'none',
  },
  '.cm-wysiwyg-table__input::selection': {
    backgroundColor: 'var(--editor-selection)',
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
