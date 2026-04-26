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
  GutterMarker,
  gutterLineClass,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { RangeSet, RangeSetBuilder, StateField, type EditorState as CodeMirrorState } from '@codemirror/state'
import katex from 'katex'
import { ensureKatexStylesheet } from '../../lib/katexStylesheet.ts'
import { collectFencedCodeBlocks, type FencedCodeBlock } from './fencedCodeRanges.ts'
import { collectMathBlocks, type MathBlock } from './mathBlockRanges.ts'
import { buildSortedRangeSet, type RangeSpec } from './sortedRangeSet.ts'
import { getTaskCheckboxChange } from './taskCheckbox.ts'
import { collectMarkdownTableBlocks, type MarkdownTableBlock } from './tableBlockRanges.ts'
import { collectWysiwygBlockquoteLines } from './wysiwygBlockquote.ts'
import { collectInlineCodeRanges, findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'
import {
  findInlineBoldItalicRanges,
  findInlineItalicRanges,
  type InlineBoldItalicRange,
} from './wysiwygInlineEmphasis.ts'
import { collectInlineLiteralEscapeRanges, hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { collectInlineMediaRanges } from './wysiwygInlineMedia.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'
import { renderInlineMarkdownFragment } from './wysiwygInlineMarkdown.ts'
import { collectInlineHardBreakTokens } from './wysiwygHardBreak.ts'
import { collectReferenceDefinitionMarkdown } from './wysiwygReferenceLinks.ts'
import { findInlineSubscriptRanges } from './wysiwygSubscript.ts'
import { findInlineStrikethroughRanges } from './wysiwygStrikethrough.ts'
import { findInlineSuperscriptRanges } from './wysiwygSuperscript.ts'
import { isThematicBreakLine } from './thematicBreak.ts'
import {
  findInlineFootnoteRanges,
  findBlockFootnoteRanges,
  InlineFootnoteWidget,
  BlockFootnoteTagWidget,
  collectFootnoteIndices
} from './wysiwygFootnote.ts'
import {
  collectWysiwygCodeBlockDecorations,
  isRenderableWysiwygMermaidCodeBlock,
  type WysiwygDecorationView,
} from './wysiwygCodeBlock.ts'
import { collectInactiveWysiwygMathBlocks } from './wysiwygMathBlock.ts'
import {
  collectInactiveWysiwygDetailsBlocks,
  collectWysiwygDetailsBlocks,
  renderWysiwygDetailsMarkdown,
  type WysiwygDetailsBlock,
} from './wysiwygDetails.ts'
import { detectDocumentLanguage, resolveDocumentSpellcheckConfig } from '../../lib/documentLanguage.ts'
import { hasTerminalBlankLine } from '../../lib/editorTerminalBlankLine.ts'
import { stripFrontMatter, type FrontMatterMeta } from '../../lib/markdownShared.ts'
import { rewriteRenderedHtmlImageSources } from '../../lib/renderedImageSources.ts'
import { loadLocalPreviewImage } from '../../lib/previewLocalImage.ts'
import { rewritePreviewHtmlLocalImages } from '../../lib/previewLocalImages.ts'
import { loadExternalPreviewImage } from '../../lib/previewRemoteImage.ts'
import { rewritePreviewHtmlExternalImages } from '../../lib/previewExternalImages.ts'
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
  resolveInsertTableRow,
  resolveInsertTableColumn,
  resolveDeleteTableRow,
  resolveDeleteTableColumn,
  resolveSetTableColumnAlignment,
  type TableStructuralEditPlan,
} from './wysiwygTable.ts'
import { convertClipboardToMarkdownTable } from './tablePasteConverter.ts'
import type { TableAlignment } from './tableBlockRanges.ts'
import i18n from '../../i18n/index.ts'
import { useEditorStore } from '../../store/editor'

// ── Widgets ────────────────────────────────────────────────────────────────

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-wysiwyg-hr'
    const rule = document.createElement('div')
    rule.className = 'cm-wysiwyg-hr__rule'
    el.appendChild(rule)
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
    el.setAttribute('aria-keyshortcuts', 'Enter Space')
    el.setAttribute('role', 'button')
    el.tabIndex = 0
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
    el.setAttribute('aria-keyshortcuts', 'Enter Space')
    el.setAttribute('role', 'button')
    el.tabIndex = 0

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

class DetailsWidget extends WidgetType {
  private readonly detailsBlock: WysiwygDetailsBlock
  private readonly context: WysiwygDocumentContext

  constructor(detailsBlock: WysiwygDetailsBlock, context: WysiwygDocumentContext) {
    super()
    this.detailsBlock = detailsBlock
    this.context = context
  }

  toDOM() {
    const details = document.createElement('div')
    syncDetailsWidgetDom(details, this.detailsBlock, this.context)
    return details
  }

  updateDOM(dom: HTMLElement) {
    if (!(dom instanceof HTMLElement)) return false
    syncDetailsWidgetDom(dom, this.detailsBlock, this.context)
    return true
  }

  ignoreEvent() { return false }

  eq(other: DetailsWidget) {
    return this.detailsBlock.open === other.detailsBlock.open &&
      this.detailsBlock.summaryMarkdown === other.detailsBlock.summaryMarkdown &&
      this.detailsBlock.bodyMarkdown === other.detailsBlock.bodyMarkdown &&
      this.detailsBlock.editAnchor === other.detailsBlock.editAnchor &&
      this.context.documentPath === other.context.documentPath &&
      JSON.stringify(this.context.frontMatter) === JSON.stringify(other.context.frontMatter) &&
      this.context.referenceDefinitionsMarkdown === other.context.referenceDefinitionsMarkdown
  }
}

class TableWidget extends WidgetType {
  private readonly table: MarkdownTableBlock
  private readonly activeCell: ActiveWysiwygTableCell | null
  private readonly spellcheckConfig: WysiwygSpellcheckConfig

  constructor(
    table: MarkdownTableBlock,
    activeCell: ActiveWysiwygTableCell | null,
    spellcheckConfig: WysiwygSpellcheckConfig
  ) {
    super()
    this.table = table
    this.activeCell = activeCell
    this.spellcheckConfig = spellcheckConfig
  }

  toDOM() {
    const wrapper = document.createElement('div')
    syncTableWidgetDom(wrapper, this.table, this.activeCell, this.spellcheckConfig)
    return wrapper
  }

  updateDOM(dom: HTMLElement) {
    syncTableWidgetDom(dom, this.table, this.activeCell, this.spellcheckConfig)
    return true
  }

  ignoreEvent() { return false }

  eq(other: TableWidget) {
    return JSON.stringify(this.table) === JSON.stringify(other.table) &&
      areActiveTableCellsEqual(this.activeCell, other.activeCell) &&
      this.spellcheckConfig.spellcheck === other.spellcheckConfig.spellcheck &&
      this.spellcheckConfig.lang === other.spellcheckConfig.lang
  }
}

const ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS = new Map<number, readonly number[]>()
const TABLE_EDITING_CLASS = 'cm-wysiwyg-table-editing'
const NUMERIC_CELL_RE = /^[+\-]?(?:[$€£¥₹]\s*)?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%?$/u

type TableToolbarAction =
  | { kind: 'insert-row'; position: 'above' | 'below' }
  | { kind: 'insert-column'; side: 'left' | 'right' }
  | { kind: 'delete-row' }
  | { kind: 'delete-column' }
  | { kind: 'set-alignment'; alignment: TableAlignment }

type TableToolbarIcon =
  | 'insertRowAbove'
  | 'insertRowBelow'
  | 'insertColumnLeft'
  | 'insertColumnRight'
  | 'deleteRow'
  | 'deleteColumn'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignDefault'

interface TableToolbarButtonSpec {
  actionId: string
  labelKey: string
  icon: TableToolbarIcon
  action: TableToolbarAction
  alignment?: TableAlignment
}

const TABLE_TOOLBAR_BUTTONS: readonly TableToolbarButtonSpec[] = [
  { actionId: 'insert-row-above', labelKey: 'wysiwygTable.insertRowAbove', icon: 'insertRowAbove', action: { kind: 'insert-row', position: 'above' } },
  { actionId: 'insert-row-below', labelKey: 'wysiwygTable.insertRowBelow', icon: 'insertRowBelow', action: { kind: 'insert-row', position: 'below' } },
  { actionId: 'insert-column-left', labelKey: 'wysiwygTable.insertColumnLeft', icon: 'insertColumnLeft', action: { kind: 'insert-column', side: 'left' } },
  { actionId: 'insert-column-right', labelKey: 'wysiwygTable.insertColumnRight', icon: 'insertColumnRight', action: { kind: 'insert-column', side: 'right' } },
  { actionId: 'delete-row', labelKey: 'wysiwygTable.deleteRow', icon: 'deleteRow', action: { kind: 'delete-row' } },
  { actionId: 'delete-column', labelKey: 'wysiwygTable.deleteColumn', icon: 'deleteColumn', action: { kind: 'delete-column' } },
  { actionId: 'align-left', labelKey: 'wysiwygTable.alignLeft', icon: 'alignLeft', action: { kind: 'set-alignment', alignment: 'left' }, alignment: 'left' },
  { actionId: 'align-center', labelKey: 'wysiwygTable.alignCenter', icon: 'alignCenter', action: { kind: 'set-alignment', alignment: 'center' }, alignment: 'center' },
  { actionId: 'align-right', labelKey: 'wysiwygTable.alignRight', icon: 'alignRight', action: { kind: 'set-alignment', alignment: 'right' }, alignment: 'right' },
  { actionId: 'align-default', labelKey: 'wysiwygTable.alignDefault', icon: 'alignDefault', action: { kind: 'set-alignment', alignment: null }, alignment: null },
]

const TABLE_TOOLBAR_SVG_NS = 'http://www.w3.org/2000/svg'

const TABLE_TOOLBAR_ICON_PATHS: Record<TableToolbarIcon, string> = {
  insertRowAbove: 'M6 9h12v10H6z M6 14h12 M12 9v10 M10 5h4 M12 3v4',
  insertRowBelow: 'M6 5h12v10H6z M6 10h12 M12 5v10 M10 19h4 M12 17v4',
  insertColumnLeft: 'M9 6h10v12H9z M14 6v12 M9 12h10 M5 10v4 M3 12h4',
  insertColumnRight: 'M5 6h10v12H5z M10 6v12 M5 12h10 M19 10v4 M17 12h4',
  deleteRow: 'M6 8h12v11H6z M6 13h12 M12 8v11 M10 4h4',
  deleteColumn: 'M8 6h11v12H8z M13 6v12 M8 12h11 M3 12h4',
  alignLeft: 'M5 6h10 M5 10h14 M5 14h8 M5 18h12',
  alignCenter: 'M7 6h10 M5 10h14 M8 14h8 M6 18h12',
  alignRight: 'M9 6h10 M5 10h14 M11 14h8 M7 18h12',
  alignDefault: 'M5 7h14 M5 12h14 M5 17h14 M4 20L20 4',
}

function createTableToolbarIcon(icon: TableToolbarIcon): SVGSVGElement {
  const svg = document.createElementNS(TABLE_TOOLBAR_SVG_NS, 'svg') as SVGSVGElement
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.9')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const path = document.createElementNS(TABLE_TOOLBAR_SVG_NS, 'path') as SVGPathElement
  path.setAttribute('d', TABLE_TOOLBAR_ICON_PATHS[icon])
  svg.appendChild(path)

  return svg
}

function createTableToolbarDom(): HTMLDivElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'cm-wysiwyg-table__toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.dataset.wysiwygTableToolbar = 'true'

  TABLE_TOOLBAR_BUTTONS.forEach((spec) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `cm-wysiwyg-table__toolbar-button cm-wysiwyg-table__toolbar-button--${spec.actionId}`
    button.dataset.wysiwygTableAction = spec.actionId
    button.dataset.wysiwygTableIcon = spec.icon
    button.replaceChildren(createTableToolbarIcon(spec.icon))
    button.addEventListener('mousedown', preventTableToolbarBlur)
    button.addEventListener('click', handleTableToolbarClick)
    toolbar.appendChild(button)
  })

  return toolbar
}

