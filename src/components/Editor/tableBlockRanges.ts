import type { TextRange } from './fencedCodeRanges.ts'

export type TableAlignment = 'left' | 'center' | 'right' | null

export interface MarkdownTableCell {
  text: string
  from: number
  to: number
  editAnchor: number
  editHead: number
}

export interface MarkdownTableRow extends TextRange {
  cells: MarkdownTableCell[]
}

export interface MarkdownTableBlock extends TextRange {
  header: MarkdownTableRow
  rows: MarkdownTableRow[]
  alignments: TableAlignment[]
  editAnchor: number
}

interface LineInfo extends TextRange {
  text: string
}

const tableDividerPattern = /^:?-{3,}:?$/

export function collectMarkdownTableBlocks(
  markdown: string,
  ignoredRanges: readonly TextRange[] = []
): MarkdownTableBlock[] {
  const lines = splitMarkdownLines(markdown)
  const blocks: MarkdownTableBlock[] = []
  let lineIndex = 0
  let ignoredRangeIndex = 0

  while (lineIndex < lines.length - 1) {
    const headerLine = lines[lineIndex]
    const dividerLine = lines[lineIndex + 1]

    while (ignoredRangeIndex < ignoredRanges.length && ignoredRanges[ignoredRangeIndex].to < headerLine.from) {
      ignoredRangeIndex += 1
    }

    if (lineIntersectsRange(headerLine, ignoredRanges[ignoredRangeIndex]) || lineIntersectsRange(dividerLine, ignoredRanges[ignoredRangeIndex])) {
      lineIndex += 1
      continue
    }

    const header = parseMarkdownTableRow(headerLine)
    const alignments = parseMarkdownTableDivider(dividerLine)
    if (!header || !alignments || header.cells.length !== alignments.length || header.cells.length < 2) {
      lineIndex += 1
      continue
    }

    const rows: MarkdownTableRow[] = []
    let blockEnd = dividerLine.to
    let nextIndex = lineIndex + 2

    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex]
      while (ignoredRangeIndex < ignoredRanges.length && ignoredRanges[ignoredRangeIndex].to < nextLine.from) {
        ignoredRangeIndex += 1
      }
      if (lineIntersectsRange(nextLine, ignoredRanges[ignoredRangeIndex])) break

      const row = parseMarkdownTableRow(nextLine, { allowAllEmpty: true })
      if (!row || row.cells.length !== header.cells.length) break

      rows.push(row)
      blockEnd = nextLine.to
      nextIndex += 1
    }

    blocks.push({
      from: header.from,
      to: blockEnd,
      header,
      rows,
      alignments,
      editAnchor: header.cells[0]?.editAnchor ?? header.from,
    })

    lineIndex = nextIndex
  }

  return blocks
}

function splitMarkdownLines(markdown: string): LineInfo[] {
  const lines: LineInfo[] = []
  let from = 0

  while (from <= markdown.length) {
    let to = markdown.indexOf('\n', from)
    if (to === -1) to = markdown.length
    const raw = markdown.slice(from, to)
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    lines.push({ from, to, text })
    if (to === markdown.length) break
    from = to + 1
  }

  return lines
}

function parseMarkdownTableRow(
  line: LineInfo,
  options: {
    allowAllEmpty?: boolean
  } = {}
): MarkdownTableRow | null {
  const cells = splitMarkdownTableCells(line.text, line.from)
  if (
    !cells ||
    cells.length < 2 ||
    (!options.allowAllEmpty && cells.every((cell) => cell.text.length === 0)) ||
    cells.every((cell) => tableDividerPattern.test(cell.text))
  ) {
    return null
  }

  return {
    from: line.from,
    to: line.to,
    cells,
  }
}

function parseMarkdownTableDivider(line: LineInfo): TableAlignment[] | null {
  const cells = splitMarkdownTableCells(line.text, line.from)
  if (!cells || cells.length < 2) return null

  const alignments = cells.map((cell) => {
    const normalized = cell.text.trim()
    if (!tableDividerPattern.test(normalized)) return null
    if (normalized.startsWith(':') && normalized.endsWith(':')) return 'center'
    if (normalized.startsWith(':')) return 'left'
    if (normalized.endsWith(':')) return 'right'
    return null
  })

  return alignments.every((alignment, index) => alignment !== null || tableDividerPattern.test(cells[index].text.trim()))
    ? alignments
    : null
}

function splitMarkdownTableCells(lineText: string, lineFrom: number): MarkdownTableCell[] | null {
  const trimmedStartOffset = lineText.search(/\S/u)
  if (trimmedStartOffset === -1 || !lineText.includes('|')) return null

  const trimmedEndOffset = getTrimmedEndOffset(lineText)
  let contentStart = trimmedStartOffset
  let contentEnd = trimmedEndOffset

  if (lineText[contentStart] === '|') contentStart += 1
  if (contentEnd > contentStart && lineText[contentEnd - 1] === '|') contentEnd -= 1
  if (contentEnd <= contentStart) return null

  const boundaries: Array<{ from: number; to: number }> = []
  let segmentStart = contentStart

  for (let index = contentStart; index < contentEnd; index += 1) {
    if (lineText[index] === '|' && lineText[index - 1] !== '\\') {
      boundaries.push({ from: segmentStart, to: index })
      segmentStart = index + 1
    }
  }

  boundaries.push({ from: segmentStart, to: contentEnd })

  return boundaries.map((boundary) => {
    const raw = lineText.slice(boundary.from, boundary.to)
    const leadingWhitespace = raw.match(/^\s*/u)?.[0].length ?? 0
    const trailingWhitespace = raw.match(/\s*$/u)?.[0].length ?? 0
    const contentFrom = boundary.from + leadingWhitespace
    const contentTo = Math.max(contentFrom, boundary.to - trailingWhitespace)
    const text = lineText.slice(contentFrom, contentTo).trim()
    const fallbackAnchor = lineFrom + boundary.from

    return {
      text,
      from: lineFrom + boundary.from,
      to: lineFrom + boundary.to,
      editAnchor: text.length > 0 ? lineFrom + contentFrom : fallbackAnchor,
      editHead: text.length > 0 ? lineFrom + contentTo : fallbackAnchor,
    }
  })
}

function getTrimmedEndOffset(text: string): number {
  let end = text.length
  while (end > 0 && /\s/u.test(text[end - 1])) {
    end -= 1
  }
  return end
}

function lineIntersectsRange(line: LineInfo, range: TextRange | undefined): boolean {
  return Boolean(range && line.from <= range.to && line.to >= range.from)
}
