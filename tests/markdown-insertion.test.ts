import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareMarkdownInsertion } from '../src/lib/markdownInsertion.ts'

test('prepareMarkdownInsertion appends a newline when the inserted text does not end with one', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block'), {
    text: 'Pasted block\n',
    selectionOffset: 'Pasted block\n'.length,
  })
})

test('prepareMarkdownInsertion reuses an existing following newline and moves the cursor below the inserted block', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block', '\nNext paragraph'), {
    text: 'Pasted block',
    selectionOffset: 'Pasted block'.length + 1,
  })
})

test('prepareMarkdownInsertion preserves an existing trailing newline from the inserted content', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block\n'), {
    text: 'Pasted block\n',
    selectionOffset: 'Pasted block\n'.length,
  })
})

test('prepareMarkdownInsertion reuses CRLF line breaks without duplicating them', () => {
  assert.deepEqual(prepareMarkdownInsertion('Pasted block', '\r\nNext paragraph'), {
    text: 'Pasted block',
    selectionOffset: 'Pasted block'.length + 2,
  })
})