function syncTableToolbarDom(
  toolbar: HTMLDivElement,
  table: MarkdownTableBlock,
  activeCell: ActiveWysiwygTableCell | null
): void {
  toolbar.hidden = activeCell === null
  toolbar.setAttribute('aria-label', i18n.t('wysiwygTable.toolbarLabel'))
  toolbar.dataset.tableFrom = String(table.from)

  const columnCount = table.header.cells.length
  const canDeleteColumn = columnCount > 2
  const canDeleteRow = activeCell !== null && activeCell.section === 'body' && table.rows.length > 0
  const activeColumnAlignment = activeCell ? table.alignments[activeCell.columnIndex] ?? null : null

  const children = toolbar.children
  TABLE_TOOLBAR_BUTTONS.forEach((spec, index) => {
    const button = children[index]
    if (!(button instanceof HTMLButtonElement)) return

    const label = i18n.t(spec.labelKey)
    button.title = label
    button.setAttribute('aria-label', label)

    let disabled = false
    if (spec.action.kind === 'delete-row') disabled = !canDeleteRow
    else if (spec.action.kind === 'delete-column') disabled = !canDeleteColumn

    button.disabled = disabled
    if (spec.alignment !== undefined) {
      button.setAttribute('aria-pressed', String(activeColumnAlignment === spec.alignment))
    } else {
      button.removeAttribute('aria-pressed')
    }
  })
}

function preventTableToolbarBlur(event: MouseEvent): void {
  event.preventDefault()
}

function handleTableToolbarClick(event: MouseEvent): void {
  const button = event.currentTarget
  if (!(button instanceof HTMLButtonElement) || button.disabled) return

  event.preventDefault()
  event.stopPropagation()

  const actionId = button.dataset.wysiwygTableAction
  const spec = TABLE_TOOLBAR_BUTTONS.find((entry) => entry.actionId === actionId)
  if (!spec) return

  const editorRoot = button.closest<HTMLElement>('.cm-editor')
  const view = editorRoot ? EditorView.findFromDOM(editorRoot) : null
  if (!view) return

  applyTableToolbarAction(view, button, spec.action)
}

function applyTableToolbarAction(
  view: EditorView,
  button: HTMLButtonElement,
  action: TableToolbarAction
): void {
  const plugin = getWysiwygPluginState(view)
  if (!plugin) return

  const activeCell = plugin.activeTableCell
  if (!activeCell) return

  const table = plugin.tables.find((entry) => entry.from === activeCell.tableFrom)
  if (!table) return

  const location: MarkdownTableCellLocation = {
    section: activeCell.section,
    rowIndex: activeCell.rowIndex,
    columnIndex: activeCell.columnIndex,
  }

  let plan: TableStructuralEditPlan | null = null
  switch (action.kind) {
    case 'insert-row':
      plan = resolveInsertTableRow(table, location, action.position)
      break
    case 'insert-column':
      plan = resolveInsertTableColumn(table, location, action.side)
      break
    case 'delete-row':
      plan = resolveDeleteTableRow(table, location)
      break
    case 'delete-column':
      plan = resolveDeleteTableColumn(table, location)
      break
    case 'set-alignment':
      plan = resolveSetTableColumnAlignment(table, location.columnIndex, action.alignment)
      break
  }

  if (!plan) return

  const nextActiveTableCell = buildActiveTableCell(table.from, plan.focusLocation, 0, 0)

  const focusedInput = button.closest<HTMLElement>('.cm-wysiwyg-table')?.querySelector<HTMLTextAreaElement>('.cm-wysiwyg-table__input')
  focusedInput?.blur()

  view.dispatch({
    changes: { from: plan.from, to: plan.to, insert: plan.insert },
    selection: { anchor: plan.from + plan.insert.length },
    userEvent: 'input',
    scrollIntoView: true,
  })
  queueActivateTableCellInput(view, nextActiveTableCell)
}

function pruneTableColumnWidthSnapshots(tables: readonly MarkdownTableBlock[]): void {
  if (ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.size === 0) return
  const alive = new Set(tables.map((table) => table.from))
  for (const key of ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.keys()) {
    if (!alive.has(key)) ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS.delete(key)
  }
}

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
  activeCell: ActiveWysiwygTableCell | null,
  spellcheckConfig: WysiwygSpellcheckConfig
): void {
  wrapper.className = 'cm-wysiwyg-table'
  wrapper.dataset.tableEditStart = String(table.editAnchor)
  wrapper.dataset.tableEditEnd = String(table.editAnchor)
  wrapper.dataset.tableFrom = String(table.from)
  wrapper.setAttribute('aria-label', 'Edit table')

  let toolbar = wrapper.firstElementChild
  if (!(toolbar instanceof HTMLDivElement) || !toolbar.classList.contains('cm-wysiwyg-table__toolbar')) {
    wrapper.replaceChildren()
    toolbar = createTableToolbarDom()
    wrapper.appendChild(toolbar)
  }
  syncTableToolbarDom(toolbar as HTMLDivElement, table, activeCell)

  let surface = toolbar.nextElementSibling
  if (!(surface instanceof HTMLDivElement) || !surface.classList.contains('cm-wysiwyg-table__surface')) {
    while (toolbar.nextSibling) wrapper.removeChild(toolbar.nextSibling)
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
  syncTableRowDom(thead, table, 'head', 0, table.header.cells, activeCell, spellcheckConfig)

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
    syncTableRowDom(tr, table, 'body', rowIndex, row.cells, activeCell, spellcheckConfig)
  })
}

function syncTableRowDom(
  rowContainer: HTMLTableSectionElement | HTMLTableRowElement,
  table: MarkdownTableBlock,
  section: 'head' | 'body',
  rowIndex: number,
  cells: ReadonlyArray<MarkdownTableBlock['header']['cells'][number]>,
  activeCell: ActiveWysiwygTableCell | null,
  spellcheckConfig: WysiwygSpellcheckConfig
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
      activeCell,
      spellcheckConfig
    )
  })
}

function syncTableCellDom(
  element: HTMLTableCellElement,
  table: MarkdownTableBlock,
  cell: MarkdownTableBlock['header']['cells'][number],
  location: MarkdownTableCellLocation,
  columnKind: 'text' | 'numeric',
  activeCell: ActiveWysiwygTableCell | null,
  spellcheckConfig: WysiwygSpellcheckConfig
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
    syncTableEditorInput(element, table, cell, location, activeCell, spellcheckConfig)
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
  activeCell: ActiveWysiwygTableCell,
  spellcheckConfig: WysiwygSpellcheckConfig
): void {
  let input = element.firstElementChild as HTMLTextAreaElement | null
  if (!(input instanceof HTMLTextAreaElement) || !input.classList.contains('cm-wysiwyg-table__input')) {
    element.replaceChildren()
    input = document.createElement('textarea')
    input.className = 'cm-wysiwyg-table__input'
    input.rows = 1
    input.wrap = 'soft'
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
  input.spellcheck = spellcheckConfig.spellcheck
  if (spellcheckConfig.lang) {
    input.setAttribute('lang', spellcheckConfig.lang)
  } else {
    input.removeAttribute('lang')
  }
  ensureTableInputKeydownBinding(input)
  syncTextInputSelection(input, activeCell.selectionStart, activeCell.selectionEnd)
  syncTableInputAutoHeight(input)
}

function syncTableInputAutoHeight(input: HTMLTextAreaElement): void {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight}px`
}

function syncTextInputSelection(
  input: HTMLTextAreaElement,
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

function ensureTableInputKeydownBinding(input: HTMLTextAreaElement): void {
  if (input.dataset.tableKeydownBound === 'true') return
  input.dataset.tableKeydownBound = 'true'
  input.addEventListener('keydown', handleNativeTableInputKeydown)
  input.addEventListener('paste', handleNativeTableInputPaste)
}

function handleNativeTableInputPaste(event: ClipboardEvent): void {
  const input = event.currentTarget
  if (!(input instanceof HTMLTextAreaElement)) return

  const clipboardText = event.clipboardData?.getData('text/plain')
  if (typeof clipboardText !== 'string' || clipboardText.length === 0) return

  event.preventDefault()
  const sanitized = sanitizeTableCellPasteText(clipboardText)
  const selectionStart = input.selectionStart ?? input.value.length
  const selectionEnd = input.selectionEnd ?? input.value.length
  const nextValue =
    `${input.value.slice(0, selectionStart)}${sanitized}${input.value.slice(selectionEnd)}`
  const nextCaret = selectionStart + sanitized.length

  input.value = nextValue
  try {
    input.setSelectionRange(nextCaret, nextCaret)
  } catch {
    // Selection restoration may fail on stale inputs; safe to ignore.
  }
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function sanitizeTableCellPasteText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t+/g, ' ')
}

function handleNativeTableInputKeydown(event: KeyboardEvent): void {
  const input = event.currentTarget
  if (!(input instanceof HTMLTextAreaElement)) return

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
    const el = document.createElement('span')
    el.className = `cm-wysiwyg-checkbox ${this.checked ? 'is-checked' : ''}`
    el.dataset.checkboxFrom = String(this.from)
    el.setAttribute('aria-label', this.label || 'Task')
    el.setAttribute('aria-keyshortcuts', 'Enter Space')
    el.setAttribute('role', 'checkbox')
    el.setAttribute('aria-checked', String(this.checked))
    el.tabIndex = 0
    
    // Create inner SVG checkmark
    el.innerHTML = `
      <svg viewBox="0 0 14 14" width="12" height="12" class="checkmark">
        <path d="M2.5 7L6 10.5L11.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `
    return el
  }
  ignoreEvent() { return false }
  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.from === other.from && this.label === other.label
  }
}

class ListBulletWidget extends WidgetType {
  private readonly depth: number

  constructor(depth: number) {
    super()
    this.depth = depth
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = `cm-wysiwyg-bullet-simple cm-wysiwyg-bullet-simple--${resolveUnorderedListMarkerKind(this.depth)}`
    el.setAttribute('aria-hidden', 'true')
    return el
  }

  ignoreEvent() { return true }

  eq(other: ListBulletWidget) {
    return this.depth === other.depth
  }
}

class OrderedListMarkerWidget extends WidgetType {
  private readonly marker: string

  constructor(marker: string) {
    super()
    this.marker = normalizeOrderedListMarker(marker)
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wysiwyg-ordered-number'
    el.textContent = this.marker
    el.setAttribute('aria-hidden', 'true')
    return el
  }

  ignoreEvent() { return true }

  eq(other: OrderedListMarkerWidget) {
    return this.marker === other.marker
  }
}

function normalizeOrderedListMarker(marker: string): string {
  const numberMatch = marker.match(/^(\d+)/)
  return numberMatch ? `${numberMatch[1]}.` : marker
}

function resolveUnorderedListMarkerKind(depth: number): 'disc' | 'circle' | 'square' {
  if (depth <= 0) return 'disc'
  if (depth === 1) return 'circle'
  return 'square'
}

function resolveListDepthFromIndent(indent: string): number {
  return Math.floor(indent.replace(/\t/g, '    ').length / 2)
}

function buildListIndentTerms(depth: number): string[] {
  return [
    PROSE_BLOCK_INSET,
    ...Array.from({ length: depth + 1 }, () => LIST_INDENT),
  ]
}

function buildWysiwygListTextInset(depth: number): string {
  return `calc(${buildListIndentTerms(depth).join(' + ')})`
}

type WysiwygListMarkerKind = 'ordered' | 'unordered'

function buildWysiwygListMarkerInset(depth: number, markerKind: WysiwygListMarkerKind): string {
  const markerGap = markerKind === 'ordered' ? LIST_ORDERED_MARKER_GAP : LIST_MARKER_GAP
  return `calc(${buildListIndentTerms(depth).join(' + ')} - ${markerGap})`
}

function buildWysiwygListLineStyle(depth: number, markerKind: WysiwygListMarkerKind): string {
  return [
    `--cm-wysiwyg-list-text-inset: ${buildWysiwygListTextInset(depth)}`,
    `--cm-wysiwyg-list-marker-inset: ${buildWysiwygListMarkerInset(depth, markerKind)}`,
  ].join('; ')
}

function parseWysiwygListLine(text: string): { depth: number; ordered: boolean } | null {
  const taskMatch = text.match(/^(\s*)([-*+]\s+\[(?: |x|X)\])(\s*)/)
  if (taskMatch) return null

  const listMatch = text.match(/^(\s*)([-*+]|\d+[.)])(\s+)/)
  if (!listMatch) return null

  return {
    depth: resolveListDepthFromIndent(listMatch[1]),
    ordered: /^\d/.test(listMatch[2]),
  }
}

