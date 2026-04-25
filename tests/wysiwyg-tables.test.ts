import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'
import {
  collectInactiveWysiwygTables,
  decodeMarkdownTableCellText,
  encodeMarkdownTableCellText,
  isBlankLineBelowTableSelection,
  resolveDecodedTableCellOffset,
  resolveEncodedTableCellOffset,
  resolveAdjacentTableCellLocation,
  resolveNearestTableCellLocation,
  resolveTableBodyRowInsertionPlan,
  resolveTableKeyAction,
  resolveTableCell,
} from '../src/components/Editor/wysiwygTable.ts'

function collectVisibleTables(markdown: string, anchor: number) {
  const state = EditorState.create({
    doc: markdown,
    selection: { anchor },
  })

  return collectInactiveWysiwygTables(
    {
      state,
      visibleRanges: [{ from: 0, to: markdown.length }],
    },
    collectMarkdownTableBlocks(markdown)
  )
}

test('collectInactiveWysiwygTables returns valid tables for rendering when the selection is outside', () => {
  const markdown = [
    'Before',
    '',
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
    '',
    'After',
  ].join('\n')

  const tables = collectVisibleTables(markdown, 0)

  assert.equal(tables.length, 1)
  assert.deepEqual(tables[0].alignments, [null, 'right'])
})

test('collectInactiveWysiwygTables keeps tables rendered when the selection enters the source block', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
  ].join('\n')

  const tables = collectVisibleTables(markdown, markdown.indexOf('a'))

  assert.equal(tables.length, 1)
})

test('table cell text helpers keep escaped pipes stable for inline editors', () => {
  assert.equal(decodeMarkdownTableCellText('left \\| right'), 'left | right')
  assert.equal(encodeMarkdownTableCellText('left | right'), 'left \\| right')
})

test('table cell text helpers preserve boundary spaces for inline editors', () => {
  assert.equal(decodeMarkdownTableCellText('&nbsp;left'), ' left')
  assert.equal(decodeMarkdownTableCellText('right&nbsp;'), 'right ')
  assert.equal(decodeMarkdownTableCellText('&nbsp;mid \\| tail&nbsp;'), ' mid | tail ')

  assert.equal(encodeMarkdownTableCellText(' left'), '&nbsp;left')
  assert.equal(encodeMarkdownTableCellText('right '), 'right&nbsp;')
  assert.equal(encodeMarkdownTableCellText(' '), '&nbsp;')
  assert.equal(encodeMarkdownTableCellText(' left | right '), '&nbsp;left \\| right&nbsp;')
  assert.equal(encodeMarkdownTableCellText('a b'), 'a b')
})

test('table cell text helpers round-trip <br /> markup as newline characters', () => {
  assert.equal(decodeMarkdownTableCellText('line one<br />line two'), 'line one\nline two')
  assert.equal(decodeMarkdownTableCellText('a<br/>b<br>c'), 'a\nb\nc')
  assert.equal(encodeMarkdownTableCellText('line one\nline two'), 'line one<br />line two')
  assert.equal(encodeMarkdownTableCellText('a\nb\nc'), 'a<br />b<br />c')
  assert.equal(encodeMarkdownTableCellText(' a\nb '), '&nbsp;a<br />b&nbsp;')
})

test('table cell offset helpers keep encoded boundary spaces aligned with the inline editor selection', () => {
  const raw = '&nbsp;left \\| right&nbsp;'
  const display = ' left | right '

  assert.equal(decodeMarkdownTableCellText(raw), display)

  for (let offset = 0; offset <= display.length; offset += 1) {
    const rawOffset = resolveEncodedTableCellOffset(display, offset)
    assert.equal(resolveDecodedTableCellOffset(raw, rawOffset), offset)
  }
})

test('table cell navigation moves across the header and body grid', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
    '| c | d |',
  ].join('\n')

  const [table] = collectMarkdownTableBlocks(markdown)
  const start = { section: 'head', rowIndex: 0, columnIndex: 1 } as const

  assert.deepEqual(resolveAdjacentTableCellLocation(table, start, 'next'), {
    section: 'body',
    rowIndex: 0,
    columnIndex: 0,
  })
  assert.deepEqual(resolveAdjacentTableCellLocation(table, start, 'down'), {
    section: 'body',
    rowIndex: 0,
    columnIndex: 1,
  })
  assert.deepEqual(resolveAdjacentTableCellLocation(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'previous'), {
    section: 'head',
    rowIndex: 0,
    columnIndex: 1,
  })
})

