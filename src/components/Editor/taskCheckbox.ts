const TASK_MARKER_PATTERN = /^(\s*[-*+]\s)\[( |x|X)\]/

export interface TaskCheckboxChange {
  from: number
  to: number
  insert: '[ ]' | '[x]'
}

export function getTaskCheckboxChange(
  lineText: string,
  lineFrom: number
): TaskCheckboxChange | null {
  const match = lineText.match(TASK_MARKER_PATTERN)
  if (!match) return null

  const from = lineFrom + match[1].length
  const checked = match[2].toLowerCase() === 'x'

  return {
    from,
    to: from + 3,
    insert: checked ? '[ ]' : '[x]',
  }
}
