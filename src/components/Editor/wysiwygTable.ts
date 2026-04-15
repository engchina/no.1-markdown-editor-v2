import type { MarkdownTableBlock, MarkdownTableCell } from './tableBlockRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'

export interface MarkdownTableCellLocation {
  section: 'head' | 'body'
  rowIndex: number
  columnIndex: number
}

export interface ActiveWysiwygTableCell extends MarkdownTableCellLocation {
  tableFrom: number
  selectionStart: number
  selectionEnd: number
}

export type WysiwygTableCellSelectionBehavior = 'preserve' | 'start' | 'end'

export type WysiwygTableKeyCommand =
  | 'arrow-up'
  | 'arrow-down'
  | 'enter'
  | 'tab'
  | 'shift-tab'
  | 'ctrl-enter'
  | 'shift-enter'

export interface WysiwygTableRowInsertionPlan {
  insertFrom: number
  insertText: string
  focusAnchor: number
  focusLocation: MarkdownTableCellLocation
}

export type WysiwygTableKeyAction =
  | {
    kind: 'focus-cell'
    location: MarkdownTableCellLocation
    selectionBehavior: WysiwygTableCellSelectionBehavior
  }
  | {
    kind: 'insert-body-row-below'
    plan: WysiwygTableRowInsertionPlan
  }
  | {
    kind: 'insert-inline-break'
    insertText: '<br />'
  }
  | {
    kind: 'exit-table'
  }

export function collectInactiveWysiwygTables(
  view: WysiwygDecorationView,
  tables: readonly MarkdownTableBlock[]
): MarkdownTableBlock[] {
  return tables.filter((table) => intersectsVisibleRanges(view, table))
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  table: MarkdownTableBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= table.to && range.to >= table.from)
}

export function resolveTableCell(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): MarkdownTableCell | null {
  const row = location.section === 'head'
    ? table.header
    : table.rows[location.rowIndex]

  return row?.cells[location.columnIndex] ?? null
}

export function resolveTableCellLocation(
  table: MarkdownTableBlock,
  position: number
): MarkdownTableCellLocation | null {
  for (const [columnIndex, cell] of table.header.cells.entries()) {
    if (position >= cell.from && position <= cell.to) {
      return { section: 'head', rowIndex: 0, columnIndex }
    }
  }

  for (const [rowIndex, row] of table.rows.entries()) {
    for (const [columnIndex, cell] of row.cells.entries()) {
      if (position >= cell.from && position <= cell.to) {
        return { section: 'body', rowIndex, columnIndex }
      }
    }
  }

  return null
}

export function resolveNearestTableCellLocation(
  table: MarkdownTableBlock,
  position: number
): MarkdownTableCellLocation | null {
  const directMatch = resolveTableCellLocation(table, position)
  if (directMatch) return directMatch

  let closestLocation: MarkdownTableCellLocation | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  const visitCell = (location: MarkdownTableCellLocation, cell: MarkdownTableCell) => {
    const distance =
      position < cell.from
        ? cell.from - position
        : position > cell.to
          ? position - cell.to
          : 0

    if (distance >= closestDistance) return

    closestDistance = distance
    closestLocation = location
  }

  table.header.cells.forEach((cell, columnIndex) => {
    visitCell({ section: 'head', rowIndex: 0, columnIndex }, cell)
  })

  table.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      visitCell({ section: 'body', rowIndex, columnIndex }, cell)
    })
  })

  return closestLocation
}

export function resolveAdjacentTableCellLocation(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  direction: 'next' | 'previous' | 'up' | 'down'
): MarkdownTableCellLocation | null {
  const rows = [table.header, ...table.rows]
  const currentRowIndex = location.section === 'head' ? 0 : location.rowIndex + 1

  const toLocation = (rowIndex: number, columnIndex: number): MarkdownTableCellLocation | null => {
    const row = rows[rowIndex]
    if (!row || !row.cells[columnIndex]) return null

    return rowIndex === 0
      ? { section: 'head', rowIndex: 0, columnIndex }
      : { section: 'body', rowIndex: rowIndex - 1, columnIndex }
  }

  switch (direction) {
    case 'up':
      return toLocation(currentRowIndex - 1, location.columnIndex)
    case 'down':
      return toLocation(currentRowIndex + 1, location.columnIndex)
    case 'previous': {
      const previousColumn = location.columnIndex - 1
      if (previousColumn >= 0) return toLocation(currentRowIndex, previousColumn)

      const previousRow = currentRowIndex - 1
      if (previousRow < 0) return null
      const row = rows[previousRow]
      return row ? toLocation(previousRow, row.cells.length - 1) : null
    }
    case 'next': {
      const nextColumn = location.columnIndex + 1
      if (nextColumn < rows[currentRowIndex]?.cells.length) {
        return toLocation(currentRowIndex, nextColumn)
      }

      return toLocation(currentRowIndex + 1, 0)
    }
  }
}

