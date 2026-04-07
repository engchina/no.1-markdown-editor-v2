/**
 * Markdown format commands for CodeMirror 6
 * Wired to toolbar buttons and editor keyboard shortcuts.
 */

import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

export type FormatAction =
  | 'bold' | 'italic' | 'underline' | 'strikethrough'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'code' | 'codeblock'
  | 'link' | 'image'
  | 'quote' | 'ul' | 'ol' | 'task'
  | 'hr' | 'table'

export function applyFormat(view: EditorView, action: FormatAction): void {
  switch (action) {
    case 'bold':          return wrapInline(view, '**', '**', 'bold text')
    case 'italic':        return wrapInline(view, '*', '*', 'italic text')
    case 'underline':     return wrapInline(view, '<u>', '</u>', 'underlined text')
    case 'strikethrough': return wrapInline(view, '~~', '~~', 'strikethrough')
    case 'code':          return wrapInline(view, '`', '`', 'code')
    case 'h1': return insertHeading(view, 1)
    case 'h2': return insertHeading(view, 2)
    case 'h3': return insertHeading(view, 3)
    case 'h4': return insertHeading(view, 4)
    case 'h5': return insertHeading(view, 5)
    case 'h6': return insertHeading(view, 6)
    case 'link':      return insertLink(view)
    case 'image':     return insertImage(view)
    case 'quote':     return insertLinePrefix(view, '> ')
    case 'ul':        return insertLinePrefix(view, '- ')
    case 'ol':        return insertOrderedList(view)
    case 'task':      return insertLinePrefix(view, '- [ ] ')
    case 'hr':        return insertBlock(view, '\n---\n')
    case 'codeblock': return insertCodeBlock(view)
    case 'table':     return insertTable(view)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function wrapInline(view: EditorView, before: string, after: string, placeholder: string): void {
  view.dispatch(
    view.state.changeByRange((range) => {
      if (range.empty) {
        const insert = before + placeholder + after
        return {
          changes: { from: range.from, insert },
          range: EditorSelection.range(range.from + before.length, range.from + before.length + placeholder.length),
        }
      }
      const selected = view.state.sliceDoc(range.from, range.to)
      // Toggle: if already wrapped, unwrap
      if (selected.startsWith(before) && selected.endsWith(after)) {
        const inner = selected.slice(before.length, selected.length - after.length)
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        }
      }
      const insert = before + selected + after
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + selected.length),
      }
    })
  )
  view.focus()
}

function insertHeading(view: EditorView, level: number): void {
  const prefix = '#'.repeat(level) + ' '
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from)
      const text = view.state.sliceDoc(line.from, line.to)
      // Strip existing heading markers
      const clean = text.replace(/^#{1,6}\s/, '')
      const newText = prefix + clean
      return {
        changes: { from: line.from, to: line.to, insert: newText },
        range: EditorSelection.cursor(line.from + newText.length),
      }
    })
  )
  view.focus()
}

function insertLinePrefix(view: EditorView, prefix: string): void {
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from)
      const text = view.state.sliceDoc(line.from, line.to)
      if (text.startsWith(prefix)) {
        // Toggle off
        return {
          changes: { from: line.from, to: line.from + prefix.length, insert: '' },
          range: EditorSelection.cursor(Math.max(line.from, range.from - prefix.length)),
        }
      }
      return {
        changes: { from: line.from, insert: prefix },
        range: EditorSelection.cursor(range.from + prefix.length),
      }
    })
  )
  view.focus()
}

function insertOrderedList(view: EditorView): void {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.from)
  const text = state.sliceDoc(line.from, line.to)
  if (/^\d+\.\s/.test(text)) {
    // Toggle off
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: text.replace(/^\d+\.\s/, '') },
    })
  } else {
    view.dispatch({
      changes: { from: line.from, insert: '1. ' },
      selection: { anchor: line.from + 3 + (state.selection.main.from - line.from) },
    })
  }
  view.focus()
}

function insertLink(view: EditorView): void {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const linkText = selected || 'link text'
  const insert = `[${linkText}](url)`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + linkText.length + 3, head: range.from + linkText.length + 6 },
  })
  view.focus()
}

function insertImage(view: EditorView): void {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const altText = selected || 'alt text'
  const insert = `![${altText}](url)`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + altText.length + 4, head: range.from + altText.length + 7 },
  })
  view.focus()
}

function insertBlock(view: EditorView, text: string): void {
  const { state } = view
  const pos = state.selection.main.to
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  })
  view.focus()
}

function insertCodeBlock(view: EditorView): void {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const insert = `\`\`\`\n${selected || 'code here'}\n\`\`\``
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + 4, head: range.from + 4 + (selected || 'code here').length },
  })
  view.focus()
}

function insertTable(view: EditorView): void {
  const table = `| Header 1 | Header 2 | Header 3 |
| -------- | -------- | -------- |
| Cell     | Cell     | Cell     |
| Cell     | Cell     | Cell     |`
  const { state } = view
  const pos = state.selection.main.to
  const line = state.doc.lineAt(pos)
  const prefix = line.text.trim() ? '\n\n' : ''
  view.dispatch({
    changes: { from: pos, insert: prefix + table + '\n' },
    selection: { anchor: pos + prefix.length + 2, head: pos + prefix.length + 10 },
  })
  view.focus()
}
