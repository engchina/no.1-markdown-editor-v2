import { collectInlineCodeRanges, findContainingTextRange } from './wysiwygInlineCode.ts'
import { hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { isThematicBreakLine } from './thematicBreak.ts'

export interface InlineItalicRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

const ASTERISK_ITALIC_PATTERN = /(?<!\*)(\*)(?!\*)((?:[^*])+?)(\*)(?!\*)/g
const UNDERSCORE_ITALIC_PATTERN =
  /(?<![\p{Letter}\p{Number}_])(_)(?![_\s])(.+?)(?<!\s)(_)(?![\p{Letter}\p{Number}_])/gu

export function findInlineItalicRanges(text: string): InlineItalicRange[] {
  if (isThematicBreakLine(text)) return []

  const ranges: InlineItalicRange[] = []
  const excludedRanges = collectInlineCodeRanges(text)

  collectInlineItalicRanges(text, ASTERISK_ITALIC_PATTERN, ranges, excludedRanges)
  collectInlineItalicRanges(text, UNDERSCORE_ITALIC_PATTERN, ranges, excludedRanges)

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to)
}

function collectInlineItalicRanges(
  text: string,
  pattern: RegExp,
  ranges: InlineItalicRange[],
  excludedRanges: readonly { from: number; to: number }[]
): void {
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (findContainingTextRange(from, excludedRanges) || findContainingTextRange(to - 1, excludedRanges)) {
      continue
    }

    const openingMarker = match[1] ?? ''
    const closingMarker = match[3] ?? openingMarker
    const closingMarkerStart = to - closingMarker.length
    const contentFrom = from + openingMarker.length
    const contentTo = to - closingMarker.length

    if (hasOddTrailingBackslashes(text, from) || hasOddTrailingBackslashes(text, closingMarkerStart)) {
      continue
    }

    if (contentFrom >= contentTo) continue

    ranges.push({
      from,
      to,
      contentFrom,
      contentTo,
    })
  }
}