export function resolveTableBodyRowInsertionPlan(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): WysiwygTableRowInsertionPlan | null {
  const rowText = buildEmptyMarkdownTableBodyRow(table.header.cells.length)
  if (!rowText) return null

  if (location.section === 'head') {
    if (table.rows.length > 0) {
      return {
        insertFrom: table.rows[0].from,
        insertText: `${rowText}\n`,
        focusAnchor: table.rows[0].from + 1,
        focusLocation: { section: 'body', rowIndex: 0, columnIndex: 0 },
      }
    }

    return {
      insertFrom: table.to,
      insertText: `\n${rowText}`,
      focusAnchor: table.to + 2,
      focusLocation: { section: 'body', rowIndex: 0, columnIndex: 0 },
    }
  }

  const currentRow = table.rows[location.rowIndex]
  if (!currentRow) return null

  return {
    insertFrom: currentRow.to,
    insertText: `\n${rowText}`,
    focusAnchor: currentRow.to + 2,
    focusLocation: { section: 'body', rowIndex: location.rowIndex + 1, columnIndex: 0 },
  }
}

export function resolveTableKeyAction(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  command: WysiwygTableKeyCommand
): WysiwygTableKeyAction | null {
  switch (command) {
    case 'arrow-up': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'up')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
        : null
    }
    case 'arrow-down': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'down')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
        : { kind: 'exit-table' }
    }
    case 'enter': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'down')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'end' }
        : { kind: 'exit-table' }
    }
    case 'tab': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'next')
      if (nextLocation) {
        return { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
      }

      const plan = resolveTableBodyRowInsertionPlan(table, location)
      return plan ? { kind: 'insert-body-row-below', plan } : null
    }
    case 'shift-tab': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'previous')
      if (nextLocation) {
        return { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
      }

      const plan = resolveTableBodyRowInsertionPlan(table, location)
      return plan ? { kind: 'insert-body-row-below', plan } : null
    }
    case 'ctrl-enter': {
      const plan = resolveTableBodyRowInsertionPlan(table, location)
      return plan ? { kind: 'insert-body-row-below', plan } : null
    }
    case 'shift-enter':
      return { kind: 'insert-inline-break', insertText: '<br />' }
  }
}

export function isBlankLineBelowTableSelection(
  doc: Pick<WysiwygDecorationView['state']['doc'], 'lineAt' | 'line' | 'lines'>,
  tables: readonly MarkdownTableBlock[],
  position: number
): boolean {
  const line = doc.lineAt(position)
  if (line.text.length !== 0) return false

  return tables.some((table) => {
    const closingLine = doc.lineAt(table.to)
    if (closingLine.number >= doc.lines) return false

    const nextLine = doc.line(closingLine.number + 1)
    return nextLine.from <= position && position <= nextLine.to
  })
}

export function isActiveTableCellLocation(
  activeCell: ActiveWysiwygTableCell | null,
  tableFrom: number,
  location: MarkdownTableCellLocation
): boolean {
  return Boolean(
    activeCell &&
    activeCell.tableFrom === tableFrom &&
    activeCell.section === location.section &&
    activeCell.rowIndex === location.rowIndex &&
    activeCell.columnIndex === location.columnIndex
  )
}

export function decodeMarkdownTableCellText(text: string): string {
  let output = ''

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '\\' && next === '|') {
      output += '|'
      index += 1
      continue
    }

    output += char
  }

  return output
}

export function encodeMarkdownTableCellText(value: string): string {
  return value.replace(/\|/g, '\\|')
}

export function resolveDecodedTableCellOffset(rawText: string, rawOffset: number): number {
  const cappedOffset = Math.max(0, Math.min(rawOffset, rawText.length))
  let rawIndex = 0
  let displayIndex = 0

  while (rawIndex < cappedOffset) {
    if (rawText[rawIndex] === '\\' && rawText[rawIndex + 1] === '|' && rawIndex + 2 <= cappedOffset) {
      rawIndex += 2
      displayIndex += 1
      continue
    }

    rawIndex += 1
    displayIndex += 1
  }

  return displayIndex
}

export function resolveEncodedTableCellOffset(displayText: string, displayOffset: number): number {
  const cappedOffset = Math.max(0, Math.min(displayOffset, displayText.length))
  return encodeMarkdownTableCellText(displayText.slice(0, cappedOffset)).length
}

function buildEmptyMarkdownTableBodyRow(columnCount: number): string {
  if (columnCount < 1) return ''
  return `| ${Array.from({ length: columnCount }, () => '').join(' | ')} |`
}
