import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  placeholder as placeholderExtension,
} from '@codemirror/view'
import { EditorState, Extension } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const lightTheme = EditorView.theme(
  {
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
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 213, 0, 0.3)',
      outline: '1px solid rgba(255, 213, 0, 0.5)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255, 213, 0, 0.6)' },
    '.cm-activeLine': { backgroundColor: 'var(--editor-line-active)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      outline: '1px solid rgba(59, 130, 246, 0.4)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-activeLineGutter': { backgroundColor: 'var(--editor-line-active)' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'white' },
    },
  },
  { dark: false }
)

const markdownUnderlineOverride = HighlightStyle.define([
  // CodeMirror's default markdown style underlines links and headings.
  // In the source editor this reads like rendered content, so remove it.
  { tag: [tags.link, tags.heading], textDecoration: 'none' },
])

export const markdownHighlight = [
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  syntaxHighlighting(markdownUnderlineOverride),
]

export function buildCoreExtensions(options: {
  onChange: (content: string) => void
  onCursorChange: (line: number, col: number) => void
}): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    markdownHighlight,
    indentOnInput(),
    bracketMatching(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString())
      }
      if (update.selectionSet) {
        const selection = update.state.selection.main.head
        const line = update.state.doc.lineAt(selection)
        options.onCursorChange(line.number, selection - line.from + 1)
      }
    }),
    lightTheme,
  ]
}

export function buildLineNumberExtensions(): Extension[] {
  return [lineNumbers(), highlightActiveLineGutter(), foldGutter()]
}

export function buildWordWrapExtensions(enabled: boolean): Extension[] {
  return enabled ? [EditorView.lineWrapping] : []
}

export function buildPlaceholderExtensions(placeholder?: string): Extension[] {
  return placeholder ? [placeholderExtension(placeholder)] : []
}
