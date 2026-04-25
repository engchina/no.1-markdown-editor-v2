import { EditorSelection, Prec, type EditorState, type Extension, type SelectionRange } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

export interface PairedDelimiter {
  open: string
  close: string
}

export const DEFAULT_PAIRED_DELIMITERS: readonly PairedDelimiter[] = [
  { open: '(', close: ')' },
  { open: '[', close: ']' },
  { open: '{', close: '}' },
  { open: '"', close: '"' },
  { open: "'", close: "'" },
]

const CLOSING_DELIMITERS = new Set(DEFAULT_PAIRED_DELIMITERS.map((pair) => pair.close))

export function resolveEmptyPairExit(
  text: string,
  cursor: number,
  pairs: readonly PairedDelimiter[] = DEFAULT_PAIRED_DELIMITERS
): number | null {
  const position = clampCursor(text, cursor)

  for (const pair of pairs) {
    if (isCursorInsideEmptyPair(text, position, pair)) {
      return position + pair.close.length
    }
  }

  return null
}

export function resolveClosingDelimiterSkip(
  text: string,
  cursor: number,
  typed: string,
  pairs: readonly PairedDelimiter[] = DEFAULT_PAIRED_DELIMITERS
): number | null {
  if (!pairs.some((pair) => pair.close === typed)) return null

  const position = clampCursor(text, cursor)

  for (const pair of pairs) {
    if (typed !== pair.close) continue
    if (text.slice(position, position + pair.close.length) !== pair.close) continue

    if (isCursorInsideEmptyPair(text, position, pair) || hasUnclosedOpenerBefore(text, position, pair)) {
      return position + pair.close.length
    }
  }

  return null
}

export function exitEmptyPairedDelimiter(view: Pick<EditorView, 'state' | 'dispatch'>): boolean {
  const selection = resolvePairedDelimiterExitSelection(view.state, 'empty')
  if (!selection) return false

  view.dispatch({
    selection,
    scrollIntoView: true,
    userEvent: 'select',
  })
  return true
}

export function skipClosingPairedDelimiter(
  view: Pick<EditorView, 'state' | 'dispatch'>,
  typed: string
): boolean {
  const selection = resolvePairedDelimiterExitSelection(view.state, 'typed-close', typed)
  if (!selection) return false

  view.dispatch({
    selection,
    scrollIntoView: true,
    userEvent: 'input.type',
  })
  return true
}

export function buildPairedDelimiterExitExtension(): Extension {
  return [
    Prec.highest(
      EditorView.inputHandler.of((view, from, to, text) => {
        if (view.state.readOnly || view.composing || view.compositionStarted) return false
        if (from !== to || from !== view.state.selection.main.from || to !== view.state.selection.main.to) {
          return false
        }
        if (text.length !== 1 || !CLOSING_DELIMITERS.has(text)) return false

        return skipClosingPairedDelimiter(view, text)
      })
    ),
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: exitEmptyPairedDelimiter,
          preventDefault: true,
        },
      ])
    ),
  ]
}

function resolvePairedDelimiterExitSelection(
  state: EditorState,
  mode: 'empty' | 'typed-close',
  typed = ''
): EditorSelection | null {
  if (state.selection.ranges.some((range) => !range.empty)) return null

  const text = state.doc.toString()
  const ranges: Array<SelectionRange | null> = state.selection.ranges.map((range) => {
    const anchor =
      mode === 'empty'
        ? resolveEmptyPairExit(text, range.head)
        : resolveClosingDelimiterSkip(text, range.head, typed)

    return anchor === null ? null : EditorSelection.cursor(anchor)
  })

  if (ranges.some((range) => range === null)) return null
  const resolvedRanges = ranges.filter((range): range is SelectionRange => range !== null)

  return EditorSelection.create(resolvedRanges, state.selection.mainIndex)
}

function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return 0
  return Math.max(0, Math.min(Math.trunc(cursor), text.length))
}

function isCursorInsideEmptyPair(text: string, cursor: number, pair: PairedDelimiter): boolean {
  return (
    cursor >= pair.open.length &&
    cursor + pair.close.length <= text.length &&
    text.slice(cursor - pair.open.length, cursor) === pair.open &&
    text.slice(cursor, cursor + pair.close.length) === pair.close
  )
}

function hasUnclosedOpenerBefore(text: string, cursor: number, pair: PairedDelimiter): boolean {
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const before = text.slice(lineStart, cursor)

  if (pair.open === pair.close) {
    return countUnescapedToken(before, pair.open) % 2 === 1
  }

  let depth = 0
  for (let index = 0; index < before.length; index += 1) {
    if (isEscaped(before, index)) continue

    if (before.startsWith(pair.open, index)) {
      depth += 1
      index += pair.open.length - 1
      continue
    }

    if (before.startsWith(pair.close, index)) {
      depth = Math.max(0, depth - 1)
      index += pair.close.length - 1
    }
  }

  return depth > 0
}

function countUnescapedToken(text: string, token: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue
    if (!text.startsWith(token, index)) continue

    count += 1
    index += token.length - 1
  }
  return count
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}