test('table key actions resolve Typora-style enter, backspace, tab, shift-tab, ctrl-enter, shift-enter, and navigation behavior', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
    '| c | d |',
  ].join('\n')

  const [table] = collectMarkdownTableBlocks(markdown)

  assert.deepEqual(resolveTableKeyAction(table, { section: 'head', rowIndex: 0, columnIndex: 1 }, 'enter'), {
    kind: 'focus-cell',
    location: { section: 'body', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'end',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'backspace'), {
    kind: 'focus-cell',
    location: { section: 'head', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'end',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'head', rowIndex: 0, columnIndex: 0 }, 'backspace'), {
    kind: 'noop',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'tab'), {
    kind: 'focus-cell',
    location: { section: 'body', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'preserve',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 1 }, 'shift-tab'), {
    kind: 'focus-cell',
    location: { section: 'body', rowIndex: 0, columnIndex: 0 },
    selectionBehavior: 'preserve',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 1, columnIndex: 1 }, 'enter'), {
    kind: 'exit-table',
    direction: 'after',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 1, columnIndex: 1 }, 'arrow-down'), {
    kind: 'exit-table',
    direction: 'after',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 1 }, 'shift-enter'), {
    kind: 'insert-inline-break',
    insertText: '<br />',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'arrow-left'), {
    kind: 'focus-cell',
    location: { section: 'head', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'end',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'head', rowIndex: 0, columnIndex: 0 }, 'arrow-left'), {
    kind: 'noop',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'arrow-right'), {
    kind: 'focus-cell',
    location: { section: 'body', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'start',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 1, columnIndex: 1 }, 'arrow-right'), {
    kind: 'noop',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'delete'), {
    kind: 'focus-cell',
    location: { section: 'body', rowIndex: 0, columnIndex: 1 },
    selectionBehavior: 'start',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 1, columnIndex: 1 }, 'delete'), {
    kind: 'noop',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'escape'), {
    kind: 'exit-table',
    direction: 'after',
  })
  assert.deepEqual(resolveTableKeyAction(table, { section: 'head', rowIndex: 0, columnIndex: 1 }, 'escape'), {
    kind: 'exit-table',
    direction: 'after',
  })
})

test('table row insertion plans target the next body row slot for tab boundaries and ctrl-enter', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
    '| c | d |',
  ].join('\n')

  const [table] = collectMarkdownTableBlocks(markdown)

  assert.deepEqual(
    resolveTableBodyRowInsertionPlan(table, { section: 'head', rowIndex: 0, columnIndex: 0 }),
    {
      insertFrom: table.rows[0].from,
      insertText: '|  |  |\n',
      focusAnchor: table.rows[0].from + 1,
      focusLocation: { section: 'body', rowIndex: 0, columnIndex: 0 },
    }
  )
  assert.deepEqual(
    resolveTableKeyAction(table, { section: 'body', rowIndex: 1, columnIndex: 1 }, 'tab'),
    {
      kind: 'insert-body-row-below',
      plan: {
        insertFrom: table.rows[1].to,
        insertText: '\n|  |  |',
        focusAnchor: table.rows[1].to + 2,
        focusLocation: { section: 'body', rowIndex: 2, columnIndex: 0 },
      },
    }
  )
  assert.deepEqual(
    resolveTableKeyAction(table, { section: 'head', rowIndex: 0, columnIndex: 0 }, 'shift-tab'),
    { kind: 'exit-table', direction: 'before' }
  )
  assert.deepEqual(
    resolveTableKeyAction(table, { section: 'body', rowIndex: 0, columnIndex: 0 }, 'ctrl-enter'),
    {
      kind: 'insert-body-row-below',
      plan: {
        insertFrom: table.rows[0].to,
        insertText: '\n|  |  |',
        focusAnchor: table.rows[0].to + 2,
        focusLocation: { section: 'body', rowIndex: 1, columnIndex: 0 },
      },
    }
  )
})

test('nearest table cell resolution still resolves a real editable cell for divider positions', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
  ].join('\n')

  const [table] = collectMarkdownTableBlocks(markdown)
  const dividerOffset = markdown.indexOf('---:')
  const location = resolveNearestTableCellLocation(table, dividerOffset)
  const cell = location ? resolveTableCell(table, location) : null

  assert.ok(location)
  assert.ok(cell)
  assert.ok(['Left', 'Right', 'a', 'b'].includes(cell.text))
})

