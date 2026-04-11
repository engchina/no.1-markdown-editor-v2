export interface MarkdownInsertionPlan {
  text: string
  selectionOffset: number
}

const LEADING_LINE_BREAK_PATTERN = /^(?:\r\n|\n|\r)/u
const TRAILING_LINE_BREAK_PATTERN = /(?:\r\n|\n|\r)$/u

export function prepareMarkdownInsertion(
  markdownText: string,
  followingText = ''
): MarkdownInsertionPlan {
  if (!markdownText) {
    return {
      text: markdownText,
      selectionOffset: 0,
    }
  }

  if (TRAILING_LINE_BREAK_PATTERN.test(markdownText)) {
    return {
      text: markdownText,
      selectionOffset: markdownText.length,
    }
  }

  const existingLineBreak = followingText.match(LEADING_LINE_BREAK_PATTERN)?.[0]
  if (existingLineBreak) {
    return {
      text: markdownText,
      selectionOffset: markdownText.length + existingLineBreak.length,
    }
  }

  return {
    text: `${markdownText}\n`,
    selectionOffset: markdownText.length + 1,
  }
}
