import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'
import { collectInactiveWysiwygTables } from '../src/components/Editor/wysiwygTable.ts'

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

test('collectInactiveWysiwygTables drops table rendering when the selection enters the source block', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| a | b |',
  ].join('\n')

  const tables = collectVisibleTables(markdown, markdown.indexOf('a'))

  assert.deepEqual(tables, [])
})

test('wysiwyg table integration uses a clickable table widget with preview-like styles', async () => {
  const source = await readFile(new URL('../src/components/Editor/wysiwyg.ts', import.meta.url), 'utf8')

  assert.match(source, /class TableWidget extends WidgetType/u)
  assert.match(source, /wrapper\.className = 'cm-wysiwyg-table'/u)
  assert.match(source, /wrapper\.dataset\.tableEditStart = String\(this\.table\.editAnchor\)/u)
  assert.match(source, /th\.dataset\.tableColumnKind = resolveTableColumnKind\(this\.table, index\)/u)
  assert.match(source, /td\.dataset\.tableColumnKind = resolveTableColumnKind\(this\.table, index\)/u)
  assert.match(source, /td\.dataset\.tableEditStart = String\(cell\.editAnchor\)/u)
  assert.match(source, /td\.dataset\.tableEditEnd = String\(cell\.editHead\)/u)
  assert.match(source, /renderInlineMarkdownFragment\(cell\.text\)/u)
  assert.match(source, /function resolveTableColumnKind\(table: MarkdownTableBlock, columnIndex: number\): 'text' \| 'numeric'/u)
  assert.ok(source.includes("function isCompactNumericCell(value: string): boolean {"))
  assert.ok(source.includes("(?:[$€£¥₹]\\s*)?"))
  assert.match(source, /function activateTable\(view: EditorView, target: EventTarget \| null\): boolean \{[\s\S]*closest<HTMLElement>\('\[data-table-edit-start\]'\)[\s\S]*selection: \{ anchor: editStart, head: editEnd \}/u)
  assert.match(source, /collectInactiveWysiwygTables\(view, tables\)/u)
  assert.match(source, /'\.cm-wysiwyg-table-anchor-line': \{[\s\S]*?padding: '0 !important'/u)
  assert.match(source, /'\.cm-wysiwyg-table-hidden-line': \{[\s\S]*?height: '0'[\s\S]*?fontSize: '0'/u)
  assert.match(source, /'\.cm-wysiwyg-table-gap-line': \{[\s\S]*?minHeight: '1\.15em'[\s\S]*?lineHeight: '1\.15'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__surface': \{[\s\S]*?margin: '0 16px'[\s\S]*?overflowX: 'auto'/u)
  assert.match(source, /'\.cm-wysiwyg-table__grid': \{[\s\S]*?tableLayout: 'auto'[\s\S]*?margin: '0'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table__head-cell, \.cm-wysiwyg-table__cell': \{[\s\S]*?padding: '8px 16px'[\s\S]*?whiteSpace: 'normal'[\s\S]*?overflowWrap: 'anywhere'[\s\S]*?color: 'var\(--preview-text\)'[\s\S]*?fontFamily: 'var\(--font-preview, Inter, system-ui, sans-serif\)'[\s\S]*?fontSize: 'inherit'/u)
  assert.match(source, /'\.cm-wysiwyg-table:hover \.cm-wysiwyg-table__surface': \{[\s\S]*?outline: '1px solid color-mix\(in srgb, var\(--border\) 74%, transparent\)'/u)
  assert.ok(source.includes(`'.cm-wysiwyg-table__head-cell[data-table-column-kind="numeric"], .cm-wysiwyg-table__cell[data-table-column-kind="numeric"]': {`))
  assert.ok(source.includes(`width: '1%'`))
  assert.ok(source.includes(`whiteSpace: 'nowrap'`))
})