function isWysiwygLooseListSpacerLine(doc: CodeMirrorState['doc'], lineNumber: number): boolean {
  if (lineNumber <= 1 || lineNumber >= doc.lines) return false

  const line = doc.line(lineNumber)
  if (line.text.trim().length > 0) return false

  return Boolean(
    parseWysiwygListLine(doc.line(lineNumber - 1).text) &&
    parseWysiwygListLine(doc.line(lineNumber + 1).text)
  )
}

class HardBreakWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('br')
    el.className = 'cm-wysiwyg-hard-break'
    el.setAttribute('aria-hidden', 'true')
    return el
  }

  ignoreEvent() { return true }
}

interface WysiwygDocumentContext {
  documentPath: string | null
  frontMatter: FrontMatterMeta
  referenceDefinitionsMarkdown: string
}

class InlineRenderedFragmentWidget extends WidgetType {
  private readonly markdown: string
  private readonly editAnchor: number
  private readonly kind: 'image' | 'linked-media'
  private readonly context: WysiwygDocumentContext

  constructor(
    markdown: string,
    editAnchor: number,
    kind: 'image' | 'linked-media',
    context: WysiwygDocumentContext
  ) {
    super()
    this.markdown = markdown
    this.editAnchor = editAnchor
    this.kind = kind
    this.context = context
  }

  toDOM() {
    const el = document.createElement('span')
    syncInlineRenderedFragmentDom(el, this.markdown, this.editAnchor, this.kind, this.context)
    return el
  }

  updateDOM(dom: HTMLElement) {
    syncInlineRenderedFragmentDom(dom, this.markdown, this.editAnchor, this.kind, this.context)
    return true
  }

  ignoreEvent() { return false }

  eq(other: InlineRenderedFragmentWidget) {
    return this.markdown === other.markdown &&
      this.editAnchor === other.editAnchor &&
      this.kind === other.kind &&
      this.context.documentPath === other.context.documentPath &&
      JSON.stringify(this.context.frontMatter) === JSON.stringify(other.context.frontMatter) &&
      this.context.referenceDefinitionsMarkdown === other.context.referenceDefinitionsMarkdown
  }
}

function resolveWysiwygDocumentContext(markdown: string): WysiwygDocumentContext {
  const store = useEditorStore.getState()
  const activeTab = (!store.activeTabId && store.tabs.length > 0
    ? store.tabs[0]
    : store.tabs.find((tab) => tab.id === store.activeTabId) ?? store.tabs[0]) ?? null
  const { meta, body } = stripFrontMatter(markdown)

  return {
    documentPath: activeTab?.path ?? null,
    frontMatter: meta,
    referenceDefinitionsMarkdown: collectReferenceDefinitionMarkdown(body),
  }
}

function syncInlineRenderedFragmentDom(
  wrapper: HTMLElement,
  markdown: string,
  editAnchor: number,
  kind: 'image' | 'linked-media',
  context: WysiwygDocumentContext
): void {
  wrapper.className = `cm-wysiwyg-inline-fragment cm-wysiwyg-inline-fragment--${kind}`
  wrapper.dataset.inlineFragmentEditAnchor = String(editAnchor)
  wrapper.dataset.inlineFragmentKind = kind
  wrapper.setAttribute('role', 'button')
  wrapper.setAttribute('aria-keyshortcuts', 'Enter Space')
  wrapper.setAttribute('aria-label', kind === 'image' ? 'Edit image' : 'Edit linked media')
  wrapper.tabIndex = 0
  wrapper.innerHTML = renderInlineRenderedFragmentHtml(markdown, context)
  hydrateInlineRenderedFragmentImages(wrapper, context)
}

function syncDetailsWidgetDom(
  details: HTMLElement,
  detailsBlock: WysiwygDetailsBlock,
  context: WysiwygDocumentContext
): void {
  const previousFrom = details.dataset.detailsFrom
  const previousTo = details.dataset.detailsTo
  const previousSourceOpen = details.dataset.detailsSourceOpen
  const nextFrom = String(detailsBlock.from)
  const nextTo = String(detailsBlock.to)
  const nextSourceOpen = String(detailsBlock.open)
  const preserveRuntimeOpen = previousFrom === nextFrom &&
    previousTo === nextTo &&
    previousSourceOpen === nextSourceOpen
  const nextOpen = preserveRuntimeOpen ? details.dataset.detailsOpen === 'true' : detailsBlock.open

  details.className = 'cm-wysiwyg-details'
  details.dataset.detailsEditAnchor = String(detailsBlock.editAnchor)
  details.dataset.detailsFrom = nextFrom
  details.dataset.detailsTo = nextTo
  details.dataset.detailsSourceOpen = nextSourceOpen
  details.setAttribute('role', 'group')
  details.setAttribute('aria-label', 'Details block')

  let summary = details.querySelector<HTMLElement>(':scope > .cm-wysiwyg-details__summary')
  if (!summary) {
    details.replaceChildren()
    summary = document.createElement('div')
    summary.className = 'cm-wysiwyg-details__summary'
    details.appendChild(summary)
  }

  let toggle = summary.querySelector<HTMLButtonElement>(':scope > .cm-wysiwyg-details__toggle')
  if (!toggle) {
    summary.replaceChildren()
    toggle = document.createElement('button')
    toggle.className = 'cm-wysiwyg-details__toggle'
    toggle.type = 'button'
    const icon = document.createElement('span')
    icon.className = 'cm-wysiwyg-details__toggle-icon'
    icon.setAttribute('aria-hidden', 'true')
    toggle.appendChild(icon)
    summary.appendChild(toggle)
  }

  let summaryContent = summary.querySelector<HTMLElement>(':scope > .cm-wysiwyg-details__summary-content')
  if (!summaryContent) {
    summaryContent = document.createElement('span')
    summaryContent.className = 'cm-wysiwyg-details__summary-content cm-wysiwyg-details__edit-target'
    summaryContent.setAttribute('role', 'button')
    summaryContent.setAttribute('aria-label', 'Edit details block')
    summaryContent.setAttribute('aria-keyshortcuts', 'Enter Space')
    summaryContent.tabIndex = 0
    summary.appendChild(summaryContent)
  }

  summaryContent.innerHTML = renderInlineMarkdownFragment(detailsBlock.summaryMarkdown || 'Details', {
    referenceDefinitionsMarkdown: context.referenceDefinitionsMarkdown,
  })

  let body = summary.nextElementSibling instanceof HTMLDivElement ? summary.nextElementSibling : null
  if (!body || !body.classList.contains('cm-wysiwyg-details__body')) {
    while (summary.nextSibling) details.removeChild(summary.nextSibling)
    body = document.createElement('div')
    body.className = 'cm-wysiwyg-details__body cm-wysiwyg-details__edit-target'
    details.appendChild(body)
  }

  body.innerHTML = renderDetailsBodyHtml(detailsBlock.bodyMarkdown, context)
  hydrateInlineRenderedFragmentImages(body, context)
  setDetailsWidgetOpen(details, nextOpen)
}

function setDetailsWidgetOpen(details: HTMLElement, open: boolean): void {
  details.dataset.detailsOpen = String(open)
  details.setAttribute('aria-expanded', String(open))

  const toggle = details.querySelector<HTMLButtonElement>(':scope .cm-wysiwyg-details__toggle')
  toggle?.setAttribute('aria-expanded', String(open))
  toggle?.setAttribute('aria-label', open ? 'Collapse details' : 'Expand details')

  const body = details.querySelector<HTMLElement>(':scope > .cm-wysiwyg-details__body')
  body?.setAttribute('aria-hidden', String(!open))
}

function renderDetailsBodyHtml(markdown: string, context: WysiwygDocumentContext): string {
  const previewOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const rendered = renderWysiwygDetailsMarkdown(markdown)
  const withResolvedRoots = rewriteRenderedHtmlImageSources(rendered, { frontMatter: context.frontMatter })
  const withLocalImages = rewritePreviewHtmlLocalImages(withResolvedRoots, { documentPath: context.documentPath })
  return rewritePreviewHtmlExternalImages(
    withLocalImages,
    {
      blockedLabel: i18n.t('preview.externalImageBlocked'),
      clickLabel: i18n.t('preview.externalImageClickToLoad'),
    },
    previewOrigin,
    {
      enableDirectExternalImageFallback: isTauriRuntime(),
    }
  )
}

function renderInlineRenderedFragmentHtml(markdown: string, context: WysiwygDocumentContext): string {
  const previewOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const rendered = renderInlineMarkdownFragment(markdown, {
    referenceDefinitionsMarkdown: context.referenceDefinitionsMarkdown,
  })
  const withResolvedRoots = rewriteRenderedHtmlImageSources(rendered, { frontMatter: context.frontMatter })
  const withLocalImages = rewritePreviewHtmlLocalImages(withResolvedRoots, { documentPath: context.documentPath })
  return rewritePreviewHtmlExternalImages(
    withLocalImages,
    {
      blockedLabel: i18n.t('preview.externalImageBlocked'),
      clickLabel: i18n.t('preview.externalImageClickToLoad'),
    },
    previewOrigin,
    {
      enableDirectExternalImageFallback: isTauriRuntime(),
    }
  )
}

function hydrateInlineRenderedFragmentImages(
  wrapper: HTMLElement,
  context: WysiwygDocumentContext
): void {
  const pendingLocalImages = Array.from(
    wrapper.querySelectorAll<HTMLImageElement>('img[data-local-src][data-local-image="pending"]')
  )

  for (const image of pendingLocalImages) {
    const localSource = image.dataset.localSrc
    if (!localSource) continue

    void loadLocalPreviewImage(localSource, context.documentPath)
      .then((resolvedSource) => {
        if (!resolvedSource || !image.isConnected) return
        applyResolvedInlineFragmentImage(image, resolvedSource)
        image.removeAttribute('data-local-src')
        image.removeAttribute('data-local-image')
        image.removeAttribute('data-local-placeholder')
      })
  }

  if (!isTauriRuntime()) return

  const pendingExternalImages = Array.from(wrapper.querySelectorAll<HTMLImageElement>('img[data-external-src]'))
  for (const image of pendingExternalImages) {
    const externalSource = image.dataset.externalSrc
    if (!externalSource) continue

    void loadExternalPreviewImage(externalSource)
      .then((resolvedSource) => {
        if (!resolvedSource || !image.isConnected) return
        applyResolvedInlineFragmentImage(image, resolvedSource)
        image.classList.remove('preview-external-image')
        image.removeAttribute('data-external-src')
        image.removeAttribute('data-external-host')
        image.removeAttribute('data-external-image')
        image.removeAttribute('data-external-placeholder')
        image.removeAttribute('tabindex')
        image.removeAttribute('role')
        image.removeAttribute('aria-label')
        image.removeAttribute('referrerpolicy')
      })
  }

  const pendingExternalFallbackImages = Array.from(
    wrapper.querySelectorAll<HTMLImageElement>('img[data-external-fallback-src]')
  )
  for (const image of pendingExternalFallbackImages) {
    const externalSource = image.dataset.externalFallbackSrc
    if (!externalSource) continue

    void loadExternalPreviewImage(externalSource)
      .then((resolvedSource) => {
        if (!resolvedSource || !image.isConnected) return
        applyResolvedInlineFragmentImage(image, resolvedSource)
        image.removeAttribute('data-external-fallback-src')
        image.removeAttribute('data-external-fallback-host')
        image.removeAttribute('data-external-fallback-state')
      })
  }
}

