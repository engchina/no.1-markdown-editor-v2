import assert from 'node:assert/strict'
import test from 'node:test'
import { collectFencedCodeBlocks } from '../src/components/Editor/fencedCodeRanges.ts'
import { collectMarkdownTableBlocks } from '../src/components/Editor/tableBlockRanges.ts'

test('collectMarkdownTableBlocks captures canonical markdown tables with alignments and row anchors', () => {
  const markdown = [
    '| Left | Center | Right |',
    '| :--- | :---: | ---: |',
    '| a | b | c |',
    '| d | e | f |',
  ].join('\n')

  const tables = collectMarkdownTableBlocks(markdown)

  assert.equal(tables.length, 1)
  assert.deepEqual(tables[0].header.cells.map((cell) => cell.text), ['Left', 'Center', 'Right'])
  assert.deepEqual(tables[0].alignments, ['left', 'center', 'right'])
  assert.deepEqual(tables[0].rows.map((row) => row.cells.map((cell) => cell.text)), [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ])
  assert.equal(tables[0].editAnchor, markdown.indexOf('Left'))
  assert.equal(tables[0].header.cells[0].editHead, markdown.indexOf('Left') + 'Left'.length)
  assert.equal(tables[0].rows[1].cells[2].editAnchor, markdown.lastIndexOf('f'))
  assert.equal(tables[0].rows[1].cells[2].editHead, markdown.lastIndexOf('f') + 1)
})

test('collectMarkdownTableBlocks supports compact tables without outer boundary pipes', () => {
  const markdown = [
    'Left | Right',
    '--- | ---:',
    'a | b',
  ].join('\n')

  const tables = collectMarkdownTableBlocks(markdown)

  assert.equal(tables.length, 1)
  assert.deepEqual(tables[0].header.cells.map((cell) => cell.text), ['Left', 'Right'])
  assert.deepEqual(tables[0].alignments, [null, 'right'])
})

test('collectMarkdownTableBlocks ignores invalid or fenced pipe blocks', () => {
  const invalid = [
    '| Left | Right |',
    '| a | b |',
  ].join('\n')

  assert.deepEqual(collectMarkdownTableBlocks(invalid), [])

  const fenced = [
    '```md',
    '| Left | Right |',
    '| --- | --- |',
    '| a | b |',
    '```',
  ].join('\n')

  assert.deepEqual(collectMarkdownTableBlocks(fenced, collectFencedCodeBlocks(fenced)), [])
})

test('collectMarkdownTableBlocks keeps escaped pipes inside a single cell', () => {
  const markdown = [
    '| Header | Notes |',
    '| --- | --- |',
    '| alpha | left \\| right |',
  ].join('\n')

  const tables = collectMarkdownTableBlocks(markdown)

  assert.equal(tables.length, 1)
  assert.equal(tables[0].rows[0].cells[1].text, 'left \\| right')
})

test('collectMarkdownTableBlocks preserves entity-encoded boundary spaces inside editable cells', () => {
  const markdown = [
    '| Header | Notes |',
    '| --- | --- |',
    '| alpha | &nbsp;beta&nbsp; |',
  ].join('\n')

  const tables = collectMarkdownTableBlocks(markdown)
  const cell = tables[0]?.rows[0]?.cells[1]

  assert.equal(tables.length, 1)
  assert.ok(cell)
  assert.equal(cell.text, '&nbsp;beta&nbsp;')
  assert.equal(cell.editAnchor, markdown.indexOf('&nbsp;beta&nbsp;'))
  assert.equal(cell.editHead, markdown.indexOf('&nbsp;beta&nbsp;') + '&nbsp;beta&nbsp;'.length)
})

test('collectMarkdownTableBlocks preserves fully empty body rows so WYSIWYG table row insertion stays editable', () => {
  const markdown = [
    '| Left | Right |',
    '| --- | ---: |',
    '| alpha | beta |',
    '|  |  |',
    '| gamma | delta |',
  ].join('\n')

  const tables = collectMarkdownTableBlocks(markdown)

  assert.equal(tables.length, 1)
  assert.equal(tables[0].rows.length, 3)
  assert.deepEqual(tables[0].rows[1].cells.map((cell) => cell.text), ['', ''])
})
