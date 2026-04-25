import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  placeholder as placeholderExtension,
  tooltips,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { EditorSelection, EditorState, type Extension } from '@codemirror/state'
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
import { collectFencedCodeBlocks, type TextRange } from './fencedCodeRanges.ts'
import { collectMathBlocks } from './mathBlockRanges.ts'
import { isThematicBreakLine } from './thematicBreak.ts'
import { collectInlineCodeRanges, findContainingTextRange } from './wysiwygInlineCode.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'
import { findBlockFootnoteRanges, findInlineFootnoteRanges } from './wysiwygFootnote.ts'

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
    '.cm-ai-ghost-text': {
      color: 'color-mix(in srgb, var(--text-muted) 84%, transparent)',
      fontStyle: 'italic',
      opacity: '0.82',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
    },
    '.cm-ai-ghost-text[data-ai-ghost-text="loading"]': {
      opacity: '0.6',
    },
    '.cm-ai-provenance-range': {
      background: 'transparent',
      borderRadius: '0',
      borderBottom: 'none',
      textDecoration: 'none',
    },
  },
  { dark: false }
)

const markdownUnderlineOverride = HighlightStyle.define([
  // CodeMirror's default markdown style underlines links and headings.
  // In the source editor this reads like rendered content, so remove it.
  { tag: [tags.link, tags.heading], textDecoration: 'none' },
])
// Keep ordinary spaces quiet. This mode focuses on Markdown-relevant invisibles:
// tabs, non-breaking spaces, and line-ending whitespace handled separately below.
const INVISIBLE_MARKDOWN_SPECIAL_CHARS = /[\t\u00a0]/g
const trailingSpaceMark = Decoration.mark({ class: 'cm-trailingSpace' })
const trailingSpaceDecorator = new MatchDecorator({
  regexp: / +(?=[\t ]*$)/g,
  // Decorate each trailing space separately so CSS can render exactly one dot per space.
  decorate(add, from, to) {
    for (let pos = from; pos < to; pos += 1) {
      add(pos, pos + 1, trailingSpaceMark)
    }
  },
})

export const markdownHighlight = [
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  syntaxHighlighting(markdownUnderlineOverride),
]

export const MARKDOWN_HARD_LINE_BREAK = '<br />\n'
export const MARKDOWN_PLAIN_LINE_BREAK = '\n'
const ATX_HEADING_PATTERN = /^(#{1,6})\s/
const SETEXT_HEADING_UNDERLINE_PATTERN = /^[ ]{0,3}(?:=+|-+)[ \t]*$/

function collectShiftEnterLiteralBlocks(markdown: string): readonly TextRange[] {
  const fencedCodeBlocks = collectFencedCodeBlocks(markdown)
  return [...fencedCodeBlocks, ...collectMathBlocks(markdown, fencedCodeBlocks)]
}

function isPositionInsideTextRanges(position: number, ranges: readonly TextRange[]): boolean {
  return ranges.some((range) => position >= range.from && position <= range.to)
}

function isSetextHeadingUnderlineLine(text: string): boolean {
  return SETEXT_HEADING_UNDERLINE_PATTERN.test(text)
}

function shouldInsertPlainLineBreakInLine(
  doc: Pick<EditorState['doc'], 'line' | 'lines'>,
  line: Pick<ReturnType<EditorState['doc']['lineAt']>, 'text' | 'number'>,
  lineOffset: number
): boolean {
  if (ATX_HEADING_PATTERN.test(line.text) || isThematicBreakLine(line.text) || isSetextHeadingUnderlineLine(line.text)) {
    return true
  }

  if (line.number < doc.lines && line.text.trim().length > 0) {
    const nextLine = doc.line(line.number + 1)
    if (isSetextHeadingUnderlineLine(nextLine.text)) {
      return true
    }
  }

  const inlineCodeRanges = collectInlineCodeRanges(line.text)
  if (findContainingTextRange(lineOffset, inlineCodeRanges)) return true

  if (findInlineMathRanges(line.text).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  if (findInlineFootnoteRanges(line.text, inlineCodeRanges).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  if (findBlockFootnoteRanges(line.text, inlineCodeRanges).some((range) => lineOffset >= range.from && lineOffset < range.to)) {
    return true
  }

  return false
}

export function insertMarkdownHardLineBreak(
  view: Pick<EditorView, 'state' | 'dispatch'>
): boolean {
  const markdown = view.state.doc.toString()
  const literalBlocks = collectShiftEnterLiteralBlocks(markdown)

  view.dispatch({
    ...view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from)
      const insert = isPositionInsideTextRanges(range.from, literalBlocks) ||
        shouldInsertPlainLineBreakInLine(view.state.doc, line, range.from - line.from)
        ? MARKDOWN_PLAIN_LINE_BREAK
        : MARKDOWN_HARD_LINE_BREAK

      return {
        changes: {
          from: range.from,
          to: range.to,
          insert,
        },
        range: EditorSelection.cursor(range.from + insert.length),
      }
    }),
    scrollIntoView: true,
    userEvent: 'input.type',
  })
  return true
}

export function buildCoreExtensions(options: {
  onChange: (content: string) => void
  onCursorChange: (line: number, col: number) => void
  onSelectionChange?: (view: EditorView, update: ViewUpdate) => void
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
    tooltips({ position: 'fixed' }),
    keymap.of([
      {
        key: 'Shift-Enter',
        run: insertMarkdownHardLineBreak,
      },
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
      if (update.selectionSet || update.docChanged) {
        options.onSelectionChange?.(update.view, update)
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

function buildMatchDecoratorExtension(decorator: MatchDecorator): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view)
      }

      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations)
      }
    },
    {
      decorations: (value): DecorationSet => value.decorations,
    }
  )
}

export function buildInvisibleCharacterExtensions(enabled: boolean): Extension[] {
  return enabled
    ? [
        buildMatchDecoratorExtension(trailingSpaceDecorator),
        highlightSpecialChars({
          addSpecialChars: INVISIBLE_MARKDOWN_SPECIAL_CHARS,
        }),
      ]
    : []
}

export function buildPlaceholderExtensions(placeholder?: string): Extension[] {
  return placeholder ? [placeholderExtension(placeholder)] : []
}