function applyResolvedInlineFragmentImage(image: HTMLImageElement, resolvedSource: string): void {
  image.src = resolvedSource
  image.removeAttribute('aria-busy')
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
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

function queueDetailsGapLineDecoration(
  decorations: DecorationSpec[],
  view: WysiwygDecorationView,
  lineNumber: number,
  queuedLineStarts: Set<number>
): void {
  const { doc } = view.state
  if (lineNumber < 1 || lineNumber > doc.lines) return

  const line = doc.line(lineNumber)
  if (line.text.trim().length > 0 || cursorIsOnLine(view, line.from, line.to)) return
  if (queuedLineStarts.has(line.from)) return
  queuedLineStarts.add(line.from)

  queueDecoration(
    decorations,
    line.from,
    line.from,
    Decoration.line({ attributes: { class: 'cm-wysiwyg-details-gap-line' } })
  )
}

export function buildWysiwygDecorations(
  view: WysiwygDecorationView,
  fencedCodeBlocks: readonly FencedCodeBlock[],
  mathBlocks: readonly MathBlock[],
  tables: readonly MarkdownTableBlock[],
  detailsBlocks: readonly WysiwygDetailsBlock[],
  footnoteIndices: Map<string, number>
): DecorationSet {
  // Mixed replace/mark decorations often start at the same position.
  // Collect first, then sort by CodeMirror's range ordering rules.
  const decorations: DecorationSpec[] = [...collectWysiwygCodeBlockDecorations(view, fencedCodeBlocks)]
  const { doc } = view.state
  const docText = doc.toString()
  const documentContext = resolveWysiwygDocumentContext(docText)
  const blockquoteLines = collectWysiwygBlockquoteLines(docText)
  let fenceIndex = 0
  let mathIndex = 0
  let tableIndex = 0
  let detailsIndex = 0
  const detailsGapLineStarts = new Set<number>()

  for (const detailsBlock of collectInactiveWysiwygDetailsBlocks(view, detailsBlocks)) {
    const openingLine = doc.lineAt(detailsBlock.from)
    const closingLine = doc.lineAt(detailsBlock.to)

    queueDetailsGapLineDecoration(decorations, view, openingLine.number - 1, detailsGapLineStarts)

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.from,
      Decoration.line({ attributes: { class: 'cm-wysiwyg-details-anchor-line' } })
    )

    queueDecoration(
      decorations,
      openingLine.from,
      openingLine.to,
      Decoration.replace({ widget: new DetailsWidget(detailsBlock, documentContext) })
    )

    let hiddenLineFrom = openingLine.to + 1
    while (hiddenLineFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(hiddenLineFrom)
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.from,
        Decoration.line({ attributes: { class: 'cm-wysiwyg-details-hidden-line' } })
      )
      queueDecoration(
        decorations,
        hiddenLine.from,
        hiddenLine.to,
        Decoration.replace({})
      )
      hiddenLineFrom = hiddenLine.to + 1
    }

    queueDetailsGapLineDecoration(decorations, view, closingLine.number + 1, detailsGapLineStarts)
  }

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
      while (detailsIndex < detailsBlocks.length && detailsBlocks[detailsIndex].to < lineFrom) {
        detailsIndex += 1
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

      const detailsBlock = detailsBlocks[detailsIndex]
      if (detailsBlock && lineFrom >= detailsBlock.from && lineFrom <= detailsBlock.to) {
        pos = line.to + 1
        continue
      }

      if (!onLine && isWysiwygLooseListSpacerLine(doc, line.number)) {
        queueDecoration(
          decorations,
          lineFrom,
          lineFrom,
          Decoration.line({ attributes: { class: 'cm-wysiwyg-list-spacer-line' } })
        )
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
      if (isThematicBreakLine(text)) {
        if (!onLine) {
          queueDecoration(
            decorations,
            lineFrom,
            lineFrom,
            Decoration.line({ attributes: { class: 'cm-wysiwyg-hr-anchor-line' } })
          )
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

      // ── Block Footnote Definitions ─────────────────────────────────────
      const blockFootnotes = findBlockFootnoteRanges(text)
      for (const fnRange of blockFootnotes) {
        if (!onLine) {
          queueDecoration(
            decorations,
            lineFrom + fnRange.from,
            lineFrom + fnRange.to,
            Decoration.replace({ widget: new BlockFootnoteTagWidget(fnRange.label, footnoteIndices.get(fnRange.label) ?? null, lineFrom + fnRange.from) })
          )
        } else {
          queueDecoration(
             decorations,
             lineFrom + fnRange.from,
             lineFrom + fnRange.to,
             Decoration.mark({ class: 'cm-wysiwyg-footnote-def-active' })
          )
        }
        // Advance pos to end of footnote label tag
        if (lineFrom + fnRange.to > pos) {
          pos = lineFrom + fnRange.to
        }
        break // only one block footnote definition at start of line
      }

      // ── Blockquote decoration ─────────────────────────────────────────
      const blockquoteLine = blockquoteLines.get(line.number)
      if (blockquoteLine) {
        const blockquoteLineClass = onLine
          ? 'cm-wysiwyg-blockquote-line cm-wysiwyg-blockquote-line-active'
          : 'cm-wysiwyg-blockquote-line'
        queueDecoration(
          decorations,
          lineFrom,
          lineFrom,
          Decoration.line({
            attributes: {
              class: blockquoteLineClass,
              style: `--cm-wysiwyg-blockquote-depth: ${blockquoteLine.depth};`,
            },
          })
        )
        if (onLine || !blockquoteLine.isEmpty) {
          queueDecoration(
            decorations,
            lineFrom,
            lineTo,
            Decoration.mark({ class: 'cm-wysiwyg-blockquote' })
          )
        }
        if (!onLine && blockquoteLine.prefix.length > 0) {
          queueDecoration(
            decorations,
            lineFrom,
            lineFrom + blockquoteLine.prefix.length,
            Decoration.replace({})
          )
        }
        pos = line.to + 1
        continue
      }

      // ── Lists and Task Lists ───────────────────────────────────────────
      const listMatch = text.match(/^(\s*)([-*+]|\d+[.)])(\s+)/)
      const taskMatch = text.match(/^(\s*)([-*+]\s+\[(?: |x|X)\])(\s*)/)

      if (listMatch && !taskMatch) {
        const indentSpan = listMatch[1]
        const marker = listMatch[2]
        const depth = resolveListDepthFromIndent(indentSpan)

        const prefixEnd = lineFrom + indentSpan.length + marker.length + listMatch[3].length
        const isOrdered = /^\d/.test(marker)

        // Obsidian-style live preview: reveal raw marker on the cursor line
        // so it is directly editable; render the decorated form otherwise.
        if (isOrdered && !onLine) {
          queueDecoration(
            decorations,
            lineFrom,
            lineFrom,
            Decoration.line({
              attributes: {
                class: 'cm-wysiwyg-list-line cm-wysiwyg-list-line--ordered',
                style: buildWysiwygListLineStyle(depth, 'ordered'),
              },
            })
          )
          queueDecoration(
            decorations,
            lineFrom,
            prefixEnd,
            Decoration.replace({ widget: new OrderedListMarkerWidget(marker) })
          )
        } else if (!onLine) {
          queueDecoration(
            decorations,
            lineFrom,
            lineFrom,
            Decoration.line({
              attributes: {
                class: 'cm-wysiwyg-list-line cm-wysiwyg-list-line--unordered',
                style: buildWysiwygListLineStyle(depth, 'unordered'),
              },
            })
          )
          queueDecoration(
            decorations,
            lineFrom,
            prefixEnd,
            Decoration.replace({ widget: new ListBulletWidget(depth) })
          )
        }
      }

      if (taskMatch) {
        const markerAndBox = taskMatch[2]
        const mStart = lineFrom + taskMatch[1].length
        const mEnd = mStart + markerAndBox.length // includes exactly the marker and the box

        // Parse the checked state from the match (e.g. "- [x]")
        const isChecked = /\[x\]/i.test(markerAndBox)
        const label = text.substring(mEnd).trim()

        // Obsidian-style live preview: render the widget when cursor is off
        // the line so click-to-toggle works; reveal raw "- [ ]" when the
        // cursor sits on the line so the source is editable.
        if (!onLine) {
          queueDecoration(
            decorations,
            mStart,
            mEnd,
            Decoration.replace({ widget: new CheckboxWidget(isChecked, mStart, label) })
          )
        } else {
          queueDecoration(
            decorations,
            mStart,
            mEnd,
            Decoration.mark({ class: 'cm-wysiwyg-task-marker' })
          )
        }

        // Keep completed tasks readable: mute the line, but do not add strikethrough.
        if (isChecked && label.length > 0) {
          queueDecoration(
            decorations,
            mEnd,
            line.to,
            Decoration.mark({ class: 'cm-wysiwyg-task-completed' })
          )
        }
      }

      // ── Inline patterns (bold, italic, highlight, code, strikethrough, links, math) ──
      // Only apply when NOT on the line containing the cursor
      if (!onLine) {
        processInlineMath(decorations, text, lineFrom)
        processInline(decorations, text, lineFrom, line.number < doc.lines, footnoteIndices, documentContext)
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
  tables: readonly MarkdownTableBlock[],
  detailsBlocks: readonly WysiwygDetailsBlock[],
  footnoteIndices: Map<string, number>
): DecorationSet {
  try {
    return buildWysiwygDecorations(view, fencedCodeBlocks, mathBlocks, tables, detailsBlocks, footnoteIndices)
  } catch {
    return Decoration.none
  }
}

class HiddenGutterMarker extends GutterMarker {
  elementClass = 'cm-wysiwyg-gutter-hidden'
}

class ReservedHiddenGutterMarker extends GutterMarker {
  elementClass = 'cm-wysiwyg-gutter-hidden-reserved'
}

const hiddenGutterMarker = new HiddenGutterMarker()
const reservedHiddenGutterMarker = new ReservedHiddenGutterMarker()

function stateSelectionTouchesRange(
  state: CodeMirrorState,
  from: number,
  to: number
): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from)
}

interface WysiwygStructuralBlocks {
  fencedCodeBlocks: FencedCodeBlock[]
  mathBlocks: MathBlock[]
  tables: MarkdownTableBlock[]
  detailsBlocks: WysiwygDetailsBlock[]
}

function collectWysiwygStructuralBlocks(markdown: string): WysiwygStructuralBlocks {
  const allFencedCodeBlocks = collectFencedCodeBlocks(markdown)
  const allMathBlocks = collectMathBlocks(markdown, allFencedCodeBlocks)
  const detailsBlocks = collectWysiwygDetailsBlocks(markdown, [
    ...allFencedCodeBlocks,
    ...allMathBlocks,
  ])
  const ignoredTableRanges = [
    ...allFencedCodeBlocks,
    ...allMathBlocks,
    ...detailsBlocks,
  ].sort((left, right) => left.from - right.from || left.to - right.to)

  return {
    fencedCodeBlocks: allFencedCodeBlocks.filter((block) => !rangeIntersectsAnyRange(block, detailsBlocks)),
    mathBlocks: allMathBlocks.filter((block) => !rangeIntersectsAnyRange(block, detailsBlocks)),
    tables: collectMarkdownTableBlocks(markdown, ignoredTableRanges),
    detailsBlocks,
  }
}

function rangeIntersectsAnyRange(range: { from: number; to: number }, ranges: readonly { from: number; to: number }[]): boolean {
  return ranges.some((candidate) => range.from <= candidate.to && range.to >= candidate.from)
}

function markDetailsGapGutterLine(
  state: CodeMirrorState,
  markers: Map<number, GutterMarker>,
  lineNumber: number
): void {
  const { doc } = state
  if (lineNumber < 1 || lineNumber > doc.lines) return

  const line = doc.line(lineNumber)
  if (line.text.trim().length > 0 || stateSelectionTouchesRange(state, line.from, line.to)) return
  if (!markers.has(line.from)) markers.set(line.from, hiddenGutterMarker)
}

function buildWysiwygGutterClasses(state: CodeMirrorState): RangeSet<GutterMarker> {
  const markdown = state.doc.toString()
  const { fencedCodeBlocks, mathBlocks, tables, detailsBlocks } = collectWysiwygStructuralBlocks(markdown)
  const { doc } = state
  const markers = new Map<number, GutterMarker>()
  const nonTextBlockRanges = [
    ...fencedCodeBlocks.map(({ from, to }) => ({ from, to })),
    ...mathBlocks.map(({ from, to }) => ({ from, to })),
    ...tables.map(({ from, to }) => ({ from, to })),
    ...detailsBlocks.map(({ from, to }) => ({ from, to })),
  ].sort((left, right) => left.from - right.from)

  for (const fence of fencedCodeBlocks) {
    if (stateSelectionTouchesRange(state, fence.from, fence.to)) continue

    if (isRenderableWysiwygMermaidCodeBlock(fence)) {
      const openingLine = doc.lineAt(fence.from)
      const closingLine = doc.lineAt(fence.to)
      let nextFrom = openingLine.to + 1
      while (nextFrom <= closingLine.to) {
        const hiddenLine = doc.lineAt(nextFrom)
        if (!markers.has(hiddenLine.from)) markers.set(hiddenLine.from, hiddenGutterMarker)
        nextFrom = hiddenLine.to + 1
      }
      continue
    }

    const closingFrom = fence.closingLineFrom
    if (closingFrom === null || closingFrom === undefined) continue
    markers.set(doc.lineAt(closingFrom).from, reservedHiddenGutterMarker)
  }

  for (const mathBlock of mathBlocks) {
    if (stateSelectionTouchesRange(state, mathBlock.from, mathBlock.to)) continue
    const openingLine = doc.lineAt(mathBlock.from)
    const closingLine = doc.lineAt(mathBlock.to)
    let nextFrom = openingLine.to + 1
    while (nextFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(nextFrom)
      if (!markers.has(hiddenLine.from)) markers.set(hiddenLine.from, hiddenGutterMarker)
      nextFrom = hiddenLine.to + 1
    }
  }

  for (const table of tables) {
    const openingLine = doc.lineAt(table.from)
    const closingLine = doc.lineAt(table.to)
    let nextFrom = openingLine.to + 1
    while (nextFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(nextFrom)
      if (!markers.has(hiddenLine.from)) markers.set(hiddenLine.from, hiddenGutterMarker)
      nextFrom = hiddenLine.to + 1
    }
  }

  for (const detailsBlock of detailsBlocks) {
    if (stateSelectionTouchesRange(state, detailsBlock.from, detailsBlock.to)) continue
    const openingLine = doc.lineAt(detailsBlock.from)
    const closingLine = doc.lineAt(detailsBlock.to)
    markDetailsGapGutterLine(state, markers, openingLine.number - 1)
    let nextFrom = openingLine.to + 1
    while (nextFrom <= closingLine.to) {
      const hiddenLine = doc.lineAt(nextFrom)
      if (!markers.has(hiddenLine.from)) markers.set(hiddenLine.from, hiddenGutterMarker)
      nextFrom = hiddenLine.to + 1
    }
    markDetailsGapGutterLine(state, markers, closingLine.number + 1)
  }

  let nonTextBlockIndex = 0
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)

    while (nonTextBlockIndex < nonTextBlockRanges.length && nonTextBlockRanges[nonTextBlockIndex].to < line.from) {
      nonTextBlockIndex += 1
    }

    const activeNonTextBlock = nonTextBlockRanges[nonTextBlockIndex]
    if (activeNonTextBlock && line.from >= activeNonTextBlock.from && line.from <= activeNonTextBlock.to) {
      continue
    }

    if (
      isWysiwygLooseListSpacerLine(doc, lineNumber) &&
      !stateSelectionTouchesRange(state, line.from, line.to)
    ) {
      if (!markers.has(line.from)) markers.set(line.from, hiddenGutterMarker)
      continue
    }

    if (!isThematicBreakLine(line.text) || stateSelectionTouchesRange(state, line.from, line.to)) {
      continue
    }

    if (!markers.has(line.from)) markers.set(line.from, hiddenGutterMarker)
  }

  if (markers.size === 0) return RangeSet.empty
  const sorted = [...markers.entries()].sort(([left], [right]) => left - right)
  const builder = new RangeSetBuilder<GutterMarker>()
  for (const [pos, marker] of sorted) {
    builder.add(pos, pos, marker)
  }
  return builder.finish()
}