test('blank-line selection detection only matches the immediate empty line below a table', () => {
  const markdown = [
    'Before',
    '',
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
    '',
    'After',
  ].join('\n')

  const state = EditorState.create({ doc: markdown })
  const [table] = collectMarkdownTableBlocks(markdown)
  const blankLine = state.doc.line(6)
  const afterLine = state.doc.line(7)

  assert.equal(isBlankLineBelowTableSelection(state.doc, [table], blankLine.from), true)
  assert.equal(isBlankLineBelowTableSelection(state.doc, [table], blankLine.to), true)
  assert.equal(isBlankLineBelowTableSelection(state.doc, [table], afterLine.from), false)
})

test('wysiwyg table integration keeps the table rendered while exposing an inline cell editor', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')
  const tableSource = await readFile(new URL('../src/components/Editor/wysiwygTable.ts', import.meta.url), 'utf8')

  assert.match(source, /class TableWidget extends WidgetType/u)
  assert.match(source, /wrapper\.className = 'cm-wysiwyg-table'/u)
  assert.match(source, /wrapper\.dataset\.tableEditStart = String\(table\.editAnchor\)/u)
  assert.match(source, /new TableWidget\(table, activeTableCellForTable, spellcheckConfig\)/u)
  assert.match(source, /function createTableToolbarDom\(\): HTMLDivElement \{/u)
  assert.match(source, /function syncTableToolbarDom\(/u)
  assert.match(source, /function applyTableToolbarAction\(/u)
  assert.match(source, /toolbar\.className = 'cm-wysiwyg-table__toolbar'/u)
  assert.match(source, /element\.dataset\.tableColumnKind = columnKind/u)
  assert.match(source, /element\.dataset\.tableEditStart = String\(cell\.editAnchor\)/u)
  assert.match(source, /input\.dataset\.tableEditStart = String\(cell\.editAnchor\)/u)
  assert.match(source, /renderInlineMarkdownFragment\(cell\.text, \{ tableLineBreakMode: 'placeholder' \}\)/u)
  assert.match(source, /const ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS = new Map<number, readonly number\[\]>\(\)/u)
  assert.match(source, /function readRenderedTableColumnWidths\(target: HTMLElement \| null\): readonly number\[\] \| null/u)
  assert.match(source, /syncTableColumnWidthColGroup\(/u)
  assert.match(source, /input\.className = 'cm-wysiwyg-table__input'/u)
  assert.match(source, /document\.createElement\('textarea'\)/u)
  assert.match(source, /decodeMarkdownTableCellText\(cell\.text\)/u)
  assert.match(source, /encodeMarkdownTableCellText\(input\.value\)/u)
  assert.match(source, /ensureTableInputKeydownBinding\(input\)/u)
  assert.match(source, /input\.addEventListener\('keydown', handleNativeTableInputKeydown\)/u)
  assert.match(source, /input\.addEventListener\('paste', handleNativeTableInputPaste\)/u)
  assert.match(source, /function sanitizeTableCellPasteText\(text: string\): string \{[\s\S]*?replace\(\/\\r\\n\?\/g, '\\n'\)[\s\S]*?replace\(\/\\t\+\/g, ' '\)/u)
  assert.match(source, /const view = EditorView\.findFromDOM\(input\)/u)
  assert.match(source, /event\.stopPropagation\(\)/u)
  assert.match(source, /isPlainBackspaceForEmptyTableCell\(event, input\)/u)
  assert.match(source, /applyTableKeyCommand\(view, input, 'backspace'\)/u)
  assert.match(source, /const command = resolveTableKeyCommand\(event, input\)/u)
  assert.match(source, /if \(event\.shiftKey\) return 'shift-enter'/u)
  assert.match(source, /const action = resolveTableKeyAction\(resolved\.table, resolved\.location, command\)/u)
  assert.match(source, /case 'insert-body-row-below':[\s\S]*?insertTableBodyRowBelow/u)
  assert.match(source, /case 'insert-inline-break':[\s\S]*?insertInlineBreakInTableCell/u)
  assert.match(source, /case 'noop':\s*return true/u)
  assert.match(source, /matchesWysiwygUndoShortcut\(event\)/u)
  assert.match(source, /matchesWysiwygRedoShortcut\(event\)/u)
  assert.match(source, /dispatchWysiwygHistory\('undo'\)/u)
  assert.match(source, /dispatchWysiwygHistory\('redo'\)/u)
  assert.match(source, /queueFocusTableCellInput\(view, nextActiveTableCell\)/u)
  assert.match(source, /function queueFocusTableCellInput\([\s\S]*?const focusInput = \(\) => \{[\s\S]*?input\.focus\(\{ preventScroll: true \}\)[\s\S]*?setTimeout\(focusInput, 0\)[\s\S]*?requestAnimationFrame\(focusInput\)[\s\S]*?requestAnimationFrame\(\(\) => requestAnimationFrame\(focusInput\)\)/u)
  assert.match(source, /function resolveTableColumnKind\(table: MarkdownTableBlock, columnIndex: number\): 'text' \| 'numeric'/u)
  assert.match(source, /const NUMERIC_CELL_RE = /u)
  assert.ok(source.includes('(?:[$€£¥₹]\\s*)?'))
  assert.match(source, /function isCompactNumericCell\(value: string\): boolean \{[\s\S]*?return NUMERIC_CELL_RE\.test\(value\)/u)
  assert.match(source, /function activateTable\(view: EditorView, target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /paste\(event, view\) \{[\s\S]*?handleDocumentClipboardTablePaste\(event, view\)/u)
  assert.match(source, /function handleDocumentClipboardTablePaste\(event: ClipboardEvent, view: EditorView\): boolean \{/u)
  assert.match(source, /convertClipboardToMarkdownTable\(\{/u)
  assert.match(source, /const wysiwygTableDecorationField = StateField\.define<WysiwygTableDecorationState>\(/u)
  assert.match(source, /EditorView\.decorations\.from\(field, \(value\) => value\.decorations\)/u)
  assert.match(source, /export const wysiwygTableDecorations = \[wysiwygTableDecorationField, wysiwygGutterClassField\]/u)
  assert.match(source, /Decoration\.replace\(\{ widget: new TableWidget\(table, activeTableCellForTable, spellcheckConfig\), block: true \}\)/u)
  assert.match(source, /view\.dom\.classList\.toggle\(TABLE_EDITING_CLASS, this\.activeTableCell !== null\)/u)
  assert.match(source, /ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS\.set\(resolved\.table\.from, columnWidths\)/u)
  assert.match(source, /queueFocusTableCellInput\(view, nextActiveTableCell\)/u)
  assert.match(source, /const PROSE_BLOCK_INSET = 'var\(--md-block-shell-inset, 32px\)'/u)
  assert.match(source, /'\.cm-wysiwyg-table-anchor-line': \{[\s\S]*?padding: '0 !important'/u)
  assert.match(source, /'\.cm-wysiwyg-table-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-table-gap-line': \{[\s\S]*?minHeight: '1\.15em'[\s\S]*?padding: `0 \$\{PROSE_BLOCK_INSET\} !important`[\s\S]*?lineHeight: '1\.15'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table': \{[\s\S]*?display: 'block'[\s\S]*?width: '100%'[\s\S]*?boxSizing: 'border-box'[\s\S]*?pointerEvents: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-table__surface': \{[\s\S]*?margin: `0 \$\{PROSE_BLOCK_INSET\}`[\s\S]*?overflowX: 'auto'[\s\S]*?pointerEvents: 'auto'/u)
  assert.match(source, /'\.cm-wysiwyg-table__toolbar': \{[\s\S]*?margin: `0 \$\{PROSE_BLOCK_INSET\} 6px`[\s\S]*?display: 'flex'/u)
  assert.match(source, /'\.cm-wysiwyg-table__grid': \{[\s\S]*?tableLayout: 'auto'[\s\S]*?margin: '0'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__head-cell, \.cm-wysiwyg-table__cell': \{[\s\S]*?padding: '8px 16px'[\s\S]*?whiteSpace: 'normal'[\s\S]*?overflowWrap: 'anywhere'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__head-cell:empty::before, \.cm-wysiwyg-table__cell:empty::before': \{[\s\S]*?content: '"\\\\00a0"'[\s\S]*?display: 'block'[\s\S]*?visibility: 'hidden'/u)
  assert.match(source, /'\.cm-wysiwyg-table__line-break-marker': \{[\s\S]*?display: 'block'[\s\S]*?whiteSpace: 'nowrap'[\s\S]*?fontFamily: 'var\(--font-mono, monospace\)'[\s\S]*?lineHeight: '1\.6'[\s\S]*?pointerEvents: 'none'/u)
  assert.match(source, /'\.cm-wysiwyg-table__cell--active': \{[\s\S]*?boxShadow:/u)
  assert.match(source, /'\.cm-wysiwyg-table-editing \.cm-cursor, \.cm-wysiwyg-table-editing \.cm-dropCursor': \{[\s\S]*?opacity: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-table__input': \{[\s\S]*?width: '100%'[\s\S]*?minWidth: '0'[\s\S]*?maxWidth: '100%'[\s\S]*?boxSizing: 'border-box'/u)
  assert.doesNotMatch(source, /'\.cm-wysiwyg-table:hover \.cm-wysiwyg-table__surface': \{/u)
  assert.ok(source.includes(`'.cm-wysiwyg-table__head-cell[data-table-column-kind="numeric"], .cm-wysiwyg-table__cell[data-table-column-kind="numeric"]': {`))
  assert.ok(source.includes(`width: '1%'`))
  assert.ok(source.includes(`whiteSpace: 'nowrap'`))
  assert.match(tableSource, /const TABLE_NAVIGATION_ROWS_CACHE = new WeakMap/u)
  assert.match(tableSource, /function getTableNavigationRows\(table: MarkdownTableBlock\): readonly MarkdownTableRow\[\] \{/u)
  assert.match(tableSource, /const rows = getTableNavigationRows\(table\)/u)
})

test('wysiwyg table exit path restores editor focus after moving below the table', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /function restoreEditorFocusAfterTableExit\(view: EditorView\): void \{[\s\S]*?const focusView = \(\) => \{[\s\S]*?setTimeout\(focusView, 0\)[\s\S]*?requestAnimationFrame\(\(\) => requestAnimationFrame\(focusView\)\)/u)
  assert.match(source, /const exitedTableEditing =[\s\S]*?previousActiveTableCell !== null[\s\S]*?this\.activeTableCell === null[\s\S]*?update\.selectionSet[\s\S]*?activeElement === update\.view\.dom\.ownerDocument\.body/u)
  assert.match(source, /const shouldRestoreActiveTableInputFocus =[\s\S]*?this\.activeTableCell !== null[\s\S]*?update\.selectionSet[\s\S]*?!areActiveTableCellsEqual\(this\.activeTableCell, focusedActiveTableCell\)/u)
  assert.match(source, /if \(exitedTableEditing\) \{[\s\S]*?restoreEditorFocusAfterTableExit\(update\.view\)/u)
  assert.match(source, /if \(\s*this\.activeTableCell &&[\s\S]*?shouldRestoreActiveTableInputFocus[\s\S]*?\) \{[\s\S]*?queueFocusTableCellInput\(update\.view, this\.activeTableCell\)/u)
  assert.match(source, /function exitTableFromKeyboardAction\([\s\S]*?input\.blur\(\)[\s\S]*?changes: \{ from: doc\.length, insert: '\\n' \}[\s\S]*?selection: \{ anchor: Math\.min\(resolved\.table\.to \+ 1, doc\.length\) \}/u)
})

test('CodeMirrorEditor keeps table width aligned with other source-mode block renderers instead of preview-specific gutter offsets', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /syncWysiwygTablePreviewInsets/u)
  assert.doesNotMatch(source, /--cm-wysiwyg-preview-inline-start/u)
  assert.doesNotMatch(source, /--cm-wysiwyg-preview-inline-end/u)
  assert.doesNotMatch(source, /shouldInsertTerminalBlankLineFromTableInput/u)
})

test('CodeMirrorEditor restores editor focus when a blank-line selection lands immediately below a table', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.match(source, /const scheduleTableExitFocusRestore = useCallback\(\(viewOverride\?: EditorView \| null\) => \{[\s\S]*?collectMarkdownTableBlocks\(view\.state\.doc\.toString\(\)\)[\s\S]*?isBlankLineBelowTableSelection\(view\.state\.doc, tables, selection\.head\)[\s\S]*?view\.focus\(\)/u)
  assert.match(
    source,
    /onSelectionChange: \(view, update\) => \{[\s\S]*?restorePendingDeleteKeyScroll\(view, update\)[\s\S]*?scheduleTableExitFocusRestore\(view\)/u
  )
})
