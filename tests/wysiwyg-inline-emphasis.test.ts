import assert from 'node:assert/strict'
import test from 'node:test'
import { findInlineItalicRanges } from '../src/components/Editor/wysiwygInlineEmphasis.ts'

test('findInlineItalicRanges detects single underscore emphasis', () => {
  assert.deepEqual(findInlineItalicRanges('_single underscores_'), [
    {
      from: 0,
      to: 20,
      contentFrom: 1,
      contentTo: 19,
    },
  ])
})

test('findInlineItalicRanges keeps intra-word underscores literal', () => {
  assert.deepEqual(findInlineItalicRanges('DBMS_CLOUD'), [])
})

test('findInlineItalicRanges keeps single-asterisk emphasis working', () => {
  assert.deepEqual(findInlineItalicRanges('*single asterisks*'), [
    {
      from: 0,
      to: 18,
      contentFrom: 1,
      contentTo: 17,
    },
  ])
})

test('findInlineItalicRanges ignores italic markers inside inline code spans', () => {
  assert.deepEqual(findInlineItalicRanges('`*literal*`'), [])
})

test('findInlineItalicRanges still supports outer emphasis that contains inline code spans', () => {
  assert.deepEqual(findInlineItalicRanges('*before `code` after*'), [
    {
      from: 0,
      to: 21,
      contentFrom: 1,
      contentTo: 20,
    },
  ])
})

test('findInlineItalicRanges keeps escaped asterisks literal', () => {
  assert.deepEqual(findInlineItalicRanges(String.raw`\*this text is surrounded by literal asterisks\*`), [])
})

test('findInlineItalicRanges keeps thematic breaks out of italic rendering', () => {
  assert.deepEqual(findInlineItalicRanges('***'), [])
  assert.deepEqual(findInlineItalicRanges('* * *'), [])
  assert.deepEqual(findInlineItalicRanges('  * * *'), [])
})
