export interface WysiwygBlockquoteLine {
  prefix: string
  content: string
  depth: number
  isEmpty: boolean
  isLazyContinuation?: boolean
}

export function parseWysiwygBlockquoteLine(text: string): WysiwygBlockquoteLine | null {
  const match = /^(\s*(?:>\s*)+)(.*)$/.exec(text)
  if (!match) return null

  const prefix = match[1] ?? ''
  const content = match[2] ?? ''

  return {
    prefix,
    content,
    depth: (prefix.match(/>/g) ?? []).length,
    isEmpty: content.trim().length === 0,
  }
}

const BLOCK_HTML_TAG_RE =
  /^<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|>|\/>)/i

function stripCommonMarkBlockIndent(text: string): string {
  return text.replace(/^[ \t]{0,3}/u, '')
}

function isThematicBreakCandidate(text: string): boolean {
  const trimmed = text.trim()
  return /^(?:\*\s*){3,}$/.test(trimmed) ||
    /^(?:-\s*){3,}$/.test(trimmed) ||
    /^(?:_\s*){3,}$/.test(trimmed)
}

function startsNewNonParagraphBlock(text: string): boolean {
  const blockText = stripCommonMarkBlockIndent(text)
  if (!blockText) return false
  if (/^(?:#{1,6})(?:\s|$)/u.test(blockText)) return true
  if (/^(?:`{3,}|~{3,})/u.test(blockText)) return true
  if (/^(?:[-+*]|\d{1,9}[.)])\s+/u.test(blockText)) return true
  if (isThematicBreakCandidate(blockText)) return true
  if (BLOCK_HTML_TAG_RE.test(blockText)) return true
  return false
}

function canOpenLazyContinuation(content: string): boolean {
  if (content.trim().length === 0) return false

  const blockText = stripCommonMarkBlockIndent(content)
  if (/^(?:#{1,6})(?:\s|$)/u.test(blockText)) return false
  if (/^(?:`{3,}|~{3,})/u.test(blockText)) return false
  if (/^(?: {4}|\t)/u.test(content)) return false
  if (isThematicBreakCandidate(blockText)) return false
  if (BLOCK_HTML_TAG_RE.test(blockText)) return false
  return true
}

function canBeLazyContinuationLine(text: string): boolean {
  return text.trim().length > 0 && !startsNewNonParagraphBlock(text)
}

export function collectWysiwygBlockquoteLines(markdown: string): Map<number, WysiwygBlockquoteLine> {
  const blockquoteLines = new Map<number, WysiwygBlockquoteLine>()
  const lines = markdown.split('\n')
  let lazyContinuationDepth = 0

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1
    const text = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const explicitLine = parseWysiwygBlockquoteLine(text)

    if (explicitLine) {
      const continuesDeeperQuote =
        lazyContinuationDepth > explicitLine.depth &&
        canOpenLazyContinuation(explicitLine.content)
      const depth = continuesDeeperQuote ? lazyContinuationDepth : explicitLine.depth

      blockquoteLines.set(lineNumber, {
        ...explicitLine,
        depth,
        isLazyContinuation: continuesDeeperQuote,
      })
      lazyContinuationDepth = canOpenLazyContinuation(explicitLine.content) ? depth : 0
      return
    }

    if (lazyContinuationDepth > 0 && canBeLazyContinuationLine(text)) {
      blockquoteLines.set(lineNumber, {
        prefix: '',
        content: text,
        depth: lazyContinuationDepth,
        isEmpty: false,
        isLazyContinuation: true,
      })
      return
    }

    lazyContinuationDepth = 0
  })

  return blockquoteLines
}
