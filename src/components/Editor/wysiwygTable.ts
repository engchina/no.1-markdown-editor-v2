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
