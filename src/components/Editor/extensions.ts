import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { EditorState, Extension, EditorSelection } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { wysiwygPlugin, wysiwygTheme } from './wysiwyg'

// Theme: Light
export const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-text)',
  },
  '.cm-content': {
    caretColor: 'var(--editor-cursor)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--editor-cursor)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--editor-selection)',
  },
  '.cm-panels': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255, 213, 0, 0.3)', outline: '1px solid rgba(255, 213, 0, 0.5)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255, 213, 0, 0.6)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-line-active)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
  '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: 'rgba(59, 130, 246, 0.15)', outline: '1px solid rgba(59, 130, 246, 0.4)' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--text-muted)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--editor-line-active)' },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)' },
  '.cm-tooltip': { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px' },
  '.cm-tooltip-autocomplete': { '& > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'white' } },
}, { dark: false })

// Markdown-specific syntax highlighting
export const markdownHighlight = syntaxHighlighting(defaultHighlightStyle, { fallback: true })

// Build the full extension set
export function buildExtensions(options: {
  lineNumbers: boolean
  wordWrap: boolean
  wysiwyg: boolean
  onChange: (content: string) => void
  onCursorChange: (line: number, col: number) => void
}): Extension[] {
  const extensions: Extension[] = [
    // History
    history(),

    // Display
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),

    // Language
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: true,
    }),
    markdownHighlight,

    // Editing
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),

    // Keymaps
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),

    // Markdown-specific keyboard shortcuts
    keymap.of([
      // Bold: Ctrl+B
      {
        key: 'Ctrl-b',
        mac: 'Cmd-b',
        run: (view) => wrapSelection(view, '**', '**'),
      },
      // Italic: Ctrl+I
      {
        key: 'Ctrl-i',
        mac: 'Cmd-i',
        run: (view) => wrapSelection(view, '*', '*'),
      },
      // Strikethrough: Ctrl+Shift+S
      {
        key: 'Ctrl-Shift-s',
        mac: 'Cmd-Shift-s',
        run: (view) => wrapSelection(view, '~~', '~~'),
      },
      // Inline code: Ctrl+`
      {
        key: 'Ctrl-`',
        mac: 'Cmd-`',
        run: (view) => wrapSelection(view, '`', '`'),
      },
    ]),

    // Change listener
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString())
      }
      if (update.selectionSet) {
        const sel = update.state.selection.main.head
        const line = update.state.doc.lineAt(sel)
        options.onCursorChange(line.number, sel - line.from + 1)
      }
    }),

    // Base theme
    lightTheme,
  ]

  // Conditional features
  if (options.lineNumbers) {
    extensions.push(lineNumbers(), highlightActiveLineGutter(), foldGutter())
  }

  if (options.wordWrap) {
    extensions.push(EditorView.lineWrapping)
  }

  if (options.wysiwyg) {
    extensions.push(wysiwygPlugin, wysiwygTheme)
  }

  return extensions
}

// Helper: wrap selection with markers
function wrapSelection(view: EditorView, before: string, after: string): boolean {
  const { state } = view
  const changes = state.changeByRange((range) => {
    if (range.empty) {
      const insertText = before + after
      return {
        changes: { from: range.from, insert: insertText },
        range: EditorSelection.cursor(range.from + before.length),
      }
    }
    const selectedText = state.sliceDoc(range.from, range.to)
    return {
      changes: { from: range.from, to: range.to, insert: before + selectedText + after },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + selectedText.length),
    }
  })
  view.dispatch(changes)
  return true
}

// Helper: insert heading
export function insertHeading(view: EditorView, level: number): boolean {
  const prefix = '#'.repeat(level) + ' '
  const { state } = view
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const lineText = state.sliceDoc(line.from, line.to)
    const cleanLine = lineText.replace(/^#+\s/, '')
    return {
      changes: { from: line.from, to: line.to, insert: prefix + cleanLine },
      range: EditorSelection.cursor(line.from + prefix.length + cleanLine.length),
    }
  })
  view.dispatch(changes)
  return true
}
