export interface InlineMathRange {
  from: number
  to: number
  latex: string
  editAnchor: number
}

interface TextRange {
  from: number
  to: number
}

const INLINE_CODE_PATTERN = /(`+)(.+?)\1/g
const INLINE_MATH_PATTERN = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g

export function findInlineMathRanges(text: string): InlineMathRange[] {
  const ranges: InlineMathRange[] = []
  const excludedRanges = collectInlineCodeRanges(text)
  let match: RegExpExecArray | null

  while ((match = INLINE_MATH_PATTERN.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (rangeIntersectsExcludedRanges(from, to, excludedRanges)) continue

    const latex = match[1] ?? ''
    if (!latex) continue

    ranges.push({
      from,
      to,
      latex,
      editAnchor: from + 1,
    })
  }

  return ranges
}

function collectInlineCodeRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []
  let match: RegExpExecArray | null

  while ((match = INLINE_CODE_PATTERN.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }

  return ranges
}

function rangeIntersectsExcludedRanges(
  from: number,
  to: number,
  excludedRanges: readonly TextRange[]
): boolean {
  return excludedRanges.some((range) => from < range.to && to > range.from)
}
