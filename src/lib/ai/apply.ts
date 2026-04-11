import { resolveCurrentBlockRange } from './context.ts'
import { prepareMarkdownInsertion } from '../markdownInsertion.ts'
import type { AIApplySnapshot, AIOutputTarget } from './types.ts'

export interface AIResolvedApplyChange {
  range: { from: number; to: number }
  text: string
  selectionAnchor: number
}

export function isAIApplySnapshotStale(snapshot: AIApplySnapshot, currentDoc: string): boolean {
  return snapshot.docText !== currentDoc
}

export function resolveAIApplyChange(
  outputTarget: AIOutputTarget,
  snapshot: AIApplySnapshot,
  currentDoc: string,
  text: string
): AIResolvedApplyChange {
  if (outputTarget === 'new-note') {
    throw new Error('New note output must be handled outside the current document apply flow.')
  }

  let range: { from: number; to: number }
  let nextText = text

  if (outputTarget === 'replace-selection') {
    range = { from: snapshot.selectionFrom, to: snapshot.selectionTo }
  } else if (outputTarget === 'insert-below') {
    const insertBelowOffset = resolveInsertBelowOffset(snapshot, currentDoc)
    range = { from: insertBelowOffset, to: insertBelowOffset }
    nextText = formatInsertBelowText(currentDoc, insertBelowOffset, text)
  } else {
    range = { from: snapshot.anchorOffset, to: snapshot.anchorOffset }
  }

  const insertion = prepareMarkdownInsertion(nextText, currentDoc.slice(range.to))

  return {
    range,
    text: insertion.text,
    selectionAnchor: range.from + insertion.selectionOffset,
  }
}

export function formatInsertBelowText(currentDoc: string, blockTo: number, text: string): string {
  const normalized = text.trim()
  if (!normalized) return ''

  const before = currentDoc.slice(0, blockTo)
  const after = currentDoc.slice(blockTo)
  const beforeHasBlankGap = /(?:\r?\n){2}$/u.test(before) || before.length === 0
  const beforeEndsWithNewline = /\r?\n$/u.test(before)
  const afterHasBlankGap = /^(?:\r?\n){2}/u.test(after) || after.length === 0
  const afterStartsWithNewline = /^\r?\n/u.test(after)

  const prefix = beforeHasBlankGap ? '' : beforeEndsWithNewline ? '\n' : '\n\n'
  const suffix = afterHasBlankGap ? '' : afterStartsWithNewline ? '\n' : '\n\n'

  return `${prefix}${normalized}${suffix}`
}

function resolveInsertBelowOffset(snapshot: AIApplySnapshot, currentDoc: string): number {
  if (snapshot.selectionFrom === snapshot.selectionTo) return snapshot.blockTo

  const lastSelectedOffset = Math.max(snapshot.selectionFrom, snapshot.selectionTo - 1)
  const selectionTailBlock = resolveCurrentBlockRange(currentDoc, lastSelectedOffset)

  return selectionTailBlock?.to ?? snapshot.selectionTo
}