function safeBuildGutterClasses(state: CodeMirrorState): RangeSet<GutterMarker> {
  try {
    return buildWysiwygGutterClasses(state)
  } catch {
    return RangeSet.empty
  }
}

const wysiwygGutterClassField = StateField.define<RangeSet<GutterMarker>>({
  create(state) {
    return safeBuildGutterClasses(state)
  },
  update(value, transaction) {
    if (!transaction.docChanged && transaction.newSelection.eq(transaction.startState.selection)) {
      return value
    }
    return safeBuildGutterClasses(transaction.state)
  },
  provide: (field) => gutterLineClass.from(field),
})

function collectWysiwygTableDecorationSpecs(
  doc: CodeMirrorState['doc'],
  tables: readonly MarkdownTableBlock[],
  activeTableCell: ActiveWysiwygTableCell | null,
  spellcheckConfig: WysiwygSpellcheckConfig
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
      Decoration.replace({ widget: new TableWidget(table, activeTableCellForTable, spellcheckConfig), block: true })
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
  const { tables } = collectWysiwygStructuralBlocks(markdown)
  const activeTableCell = resolveActiveTableCellFromSelection(state, tables)
  const spellcheckConfig = resolveDocumentSpellcheckConfig(
    detectDocumentLanguage(markdown),
    useEditorStore.getState().spellcheckMode
  )

  return {
    tables,
    decorations: buildSortedRangeSet(
      collectWysiwygTableDecorationSpecs(state.doc, tables, activeTableCell, spellcheckConfig)
    ),
  }
}

type WysiwygSpellcheckConfig = ReturnType<typeof resolveDocumentSpellcheckConfig>

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
  lineFrom: number,
  hasFollowingLine: boolean,
  footnoteIndices: Map<string, number>,
  documentContext: WysiwygDocumentContext
): void {
  const inlineCodeRanges = collectInlineCodeRanges(text)
  const combinedEmphasisRanges = findInlineBoldItalicRanges(text)
  const combinedEmphasisMarkerRanges = combinedEmphasisRanges
    .flatMap((range) => ([
      { from: range.from, to: range.contentFrom },
      { from: range.contentTo, to: range.to },
    ]))
    .sort((left, right) => left.from - right.from || left.to - right.to)
  const inlineLiteralExcludedRanges = [
    ...inlineCodeRanges,
    ...findInlineMathRanges(text).map((range) => ({ from: range.from, to: range.to })),
  ].sort((left, right) => left.from - right.from || left.to - right.to)

  processSubscript(decorations, text, lineFrom)
  processSuperscript(decorations, text, lineFrom)
  processInlineFootnotes(decorations, text, lineFrom, footnoteIndices)
  processInlineHardBreaks(decorations, text, lineFrom, inlineLiteralExcludedRanges, hasFollowingLine)
  processBoldItalicEmphasis(decorations, combinedEmphasisRanges, lineFrom)

  // Bold **text** or __text__
  processPattern(decorations, text, lineFrom, /(\*\*|__)((?:[^*_]|\*(?!\*))+?)\1/g, 'cm-wysiwyg-bold', {
    excludedRanges: [...inlineCodeRanges, ...combinedEmphasisMarkerRanges].sort(
      (left, right) => left.from - right.from || left.to - right.to
    ),
  })

  processItalic(decorations, text, lineFrom, combinedEmphasisMarkerRanges)

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

  const inlineMediaRanges = collectInlineMediaRanges(text, {
    referenceDefinitionsMarkdown: documentContext.referenceDefinitionsMarkdown,
  })

  for (const range of inlineMediaRanges.renderedFragments) {
    queueDecoration(
      decorations,
      lineFrom + range.from,
      lineFrom + range.to,
      Decoration.replace({
        widget: new InlineRenderedFragmentWidget(
          text.slice(range.from, range.to),
          lineFrom + range.from,
          range.kind,
          documentContext
        ),
      })
    )
  }

  for (const range of inlineMediaRanges.links) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-link' })
    )
    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
  }

  processLiteralEscapes(decorations, text, lineFrom, inlineLiteralExcludedRanges)
}

function processInlineFootnotes(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  footnoteIndices: Map<string, number>
): void {
  for (const range of findInlineFootnoteRanges(text)) {
    queueDecoration(
      decorations,
      lineFrom + range.from,
      lineFrom + range.to,
      Decoration.replace({ widget: new InlineFootnoteWidget(range.label, footnoteIndices.get(range.label) ?? 0, lineFrom + range.from) })
    )
  }
}

function processInlineHardBreaks(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  excludedRanges: readonly TextRange[],
  hasFollowingLine: boolean
): void {
  for (const token of collectInlineHardBreakTokens(text, excludedRanges, { hasFollowingLine })) {
    const replacement = token.renderWidget
      ? Decoration.replace({ widget: new HardBreakWidget() })
      : Decoration.replace({})

    queueDecoration(
      decorations,
      lineFrom + token.from,
      lineFrom + token.to,
      replacement
    )
  }
}

function processSubscript(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number
): void {
  for (const range of findInlineSubscriptRanges(text)) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-subscript' })
    )
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
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

function processBoldItalicEmphasis(
  decorations: DecorationSpec[],
  ranges: readonly InlineBoldItalicRange[],
  lineFrom: number
): void {
  for (const range of ranges) {
    const fullStart = lineFrom + range.from
    const contentStart = lineFrom + range.contentFrom
    const contentEnd = lineFrom + range.contentTo
    const fullEnd = lineFrom + range.to

    queueDecoration(decorations, fullStart, contentStart, Decoration.replace({}))
    queueDecoration(
      decorations,
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'cm-wysiwyg-bold cm-wysiwyg-italic' })
    )
    queueDecoration(decorations, contentEnd, fullEnd, Decoration.replace({}))
  }
}

function processItalic(
  decorations: DecorationSpec[],
  text: string,
  lineFrom: number,
  excludedRanges: readonly TextRange[] = []
): void {
  for (const range of findInlineItalicRanges(text)) {
    if (
      findContainingTextRange(range.from, excludedRanges) ||
      findContainingTextRange(Math.max(range.from, range.to - 1), excludedRanges)
    ) {
      continue
    }

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
  const checkbox = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-checkbox')
  if (!checkbox) return false

  const checkboxFrom = Number(checkbox.dataset.checkboxFrom)
  if (!Number.isFinite(checkboxFrom)) return false

  const line = view.state.doc.lineAt(checkboxFrom)
  const change = getTaskCheckboxChange(line.text, line.from)
  if (!change) return false

  // Optionally animate before replacing document state
  checkbox.classList.toggle('is-checked')

  view.dispatch({ changes: change })
  view.focus()
  return true
}

function isPlainTaskCheckboxToggleKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
}

function isPlainMathWidgetActivationKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
}

function isPlainMermaidWidgetActivationKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
}

function isPlainFootnoteWidgetActivationKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
}

function isPlainInlineRenderedFragmentActivationKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
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
  detailsBlocks: WysiwygDetailsBlock[]
  footnoteIndices: Map<string, number>
  activeTableCell: ActiveWysiwygTableCell | null

  constructor(view: EditorView) {
    const structuralBlocks = collectWysiwygStructuralBlocks(view.state.doc.toString())
    this.fencedCodeBlocks = structuralBlocks.fencedCodeBlocks
    this.mathBlocks = structuralBlocks.mathBlocks
    this.tables = structuralBlocks.tables
    this.detailsBlocks = structuralBlocks.detailsBlocks
    this.footnoteIndices = collectFootnoteIndices(view.state.doc.toString())
    this.activeTableCell = null
    this.syncActiveTableCell(view)
    this.syncTableEditingPresentation(view, null)
    this.decorations = safeBuildDecorations(
      view,
      this.fencedCodeBlocks,
      this.mathBlocks,
      this.tables,
      this.detailsBlocks,
      this.footnoteIndices
    )
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      const structuralBlocks = collectWysiwygStructuralBlocks(update.state.doc.toString())
      this.fencedCodeBlocks = structuralBlocks.fencedCodeBlocks
      this.mathBlocks = structuralBlocks.mathBlocks
      this.tables = structuralBlocks.tables
      this.detailsBlocks = structuralBlocks.detailsBlocks
      this.footnoteIndices = collectFootnoteIndices(update.state.doc.toString())
      pruneTableColumnWidthSnapshots(this.tables)
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
        this.tables,
        this.detailsBlocks,
        this.footnoteIndices
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

function getTableCellInputFromTarget(target: EventTarget | null, view: EditorView): HTMLTextAreaElement | null {
  const input = (target as HTMLElement | null)?.closest<HTMLTextAreaElement>('.cm-wysiwyg-table__input')
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
  input: HTMLTextAreaElement
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
): HTMLTextAreaElement | null {
  const selector =
    `.cm-wysiwyg-table__input` +
    `[data-table-from="${activeCell.tableFrom}"]` +
    `[data-table-section="${activeCell.section}"]` +
    `[data-table-row-index="${activeCell.rowIndex}"]` +
    `[data-table-column-index="${activeCell.columnIndex}"]`

  const input = view.dom.querySelector<HTMLTextAreaElement>(selector)
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

function syncTableInputSelection(view: EditorView, input: HTMLTextAreaElement): boolean {
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

function applyTableInputChange(view: EditorView, input: HTMLTextAreaElement): boolean {
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
  syncTableInputAutoHeight(input)
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
  input: HTMLTextAreaElement,
  displayText: string,
  selectionBehavior: WysiwygTableCellSelectionBehavior
): Pick<ActiveWysiwygTableCell, 'selectionStart' | 'selectionEnd'> {
  switch (selectionBehavior) {
    case 'start':
      return { selectionStart: 0, selectionEnd: 0 }
    case 'end':
      return { selectionStart: displayText.length, selectionEnd: displayText.length }
    case 'preserve': {
      const currentCaret = input.selectionStart ?? input.value.length
      const clamped = Math.min(currentCaret, displayText.length)
      return { selectionStart: clamped, selectionEnd: clamped }
    }
  }
}

function resolveTableKeyCommand(event: KeyboardEvent, input: HTMLTextAreaElement): WysiwygTableKeyCommand | null {
  if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'escape'
  }

  if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return event.shiftKey ? 'shift-tab' : 'tab'
  }

  if (event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return isCaretOnFirstTextareaLine(input) ? 'arrow-up' : null
  }

  if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return isCaretOnLastTextareaLine(input) ? 'arrow-down' : null
  }

  if (event.key !== 'Enter' || event.metaKey) return null
  if (event.shiftKey) return 'shift-enter'
  if (event.ctrlKey) return 'ctrl-enter'
  return 'enter'
}

