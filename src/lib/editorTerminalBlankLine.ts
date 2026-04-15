export interface EditorDocLineLike {
  text: string
}

export interface EditorDocLike {
  lines: number
  line: (number: number) => EditorDocLineLike
}

export interface ArrowDownIntoTerminalBlankLineOptions {
  hasSingleCursor: boolean
  selectionEmpty: boolean
  selectionLineNumber: number
  docLineCount: number
  hasTerminalBlankLine: boolean
}

export interface ClickIntoTerminalBlankLineOptions {
  clickY: number
  documentEndBottom: number
  hasTerminalBlankLine: boolean
}

export function hasTerminalBlankLine(doc: EditorDocLike): boolean {
  return doc.line(doc.lines).text.length === 0
}

export function shouldInsertTerminalBlankLineOnArrowDown(
  options: ArrowDownIntoTerminalBlankLineOptions
): boolean {
  return (
    options.hasSingleCursor &&
    options.selectionEmpty &&
    options.selectionLineNumber === options.docLineCount &&
    !options.hasTerminalBlankLine
  )
}

export function shouldInsertTerminalBlankLineOnClickBelowDocumentEnd(
  options: ClickIntoTerminalBlankLineOptions
): boolean {
  return options.clickY > options.documentEndBottom + 1 && !options.hasTerminalBlankLine
}
