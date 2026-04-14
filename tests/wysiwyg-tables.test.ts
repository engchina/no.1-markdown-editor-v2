import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'
import {
  collectInactiveWysiwygTables,
  decodeMarkdownTableCellText,
  encodeMarkdownTableCellText,
  resolveAdjacentTableCellLocation,
  resolveNearestTableCellLocation,
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

test('wysiwyg table integration keeps the table rendered while exposing an inline cell editor', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class TableWidget extends WidgetType/u)
  assert.match(source, /wrapper\.className = 'cm-wysiwyg-table'/u)
  assert.match(source, /wrapper\.dataset\.tableEditStart = String\(table\.editAnchor\)/u)
  assert.match(source, /new TableWidget\(table, activeTableCellForTable\)/u)
  assert.match(source, /element\.dataset\.tableColumnKind = columnKind/u)
  assert.match(source, /element\.dataset\.tableEditStart = String\(cell\.editAnchor\)/u)
  assert.match(source, /input\.dataset\.tableEditStart = String\(cell\.editAnchor\)/u)
  assert.match(source, /renderInlineMarkdownFragment\(cell\.text\)/u)
  assert.match(source, /const ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS = new Map<number, readonly number\[\]>\(\)/u)
  assert.match(source, /function readRenderedTableColumnWidths\(target: HTMLElement \| null\): readonly number\[\] \| null/u)
  assert.match(source, /syncTableColumnWidthColGroup\(/u)
  assert.match(source, /input\.className = 'cm-wysiwyg-table__input'/u)
  assert.match(source, /input\.type = 'text'/u)
  assert.match(source, /decodeMarkdownTableCellText\(cell\.text\)/u)
  assert.match(source, /encodeMarkdownTableCellText\(input\.value\)/u)
  assert.match(source, /resolveAdjacentTableCellLocation\(resolved\.table, resolved\.location, direction\)/u)
  assert.match(source, /matchesWysiwygUndoShortcut\(event\)/u)
  assert.match(source, /matchesWysiwygRedoShortcut\(event\)/u)
  assert.match(source, /dispatchWysiwygHistory\('undo'\)/u)
  assert.match(source, /dispatchWysiwygHistory\('redo'\)/u)
  assert.match(source, /queueFocusTableCellInput\(view, nextActiveTableCell\)/u)
  assert.match(source, /function resolveTableColumnKind\(table: MarkdownTableBlock, columnIndex: number\): 'text' \| 'numeric'/u)
  assert.ok(source.includes("function isCompactNumericCell(value: string): boolean {"))
  assert.ok(source.includes("(?:[$€£¥₹]\\s*)?"))
  assert.match(source, /function activateTable\(view: EditorView, target: EventTarget \| null\): boolean \{/u)
  assert.match(source, /const wysiwygTableDecorationField = StateField\.define<WysiwygTableDecorationState>\(/u)
  assert.match(source, /EditorView\.decorations\.from\(field, \(value\) => value\.decorations\)/u)
  assert.match(source, /export const wysiwygTableDecorations = \[wysiwygTableDecorationField\]/u)
  assert.match(source, /Decoration\.replace\(\{ widget: new TableWidget\(table, activeTableCellForTable\), block: true \}\)/u)
  assert.match(source, /view\.dom\.classList\.toggle\(TABLE_EDITING_CLASS, this\.activeTableCell !== null\)/u)
  assert.match(source, /ACTIVE_TABLE_COLUMN_WIDTH_SNAPSHOTS\.set\(resolved\.table\.from, columnWidths\)/u)
  assert.match(source, /queueFocusTableCellInput\(view, nextActiveTableCell\)/u)
  assert.match(source, /'\.cm-wysiwyg-table-anchor-line': \{[\s\S]*?padding: '0 !important'/u)
  assert.match(source, /'\.cm-wysiwyg-table-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-table-gap-line': \{[\s\S]*?minHeight: '1\.15em'[\s\S]*?lineHeight: '1\.15'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table': \{[\s\S]*?display: 'block'[\s\S]*?width: '100%'[\s\S]*?boxSizing: 'border-box'/u)
  assert.match(source, /'\.cm-wysiwyg-table__surface': \{[\s\S]*?margin: '0 32px'[\s\S]*?overflowX: 'auto'/u)
  assert.match(source, /'\.cm-wysiwyg-table__grid': \{[\s\S]*?tableLayout: 'auto'[\s\S]*?margin: '0'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__head-cell, \.cm-wysiwyg-table__cell': \{[\s\S]*?padding: '8px 16px'[\s\S]*?whiteSpace: 'normal'[\s\S]*?overflowWrap: 'anywhere'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__cell--active': \{[\s\S]*?boxShadow:/u)
  assert.match(source, /'\.cm-wysiwyg-table-editing \.cm-cursor, \.cm-wysiwyg-table-editing \.cm-dropCursor': \{[\s\S]*?opacity: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-table__input': \{[\s\S]*?width: '100%'[\s\S]*?minWidth: '0'[\s\S]*?maxWidth: '100%'[\s\S]*?boxSizing: 'border-box'/u)
  assert.doesNotMatch(source, /'\.cm-wysiwyg-table:hover \.cm-wysiwyg-table__surface': \{/u)
  assert.ok(source.includes(`'.cm-wysiwyg-table__head-cell[data-table-column-kind="numeric"], .cm-wysiwyg-table__cell[data-table-column-kind="numeric"]': {`))
  assert.ok(source.includes(`width: '1%'`))
  assert.ok(source.includes(`whiteSpace: 'nowrap'`))
})

test('CodeMirrorEditor keeps table width aligned with other source-mode block renderers instead of preview-specific gutter offsets', async () => {
  const source = await readFile(new URL('../src/components/Editor/CodeMirrorEditor.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /syncWysiwygTablePreviewInsets/u)
  assert.doesNotMatch(source, /--cm-wysiwyg-preview-inline-start/u)
  assert.doesNotMatch(source, /--cm-wysiwyg-preview-inline-end/u)
})