function isCaretOnFirstTextareaLine(input: HTMLTextAreaElement): boolean {
  const caret = input.selectionStart ?? 0
  if ((input.selectionEnd ?? caret) !== caret) return false
  return input.value.slice(0, caret).indexOf('\n') === -1
}

function isCaretOnLastTextareaLine(input: HTMLTextAreaElement): boolean {
  const caret = input.selectionEnd ?? input.value.length
  if ((input.selectionStart ?? caret) !== caret) return false
  return input.value.slice(caret).indexOf('\n') === -1
}

function isPlainBackspaceForEmptyTableCell(event: KeyboardEvent, input: HTMLTextAreaElement): boolean {
  return event.key === 'Backspace' &&
    input.value.length === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
}

function isPlainDeleteForEmptyTableCell(event: KeyboardEvent, input: HTMLTextAreaElement): boolean {
  return event.key === 'Delete' &&
    input.value.length === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
}

function isArrowLeftAtTableCellStart(event: KeyboardEvent, input: HTMLTextAreaElement): boolean {
  if (event.key !== 'ArrowLeft') return false
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const selectionStart = input.selectionStart ?? 0
  const selectionEnd = input.selectionEnd ?? 0
  return selectionStart === 0 && selectionEnd === 0
}

function isArrowRightAtTableCellEnd(event: KeyboardEvent, input: HTMLTextAreaElement): boolean {
  if (event.key !== 'ArrowRight') return false
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const valueLength = input.value.length
  const selectionStart = input.selectionStart ?? valueLength
  const selectionEnd = input.selectionEnd ?? valueLength
  return selectionStart === valueLength && selectionEnd === valueLength
}

function focusTableCellFromKeyboardAction(
  view: EditorView,
  input: HTMLTextAreaElement,
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
  input: HTMLTextAreaElement,
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
  input: HTMLTextAreaElement,
  resolved: ResolvedTableCellTarget,
  insertText: string
): boolean {
  const selectionStart = input.selectionStart ?? resolved.displayText.length
  const selectionEnd = input.selectionEnd ?? resolved.displayText.length
  const nextDisplayText =
    `${resolved.displayText.slice(0, selectionStart)}${insertText}${resolved.displayText.slice(selectionEnd)}`
  const nextSelectionOffset = selectionStart + insertText.length
  const nextEncodedText = encodeMarkdownTableCellText(nextDisplayText)
  const nextSelectionRawOffset = resolveEncodedTableCellOffset(nextDisplayText, nextSelectionOffset)
  const nextFocusedSelectionOffset = resolveDecodedTableCellOffset(nextEncodedText, nextSelectionRawOffset)
  const nextActiveTableCell = buildActiveTableCell(
    resolved.table.from,
    resolved.location,
    nextFocusedSelectionOffset,
    nextFocusedSelectionOffset
  )

  input.blur()
  view.dispatch({
    changes: {
      from: resolved.cell.editAnchor,
      to: resolved.cell.editHead,
      insert: nextEncodedText,
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
  input: HTMLTextAreaElement,
  resolved: ResolvedTableCellTarget,
  direction: 'before' | 'after'
): boolean {
  const doc = view.state.doc

  input.blur()

  if (direction === 'before') {
    const tableOpeningLine = doc.lineAt(resolved.table.from)
    if (tableOpeningLine.number === 1) {
      view.dispatch({
        changes: { from: 0, insert: '\n' },
        selection: { anchor: 0 },
        userEvent: 'input',
        scrollIntoView: true,
      })
      return true
    }

    view.dispatch({
      selection: { anchor: Math.max(resolved.table.from - 1, 0) },
      userEvent: 'select',
      scrollIntoView: true,
    })
    return true
  }

  const tableClosingLine = doc.lineAt(resolved.table.to)
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
  input: HTMLTextAreaElement,
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
      return exitTableFromKeyboardAction(view, input, resolved, action.direction)
  }
}

function handleTableInputKeydown(
  event: KeyboardEvent,
  view: EditorView,
  input: HTMLTextAreaElement
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

  if (isPlainDeleteForEmptyTableCell(event, input)) {
    return applyTableKeyCommand(view, input, 'delete')
  }

  if (isArrowLeftAtTableCellStart(event, input)) {
    return applyTableKeyCommand(view, input, 'arrow-left')
  }

  if (isArrowRightAtTableCellEnd(event, input)) {
    return applyTableKeyCommand(view, input, 'arrow-right')
  }

  const command = resolveTableKeyCommand(event, input)
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
  return NUMERIC_CELL_RE.test(value)
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

function activateMermaidTarget(view: EditorView, target: EventTarget | null): boolean {
  const mermaidTarget = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-mermaid')
  if (!mermaidTarget) return false

  const editAnchor = Number(mermaidTarget.dataset.mermaidEditAnchor)
  if (!Number.isFinite(editAnchor)) return false

  view.dispatch({
    selection: { anchor: editAnchor },
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

function activateFootnoteTarget(view: EditorView, target: EventTarget | null): boolean {
  const footnoteTarget = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-footnote-ref, .cm-wysiwyg-footnote-def')
  if (!footnoteTarget) return false

  const editAnchor = Number(footnoteTarget.dataset.footnoteEditAnchor)
  if (!Number.isFinite(editAnchor)) return false

  const label = footnoteTarget.dataset.footnoteLabel
  const kind = footnoteTarget.dataset.footnoteKind
  let anchor = editAnchor

  if (kind === 'ref' && label) {
    const definition = findBlockFootnoteRanges(view.state.doc.toString()).find((range) => range.label === label)
    if (definition) anchor = definition.from
  }

  view.dispatch({
    selection: { anchor },
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

function activateInlineRenderedFragmentTarget(view: EditorView, target: EventTarget | null): boolean {
  const fragmentTarget = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-inline-fragment')
  if (!fragmentTarget) return false

  const editAnchor = Number(fragmentTarget.dataset.inlineFragmentEditAnchor)
  if (!Number.isFinite(editAnchor)) return false

  view.dispatch({
    selection: { anchor: editAnchor },
    userEvent: 'select.pointer',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

function getDetailsToggleButton(target: EventTarget | null): HTMLButtonElement | null {
  return (target as HTMLElement | null)?.closest<HTMLButtonElement>('.cm-wysiwyg-details__toggle') ?? null
}

function isPlainDetailsToggleKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === ' ' || event.key === 'Enter')
  )
}

function toggleDetailsDisclosureTarget(target: EventTarget | null): boolean {
  const toggle = getDetailsToggleButton(target)
  if (!toggle) return false

  const details = toggle.closest<HTMLElement>('.cm-wysiwyg-details')
  if (!details) return false

  setDetailsWidgetOpen(details, details.dataset.detailsOpen !== 'true')
  return true
}

function activateDetailsTarget(view: EditorView, target: EventTarget | null): boolean {
  if (getDetailsToggleButton(target)) return false

  const detailsTarget = (target as HTMLElement | null)?.closest<HTMLElement>('.cm-wysiwyg-details')
  if (!detailsTarget) return false

  const editAnchor = Number(detailsTarget.dataset.detailsEditAnchor)
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
        if (activateInlineRenderedFragmentTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (getDetailsToggleButton(event.target)) {
          event.preventDefault()
          return true
        }
        if (activateDetailsTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (activateFootnoteTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (activateMermaidTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if ((event.target as HTMLElement | null)?.closest('.cm-wysiwyg-checkbox')) {
          // Prevent CodeMirror from moving the caret onto the task line on
          // mousedown — otherwise the widget disappears before the click
          // handler gets a chance to toggle it.
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
        if (activateInlineRenderedFragmentTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (toggleDetailsDisclosureTarget(event.target)) {
          event.preventDefault()
          return true
        }
        if (activateDetailsTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (activateFootnoteTarget(view, event.target)) {
          event.preventDefault()
          return true
        }
        if (activateMermaidTarget(view, event.target)) {
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

        const checkboxTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-checkbox')
        if (checkboxTarget) {
          if (!isPlainTaskCheckboxToggleKey(event)) return false
          if (!toggleTaskCheckbox(view, event.target)) return false
          event.preventDefault()
          return true
        }

        const mathTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-math-block, .cm-wysiwyg-math-inline')
        if (mathTarget) {
          if (!isPlainMathWidgetActivationKey(event)) return false
          if (!activateMathTarget(view, event.target)) return false
          event.preventDefault()
          return true
        }

        const mermaidTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-mermaid')
        if (mermaidTarget) {
          if (!isPlainMermaidWidgetActivationKey(event)) return false
          if (!activateMermaidTarget(view, event.target)) return false
          event.preventDefault()
          return true
        }

        const inlineFragmentTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-inline-fragment')
        if (inlineFragmentTarget) {
          if (!isPlainInlineRenderedFragmentActivationKey(event)) return false
          if (!activateInlineRenderedFragmentTarget(view, event.target)) return false
          event.preventDefault()
          return true
        }

        const detailsToggleTarget = getDetailsToggleButton(event.target)
        if (detailsToggleTarget) {
          if (!isPlainDetailsToggleKey(event)) return false
          if (!toggleDetailsDisclosureTarget(event.target)) return false
          event.preventDefault()
          return true
        }

        const detailsTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-details')
        if (detailsTarget) {
          if (!isPlainInlineRenderedFragmentActivationKey(event)) return false
          if (!activateDetailsTarget(view, event.target)) return false
          event.preventDefault()
          return true
        }

        const footnoteTarget = (event.target as HTMLElement | null)?.closest('.cm-wysiwyg-footnote-ref, .cm-wysiwyg-footnote-def')
        if (footnoteTarget) {
          if (!isPlainFootnoteWidgetActivationKey(event)) return false
          if (!activateFootnoteTarget(view, event.target)) return false
          event.preventDefault()
          return true
        }

        return false
      },
      paste(event, view) {
        if (getTableCellInputFromTarget(event.target, view)) return false
        return handleDocumentClipboardTablePaste(event, view)
      },
    },
  }
)

function handleDocumentClipboardTablePaste(event: ClipboardEvent, view: EditorView): boolean {
  const clipboard = event.clipboardData
  if (!clipboard) return false

  const markdownTable = convertClipboardToMarkdownTable({
    text: clipboard.getData('text/plain'),
    html: clipboard.getData('text/html'),
  })
  if (!markdownTable) return false

  const selection = view.state.selection.main
  const plugin = getWysiwygPluginState(view)
  if (plugin && isSelectionInsideAnyTable(plugin.tables, selection.from, selection.to)) {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)
  const needsLeadingNewline = selection.from === line.from ? false : true
  const followingText = view.state.doc.sliceString(selection.to, Math.min(selection.to + 1, view.state.doc.length))
  const needsTrailingNewline = followingText !== '\n' && selection.to !== view.state.doc.length
  const insert = `${needsLeadingNewline ? '\n\n' : ''}${markdownTable}${needsTrailingNewline ? '\n\n' : '\n'}`

  event.preventDefault()
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length },
    userEvent: 'input.paste',
    scrollIntoView: true,
  })
  return true
}

function isSelectionInsideAnyTable(
  tables: readonly MarkdownTableBlock[],
  from: number,
  to: number
): boolean {
  return tables.some((table) => from >= table.from && to <= table.to)
}

export const wysiwygTableDecorations = [wysiwygTableDecorationField, wysiwygGutterClassField]

// ── WYSIWYG CSS styles ─────────────────────────────────────────────────────
// These are injected via a CM theme extension

const PREVIEW_FONT_FAMILY = 'var(--font-preview, Inter, system-ui, sans-serif)'
const MONO_FONT_FAMILY = 'var(--font-mono, JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace)'
const PROSE_LINE_HEIGHT = 'var(--md-prose-line-height, 1.8)'
const HEADING_LINE_HEIGHT = 'var(--md-heading-line-height, 1.3)'
const PROSE_BLOCK_INSET = 'var(--md-block-shell-inset, 32px)'
const LIST_INDENT = 'var(--md-list-indent, 1.75em)'
const LIST_MARKER_INLINE_SIZE = 'var(--md-list-marker-inline-size, 1ch)'
const LIST_MARKER_FONT_WEIGHT = 'var(--md-list-marker-font-weight, 400)'
const LIST_MARKER_DISC_SIZE = 'var(--md-list-bullet-disc-size, 0.33em)'
const LIST_MARKER_CIRCLE_SIZE = 'var(--md-list-bullet-circle-size, 0.33em)'
const LIST_MARKER_SQUARE_SIZE = 'var(--md-list-bullet-square-size, 0.27em)'
const LIST_MARKER_CIRCLE_STROKE = 'var(--md-list-bullet-circle-stroke, 1px)'
const LIST_MARKER_GAP = 'var(--md-list-marker-gap, 0.9em)'
const LIST_ORDERED_MARKER_GAP = 'var(--md-list-ordered-marker-gap, 0.55em)'
const LIST_MARKER_OFFSET_Y = 'var(--md-list-marker-offset-y, 0em)'
const CODE_BLOCK_RADIUS = 'var(--md-code-block-radius, 10px)'
const CODE_BLOCK_PADDING_INLINE = 'var(--md-code-block-padding-inline, 16px)'
const BLOCKQUOTE_RULE_BACKGROUND =
  'repeating-linear-gradient(to right, var(--md-quote-rule-color) 0, var(--md-quote-rule-color) var(--md-quote-line-width), transparent var(--md-quote-line-width), transparent calc(var(--md-quote-pad-inline-start) + var(--md-quote-line-width)))'
const ACTIVE_BLOCKQUOTE_RULE_BACKGROUND =
  'repeating-linear-gradient(to right, color-mix(in srgb, var(--text-muted) 22%, transparent) 0, color-mix(in srgb, var(--text-muted) 22%, transparent) var(--md-quote-line-width), transparent var(--md-quote-line-width), transparent calc(var(--md-quote-pad-inline-start) + var(--md-quote-line-width)))'
const BLOCKQUOTE_LINE_PADDING_LEFT =
  `calc(${PROSE_BLOCK_INSET} + var(--md-quote-pad-inline-start) + (var(--cm-wysiwyg-blockquote-depth, 1) - 1) * (var(--md-quote-pad-inline-start) + var(--md-quote-line-width)))`
const BLOCKQUOTE_LINE_BACKGROUND_SIZE =
  'calc((var(--md-quote-pad-inline-start) + var(--md-quote-line-width)) * var(--cm-wysiwyg-blockquote-depth, 1)) 100%'

export const wysiwygTheme = EditorView.baseTheme({
  '.cm-content': {
    fontFamily: PREVIEW_FONT_FAMILY,
    lineHeight: PROSE_LINE_HEIGHT,
  },
  // Headings
  '.cm-wysiwyg-h1': { fontSize: 'var(--md-heading-1-size, 2em)', fontWeight: '700', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-h2': { fontSize: 'var(--md-heading-2-size, 1.5em)', fontWeight: '700', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-h3': { fontSize: 'var(--md-heading-3-size, 1.25em)', fontWeight: '600', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-h4': { fontSize: 'var(--md-heading-4-size, 1.1em)', fontWeight: '600', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-h5': { fontSize: 'var(--md-heading-5-size, 1em)', fontWeight: '600', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-h6': { fontSize: 'var(--md-heading-6-size, 0.95em)', fontWeight: '600', lineHeight: HEADING_LINE_HEIGHT, color: 'var(--text-primary) !important', fontFamily: PREVIEW_FONT_FAMILY },
  '.cm-wysiwyg-hr-anchor-line': {
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
  },
  '.cm-wysiwyg-hr': {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: `0 ${PROSE_BLOCK_INSET}`,
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-hr__rule': {
    display: 'block',
    borderTop: '1px solid var(--md-hr-rule-color, var(--border))',
    margin: '0',
  },

  // Inline
  '.cm-wysiwyg-bold': { fontWeight: '700', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-italic': { fontStyle: 'italic', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-underline': { textDecoration: 'underline', color: 'var(--text-primary) !important' },
  '.cm-wysiwyg-strikethrough': { textDecoration: 'line-through', color: 'var(--md-strikethrough-color, color-mix(in srgb, var(--preview-text) 78%, var(--text-muted))) !important' },
  '.cm-wysiwyg-subscript': {
    fontSize: 'var(--md-inline-script-font-size, 0.75em)',
    lineHeight: 'var(--md-inline-script-line-height, 0)',
    verticalAlign: 'sub',
    color: 'inherit !important',
  },
  '.cm-wysiwyg-superscript': {
    fontSize: 'var(--md-inline-script-font-size, 0.75em)',
    lineHeight: 'var(--md-inline-script-line-height, 0)',
    verticalAlign: 'super',
    color: 'inherit !important',
  },
  '.cm-wysiwyg-highlight': {
    backgroundColor: 'var(--md-inline-mark-bg, color-mix(in srgb, #FACC15 52%, transparent))',
    borderRadius: 'var(--md-inline-mark-radius, 0.28em)',
    color: 'inherit !important',
    padding: '0 var(--md-inline-mark-padding-inline, 0.18em)',
  },
  '.cm-wysiwyg-code': {
    fontFamily: MONO_FONT_FAMILY,
    fontSize: 'var(--md-inline-code-font-size, 0.875em)',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: 'var(--md-inline-code-radius, 4px)',
    padding: 'var(--md-inline-code-padding, 0.125em 0.375em)',
    color: 'inherit !important',
  },
  '.cm-wysiwyg-link': {
    color: 'var(--accent) !important',
    textDecoration: 'var(--md-link-text-decoration, none)',
    cursor: 'pointer',
  },
  '.cm-wysiwyg-link:hover': {
    color: 'var(--accent-hover) !important',
    textDecoration: 'var(--md-link-hover-text-decoration, underline)',
  },
  '.cm-wysiwyg-inline-fragment': {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    verticalAlign: 'middle',
    borderRadius: '10px',
    cursor: 'text',
    transition: 'background-color 140ms ease, box-shadow 140ms ease',
  },
  '.cm-wysiwyg-inline-fragment:hover': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 44%, transparent)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--border) 64%, transparent)',
  },
  '.cm-wysiwyg-inline-fragment:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
  },
  '.cm-wysiwyg-inline-fragment *': {
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-inline-fragment a': {
    color: 'var(--accent) !important',
    textDecoration: 'var(--md-link-text-decoration, none)',
  },
  '.cm-wysiwyg-inline-fragment:hover a': {
    color: 'var(--accent-hover) !important',
    textDecoration: 'var(--md-link-hover-text-decoration, underline)',
  },
  '.cm-wysiwyg-inline-fragment img': {
    display: 'inline-block',
    maxWidth: '100%',
    borderRadius: '4px',
    verticalAlign: 'middle',
  },
  '.cm-wysiwyg-inline-fragment img.preview-external-image': {
    border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
    boxShadow: '0 14px 36px -22px color-mix(in srgb, var(--text-primary) 22%, transparent)',
  },
  '.cm-wysiwyg-codeblock-meta-line': {
    position: 'relative',
    minHeight: '1.8em',
    marginTop: '0.65em',
    marginLeft: PROSE_BLOCK_INSET,
    marginRight: PROSE_BLOCK_INSET,
    padding: `10px ${CODE_BLOCK_PADDING_INLINE} 8px !important`,
    cursor: 'text',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderTop: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderTopLeftRadius: CODE_BLOCK_RADIUS,
    borderTopRightRadius: CODE_BLOCK_RADIUS,
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
    fontFamily: MONO_FONT_FAMILY,
    fontSize: '0.94em',
    marginLeft: PROSE_BLOCK_INSET,
    marginRight: PROSE_BLOCK_INSET,
    cursor: 'text',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    padding: `0 ${CODE_BLOCK_PADDING_INLINE} !important`,
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  '.cm-wysiwyg-codeblock-close-line': {
    minHeight: '12px',
    marginBottom: '0.65em',
    marginLeft: PROSE_BLOCK_INSET,
    marginRight: PROSE_BLOCK_INSET,
    padding: `0 ${CODE_BLOCK_PADDING_INLINE} 10px !important`,
    cursor: 'text',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 88%, var(--bg-tertiary))',
    borderLeft: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderRight: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 82%, transparent)',
    borderBottomLeftRadius: CODE_BLOCK_RADIUS,
    borderBottomRightRadius: CODE_BLOCK_RADIUS,
    boxSizing: 'border-box',
    fontSize: '0',
    lineHeight: '0',
  },
  '.cm-wysiwyg-mermaid-anchor-line': {
    padding: '0 !important',
  },
  '.cm-wysiwyg-mermaid-hidden-line': {
    height: '0',
    minHeight: '0',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-mermaid': {
    display: 'block',
    width: '100%',
    cursor: 'text',
  },
  '.cm-wysiwyg-mermaid__surface': {
    margin: `0.5em ${PROSE_BLOCK_INSET}`,
    padding: `16px ${CODE_BLOCK_PADDING_INLINE}`,
    borderRadius: '8px',
    border: '1px solid transparent',
    backgroundColor: 'transparent',
    boxSizing: 'border-box',
    overflowX: 'auto',
    textAlign: 'center',
    transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  '.cm-wysiwyg-mermaid:hover .cm-wysiwyg-mermaid__surface': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 58%, transparent)',
    borderColor: 'color-mix(in srgb, var(--border) 74%, transparent)',
    boxShadow: 'var(--shadow-sm)',
  },
  '.cm-wysiwyg-mermaid:focus-visible .cm-wysiwyg-mermaid__surface': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 78%, var(--bg-primary))',
    borderColor: 'color-mix(in srgb, var(--accent) 42%, transparent)',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '.cm-wysiwyg-mermaid__surface svg': {
    display: 'inline-block',
    maxWidth: '100%',
    height: 'auto',
  },
  '.cm-wysiwyg-mermaid__status': {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-ui, inherit)',
    fontSize: '0.8rem',
    lineHeight: '1.45',
    textAlign: 'center',
  },
  '.cm-wysiwyg-mermaid[data-mermaid-state="error"] .cm-wysiwyg-mermaid__status': {
    color: '#b91c1c',
  },
  '.dark .cm-wysiwyg-mermaid[data-mermaid-state="error"] .cm-wysiwyg-mermaid__status': {
    color: '#fca5a5',
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
    padding: `0 ${PROSE_BLOCK_INSET} !important`,
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
    margin: `0 ${PROSE_BLOCK_INSET}`,
    overflowX: 'auto',
    borderRadius: '0',
    border: 'none',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    pointerEvents: 'auto',
  },
  '.cm-wysiwyg-table__toolbar': {
    margin: `0 ${PROSE_BLOCK_INSET} 6px`,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    pointerEvents: 'auto',
  },
  '.cm-wysiwyg-table__toolbar[hidden]': {
    display: 'none',
  },
  '.cm-wysiwyg-table__toolbar-button': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '28px',
    height: '24px',
    padding: '0 6px',
    fontSize: '12px',
    lineHeight: '1',
    color: 'var(--text-secondary, inherit)',
    background: 'var(--surface-raised, transparent)',
    border: '1px solid var(--border, #ccc)',
    borderRadius: '4px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-wysiwyg-table__toolbar-button svg': {
    width: '16px',
    height: '16px',
    flexShrink: '0',
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-table__toolbar-button:hover:not(:disabled)': {
    background: 'var(--surface-hover, rgba(0,0,0,0.04))',
    color: 'var(--text-primary, inherit)',
  },
  '.cm-wysiwyg-table__toolbar-button:disabled': {
    opacity: '0.4',
    cursor: 'not-allowed',
  },
  '.cm-wysiwyg-table__toolbar-button[aria-pressed="true"]': {
    background: 'var(--accent-soft, rgba(80,120,220,0.15))',
    color: 'var(--accent, inherit)',
    borderColor: 'var(--accent, currentColor)',
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
    resize: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.cm-wysiwyg-table__input::selection': {
    backgroundColor: 'var(--editor-selection)',
  },
  '.cm-wysiwyg-blockquote-line': {
    boxSizing: 'border-box',
    minHeight: '1.45em',
    paddingLeft: `${BLOCKQUOTE_LINE_PADDING_LEFT} !important`,
    paddingRight: `calc(${PROSE_BLOCK_INSET} + var(--md-quote-pad-inline-end)) !important`,
    backgroundImage: BLOCKQUOTE_RULE_BACKGROUND,
    backgroundPosition: `${PROSE_BLOCK_INSET} 0`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: BLOCKQUOTE_LINE_BACKGROUND_SIZE,
    color: 'var(--md-blockquote-text-color, var(--text-secondary)) !important',
  },
  '.cm-wysiwyg-blockquote-line-active': {
    backgroundImage: ACTIVE_BLOCKQUOTE_RULE_BACKGROUND,
  },
  '.cm-wysiwyg-blockquote': {
    color: 'var(--md-blockquote-text-color, var(--text-secondary)) !important',
    fontStyle: 'normal',
  },
  '.cm-wysiwyg-list-spacer-line': {
    height: '0',
    minHeight: '0',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-list-line': {
    position: 'relative',
    paddingLeft: 'var(--cm-wysiwyg-list-text-inset) !important',
    paddingRight: `${PROSE_BLOCK_INSET} !important`,
  },
  '.cm-wysiwyg-task-completed': {
    color: 'var(--md-task-completed-color, color-mix(in srgb, var(--preview-text) 68%, var(--text-muted))) !important',
    transition: 'color 0.2s ease',
  },
  '.cm-wysiwyg-task-marker': {
    color: 'color-mix(in srgb, var(--text-muted) 70%, transparent) !important',
    fontFamily: MONO_FONT_FAMILY,
  },
  '.cm-wysiwyg-bullet-simple': {
    display: 'inline-block',
    position: 'absolute',
    top: '0',
    insetInlineStart: 'var(--cm-wysiwyg-list-marker-inset)',
    transform: 'translateX(-50%)',
    width: LIST_MARKER_INLINE_SIZE,
    height: 'calc(1em * var(--md-prose-line-height, 1.8))',
    color: 'var(--md-list-marker-color, var(--preview-text)) !important',
    fontWeight: LIST_MARKER_FONT_WEIGHT,
    lineHeight: PROSE_LINE_HEIGHT,
    verticalAlign: 'top',
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-bullet-simple::before': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '50%',
    display: 'block',
    boxSizing: 'border-box',
    transform: `translate(-50%, calc(-50% + ${LIST_MARKER_OFFSET_Y}))`,
  },
  '.cm-wysiwyg-bullet-simple--disc::before': {
    width: LIST_MARKER_DISC_SIZE,
    height: LIST_MARKER_DISC_SIZE,
    borderRadius: '999px',
    backgroundColor: 'currentColor',
  },
  '.cm-wysiwyg-bullet-simple--circle::before': {
    width: LIST_MARKER_CIRCLE_SIZE,
    height: LIST_MARKER_CIRCLE_SIZE,
    borderRadius: '999px',
    border: `${LIST_MARKER_CIRCLE_STROKE} solid currentColor`,
    backgroundColor: 'transparent',
  },
  '.cm-wysiwyg-bullet-simple--square::before': {
    width: LIST_MARKER_SQUARE_SIZE,
    height: LIST_MARKER_SQUARE_SIZE,
    backgroundColor: 'currentColor',
  },
  '.cm-wysiwyg-ordered-number': {
    display: 'inline-block',
    position: 'absolute',
    top: '0',
    insetInlineStart: 'var(--cm-wysiwyg-list-marker-inset)',
    transform: 'translateX(-100%)',
    fontFamily: PREVIEW_FONT_FAMILY,
    color: 'var(--md-list-marker-color, var(--preview-text)) !important',
    fontWeight: LIST_MARKER_FONT_WEIGHT,
    lineHeight: PROSE_LINE_HEIGHT,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  '.cm-wysiwyg-checkbox': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--md-task-checkbox-size, 16px)',
    height: 'var(--md-task-checkbox-size, 16px)',
    marginRight: 'var(--md-task-checkbox-gap, 8px)',
    verticalAlign: 'middle',
    cursor: 'pointer',
    border: '2px solid color-mix(in srgb, var(--text-muted) 60%, transparent)',
    borderRadius: 'var(--md-task-checkbox-radius, 4px)',
    backgroundColor: 'transparent',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'translateY(-1px)',
    flexShrink: '0',
  },
  '.cm-wysiwyg-checkbox:hover': {
    borderColor: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  },
  '.cm-wysiwyg-checkbox:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent)',
  },
  '.cm-wysiwyg-checkbox.is-checked': {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  '.cm-wysiwyg-checkbox .checkmark': {
    opacity: '0',
    color: '#ffffff',
    transform: 'scale(0.5)',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  '.cm-wysiwyg-checkbox.is-checked .checkmark': {
    opacity: '1',
    transform: 'scale(1)',
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
  '.cm-wysiwyg-math-inline:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent)',
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
    margin: `0.5em ${PROSE_BLOCK_INSET}`,
    padding: `8px ${CODE_BLOCK_PADDING_INLINE}`,
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
  '.cm-wysiwyg-math-block:focus-visible .cm-wysiwyg-math-block__surface': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 78%, var(--bg-primary))',
    borderColor: 'color-mix(in srgb, var(--accent) 42%, transparent)',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '.cm-wysiwyg-footnote-ref:focus-visible, .cm-wysiwyg-footnote-def:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
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
  '.cm-wysiwyg-details-anchor-line': {
    padding: '0 !important',
    lineHeight: PROSE_LINE_HEIGHT,
  },
  '.cm-wysiwyg-details-hidden-line': {
    height: '0',
    minHeight: '0',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: '0',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-details-gap-line': {
    height: 'var(--md-block-space, 0.75em)',
    minHeight: 'var(--md-block-space, 0.75em)',
    padding: '0 !important',
    lineHeight: '0',
    fontSize: 'inherit',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-details': {
    display: 'inline-block',
    width: 'calc(100% - (2 * var(--md-block-shell-inset, 32px)))',
    boxSizing: 'border-box',
    margin: `0 ${PROSE_BLOCK_INSET}`,
    padding: '0',
    borderRadius: '8px',
    border: '0 solid transparent',
    backgroundColor: 'transparent',
    color: 'var(--preview-text)',
    fontFamily: PREVIEW_FONT_FAMILY,
    lineHeight: PROSE_LINE_HEIGHT,
    whiteSpace: 'normal',
    cursor: 'text',
    userSelect: 'none',
    verticalAlign: 'top',
    transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  '.cm-wysiwyg-details:hover': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 46%, transparent)',
    borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent)',
  },
  '.cm-wysiwyg-details:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
    borderColor: 'color-mix(in srgb, var(--accent) 42%, transparent)',
    boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent)',
  },
  '.cm-wysiwyg-details[data-details-open="false"] .cm-wysiwyg-details__body': {
    display: 'none',
  },
  '.cm-wysiwyg-details__summary': {
    display: 'flex',
    alignItems: 'baseline',
    cursor: 'text',
    color: 'var(--text-primary)',
    fontWeight: '500',
    padding: '0',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  '.cm-wysiwyg-details__toggle': {
    appearance: 'none',
    width: '1.2em',
    minWidth: '1.2em',
    height: '1.8em',
    margin: '0 0.25em 0 0',
    padding: '0',
    border: '0',
    borderRadius: '3px',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    cursor: 'pointer',
    lineHeight: '1',
  },
  '.cm-wysiwyg-details__toggle:hover': {
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
  },
  '.cm-wysiwyg-details__toggle:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '1px',
  },
  '.cm-wysiwyg-details__toggle-icon': {
    width: '0',
    height: '0',
    borderTop: '0.32em solid transparent',
    borderBottom: '0.32em solid transparent',
    borderLeft: '0.48em solid currentColor',
    transformOrigin: '35% 50%',
    transition: 'transform 120ms ease',
  },
  '.cm-wysiwyg-details[data-details-open="true"] .cm-wysiwyg-details__toggle-icon': {
    transform: 'rotate(90deg)',
  },
  '.cm-wysiwyg-details__summary-content': {
    display: 'inline',
    cursor: 'text',
    overflowWrap: 'anywhere',
  },
  '.cm-wysiwyg-details__summary-content:focus-visible': {
    outline: '2px solid color-mix(in srgb, var(--accent) 72%, transparent)',
    outlineOffset: '2px',
    borderRadius: '3px',
  },
  '.cm-wysiwyg-details__body': {
    marginTop: 'var(--md-block-space, 0.75em)',
    color: 'var(--preview-text)',
    cursor: 'text',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
  '.cm-wysiwyg-details__body > :first-child': {
    marginTop: '0',
  },
  '.cm-wysiwyg-details__body > :last-child': {
    marginBottom: '0',
  },
  '.cm-wysiwyg-details__body p': {
    margin: '0',
    whiteSpace: 'pre-line',
  },
  '.cm-wysiwyg-details__body ul, .cm-wysiwyg-details__body ol': {
    paddingLeft: 'var(--md-list-indent, 1.75em)',
    margin: '0',
  },
  '.cm-wysiwyg-details__body ul': {
    listStyleType: 'disc',
  },
  '.cm-wysiwyg-details__body ul ul': {
    listStyleType: 'circle',
  },
  '.cm-wysiwyg-details__body ul ul ul': {
    listStyleType: 'square',
  },
  '.cm-wysiwyg-details__body ol': {
    listStyleType: 'decimal',
  },
  '.cm-wysiwyg-details__body li': {
    margin: '0',
  },
  '.cm-wysiwyg-details__body li + li': {
    marginTop: 'var(--md-list-item-space, 0.2em)',
  },
  '.cm-wysiwyg-details__body li > ul, .cm-wysiwyg-details__body li > ol': {
    marginTop: 'var(--md-list-nested-space, 0.2em)',
    marginBottom: '0',
  },
  '.cm-wysiwyg-details__body li:not(:has(> :is(p, ul, ol, pre, blockquote, details, table, hr, img, h1, h2, h3, h4, h5, h6, div, section, .front-matter)))': {
    whiteSpace: 'pre-line',
  },
  '.cm-wysiwyg-details__body code': {
    fontFamily: MONO_FONT_FAMILY,
    fontSize: 'var(--md-inline-code-font-size, 0.875em)',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: 'var(--md-inline-code-radius, 4px)',
    padding: 'var(--md-inline-code-padding, 0.125em 0.375em)',
  },
  '.cm-wysiwyg-details__body pre': {
    margin: '0',
    padding: 'var(--md-code-block-padding-block, 16px) var(--md-code-block-padding-inline, 16px)',
    borderRadius: CODE_BLOCK_RADIUS,
    backgroundColor: 'var(--md-code-block-bg, #18181b)',
    color: 'var(--md-code-block-text, #d4d4d8)',
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  '.cm-wysiwyg-details__body pre code': {
    backgroundColor: 'transparent',
    padding: '0',
    color: 'inherit',
  },
  '.cm-wysiwyg-details__body table': {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '0',
  },
  '.cm-wysiwyg-details__body th, .cm-wysiwyg-details__body td': {
    border: '1px solid var(--border)',
    padding: '8px 16px',
    textAlign: 'left',
    verticalAlign: 'top',
    whiteSpace: 'pre-line',
  },
  '.cm-wysiwyg-details__body th': {
    backgroundColor: 'var(--bg-secondary)',
    fontWeight: '600',
  },
})
